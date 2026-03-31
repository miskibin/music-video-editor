"""WhisperX alignment. Uses CUDA when `torch.cuda.is_available()` (install CUDA PyTorch from pytorch.org).

Env: ``WHISPERX_DEVICE`` (cuda|cpu), ``WHISPERX_GPU_INDEX`` (default 0), ``WHISPERX_MODEL`` (default base),
``WHISPERX_BATCH_SIZE`` (default 16).

**Reference lyrics (accurate path):** ``whisperx.align`` aligns each VAD segment's *text* to that slice of audio.
We replace Whisper's transcript per segment with *your* words mapped via difflib to Whisper's words in that
segment, so wav2vec2 aligns your spelling to the waveform (not Whisper's misheard singing).

Set ``WHISPERX_USE_REFERENCE_SEGMENTS=0`` to disable and use Whisper's text (legacy).
"""
from __future__ import annotations

import os
import re
import subprocess
import tempfile
from difflib import SequenceMatcher
from typing import Any, Literal

from loguru import logger

from subtitle_common import extract_words

_whisper_pipeline_cache: dict[tuple[str, str, int, str], object] = {}
_align_model_cache: dict[tuple[str, str], tuple[object, dict]] = {}


def _resolve_torch_device() -> tuple[str, int]:
    """Pick torch device for WhisperX. Prefer CUDA when available; honor WHISPERX_DEVICE / WHISPERX_GPU_INDEX."""
    import torch

    idx = max(0, int(os.environ.get("WHISPERX_GPU_INDEX", "0")))
    override = os.environ.get("WHISPERX_DEVICE", "").strip().lower()

    if override == "cpu":
        logger.info("WhisperX device: CPU (WHISPERX_DEVICE=cpu)")
        return ("cpu", 0)

    if override == "cuda":
        if not torch.cuda.is_available():
            raise RuntimeError(
                "WHISPERX_DEVICE=cuda but PyTorch has no CUDA. Install the CUDA build: https://pytorch.org/get-started/locally/"
            )
        name = torch.cuda.get_device_name(idx)
        logger.info("WhisperX device: CUDA:{} ({})", idx, name)
        return ("cuda", idx)

    if torch.cuda.is_available():
        name = torch.cuda.get_device_name(idx)
        logger.info("WhisperX device: CUDA:{} ({})", idx, name)
        return ("cuda", idx)

    logger.info("WhisperX device: CPU (no CUDA torch; install CUDA PyTorch to use GPU)")
    return ("cpu", 0)


def _get_whisper_model_name() -> str:
    return os.environ.get("WHISPERX_MODEL", "base").strip() or "base"


def _norm_token(w: str) -> str:
    return re.sub(r"[^a-z0-9]", "", w.lower())


def _map_user_to_whisper_flat(user_words: list[str], whisper_flat: list[str]) -> list[int | None]:
    """Map each user word to an index into whisper_flat, or None if unmatched (insert/delete)."""
    if not user_words:
        return []
    if not whisper_flat:
        return [None] * len(user_words)

    a = [_norm_token(w) for w in user_words]
    b = [_norm_token(w) for w in whisper_flat]
    matcher = SequenceMatcher(None, a, b, autojunk=False)
    out: list[int | None] = [None] * len(user_words)

    for tag, i1, i2, j1, j2 in matcher.get_opcodes():
        if tag == "equal":
            for k in range(i2 - i1):
                out[i1 + k] = j1 + k
        elif tag == "replace":
            nu, na = i2 - i1, j2 - j1
            if nu <= 0 or na <= 0:
                continue
            for k in range(nu):
                j_idx = j1 + min(int((k + 0.5) * na / nu), na - 1)
                out[i1 + k] = j_idx

    return out


def _fill_segment_assignment(mapped_seg: list[int | None], num_segments: int) -> list[int]:
    """Interpolate missing segment indices (each user word -> which VAD segment)."""
    n = len(mapped_seg)
    if n == 0:
        return []
    out: list[int] = [0] * n
    for i in range(n):
        if mapped_seg[i] is not None:
            out[i] = int(mapped_seg[i])
    for i in range(n):
        if mapped_seg[i] is not None:
            continue
        lo = i - 1
        while lo >= 0 and mapped_seg[lo] is None:
            lo -= 1
        hi = i + 1
        while hi < n and mapped_seg[hi] is None:
            hi += 1
        lo_s = float(mapped_seg[lo]) if lo >= 0 else 0.0
        hi_s = float(mapped_seg[hi]) if hi < n else float(num_segments - 1)
        gap = hi - lo - 1
        pos = i - lo
        if gap <= 0:
            seg_f = lo_s
        else:
            seg_f = lo_s + (hi_s - lo_s) * (pos / (gap + 1))
        out[i] = int(round(max(0.0, min(float(num_segments - 1), seg_f))))
    return out


