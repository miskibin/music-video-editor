"""WhisperX alignment. Uses CUDA when `torch.cuda.is_available()` (install CUDA PyTorch from pytorch.org).

Env: ``WHISPERX_DEVICE`` (cuda|cpu), ``WHISPERX_GPU_INDEX`` (default 0), ``WHISPERX_MODEL`` (default base),
``WHISPERX_BATCH_SIZE`` (default 16).
"""
from __future__ import annotations

import os
import subprocess
import tempfile
from typing import Any, Literal

from loguru import logger

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

        align_key = (language, device, device_index)
        if align_key not in _align_model_cache:
            logger.info("Loading align model for {}", language)
            align_model, align_metadata = whisperx.load_align_model(language_code=language, device=device)
            _align_model_cache[align_key] = (align_model, align_metadata)

        align_model, align_metadata = _align_model_cache[align_key]
        aligned = whisperx.align(
            result["segments"],
            align_model,
            align_metadata,
            audio_np,
            device,
            return_char_alignments=False,
        )
        return aligned
    finally:
        os.unlink(excerpt_wav)