def _inject_reference_text_into_segments(
    vad_segments: list[dict[str, Any]],
    source_text: str,
) -> list[dict[str, Any]]:
    """
    Replace each segment's ``text`` with the user's lyric words that correspond to that
    VAD slice's Whisper words (via sequence alignment). ``whisperx.align`` then aligns *that* text.
    """
    user_words = extract_words(source_text)
    if not user_words:
        return vad_segments

    whisper_flat: list[str] = []
    seg_word_ranges: list[tuple[int, int]] = []
    for seg in vad_segments:
        w = extract_words(str(seg.get("text", "")))
        start = len(whisper_flat)
        whisper_flat.extend(w)
        seg_word_ranges.append((start, len(whisper_flat)))

    if not whisper_flat:
        return vad_segments

    user_to_w = _map_user_to_whisper_flat(user_words, whisper_flat)
    # Global whisper index -> VAD segment index
    def _seg_for_global_j(j: int) -> int:
        for si, (a, b) in enumerate(seg_word_ranges):
            if a <= j < b:
                return si
        return len(seg_word_ranges) - 1

    mapped_seg: list[int | None] = []
    for i in range(len(user_words)):
        if user_to_w[i] is None:
            mapped_seg.append(None)
        else:
            mapped_seg.append(_seg_for_global_j(user_to_w[i]))

    num_segments = len(vad_segments)
    filled_seg = _fill_segment_assignment(mapped_seg, num_segments)

    buckets: list[list[int]] = [[] for _ in range(num_segments)]
    for ui, sk in enumerate(filled_seg):
        sk = max(0, min(num_segments - 1, sk))
        buckets[sk].append(ui)

    new_segments: list[dict[str, Any]] = []
    for k, seg in enumerate(vad_segments):
        idxs = sorted(buckets[k])
        if idxs:
            text = " ".join(user_words[i] for i in idxs)
        else:
            text = str(seg.get("text", ""))
        new_seg = {**seg, "text": text}
        new_segments.append(new_seg)

    logger.info(
        "Reference segment text: {} VAD segments, {} user words, {} Whisper words",
        num_segments,
        len(user_words),
        len(whisper_flat),
    )
    return new_segments


def _extract_segment_wav(input_path: str, start_sec: float, end_sec: float, output_wav: str) -> None:
    duration = max(end_sec - start_sec, 0.05)
    subprocess.run(
        [
            "ffmpeg",
            "-y",
            "-hide_banner",
            "-loglevel",
            "error",
            "-i",
            input_path,
            "-ss",
            str(start_sec),
            "-t",
            str(duration),
            "-ac",
            "1",
            "-ar",
            "16000",
            "-f",
            "wav",
            output_wav,
        ],
        check=True,
        capture_output=True,
    )


def run_whisperx_alignment(
    audio_path: str,
    language: Literal["en", "pl"],
    source_text: str,
    excerpt_start_sec: float,
    excerpt_end_sec: float,
) -> dict[str, Any]:
    """Whisper transcribe + wav2vec2 align. Returns whisperx `align` result (`segments`, `word_segments`)."""
    import whisperx

    device, device_index = _resolve_torch_device()
    model_name = _get_whisper_model_name()
    batch_size = int(os.environ.get("WHISPERX_BATCH_SIZE", "16"))

    with tempfile.NamedTemporaryFile(suffix=".wav", delete=False) as tmp:
        excerpt_wav = tmp.name

    _extract_segment_wav(audio_path, excerpt_start_sec, excerpt_end_sec, excerpt_wav)

    try:
        audio_np = whisperx.load_audio(excerpt_wav)

        cache_key = (model_name, device, device_index, language)
        if cache_key not in _whisper_pipeline_cache:
            logger.info("Loading WhisperX ASR model {} on {}", model_name, device)
            _whisper_pipeline_cache[cache_key] = whisperx.load_model(
                model_name,
                device,
                device_index=device_index,
                language=language,
                compute_type="default",
                vad_method="silero",
                asr_options={"initial_prompt": source_text[:224]},
            )

        model = _whisper_pipeline_cache[cache_key]
        result = model.transcribe(audio_np, batch_size=batch_size, language=language)

        segments = result["segments"]
        use_ref = os.environ.get("WHISPERX_USE_REFERENCE_SEGMENTS", "1").strip().lower() not in (
            "0",
            "false",
            "no",
        )
        if use_ref:
            segments = _inject_reference_text_into_segments(segments, source_text)

        align_key = (language, device, device_index)
        if align_key not in _align_model_cache:
            logger.info("Loading align model for {}", language)
            align_model, align_metadata = whisperx.load_align_model(language_code=language, device=device)
            _align_model_cache[align_key] = (align_model, align_metadata)

        align_model, align_metadata = _align_model_cache[align_key]
        aligned = whisperx.align(
            segments,
            align_model,
            align_metadata,
            audio_np,
            device,
            return_char_alignments=False,
        )
        return aligned
    finally:
        os.unlink(excerpt_wav)
