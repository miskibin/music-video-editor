"""Map WhisperX ASR word timings onto the user's lyric words (text unchanged)."""

from __future__ import annotations

import re
from difflib import SequenceMatcher

from subtitle_common import extract_words


def _norm_token(w: str) -> str:
    return re.sub(r"[^a-z0-9]", "", w.lower())


def _map_user_to_asr(user_words: list[str], asr_words: list[dict]) -> list[dict | None]:
    if not user_words:
        return []
    if not asr_words:
        return [None] * len(user_words)

    a = [_norm_token(w) for w in user_words]
    b = [_norm_token(str(w.get("word", ""))) for w in asr_words]
    matcher = SequenceMatcher(None, a, b, autojunk=False)
    out: list[dict | None] = [None] * len(user_words)

    for tag, i1, i2, j1, j2 in matcher.get_opcodes():
        if tag == "equal":
            for k in range(i2 - i1):
                out[i1 + k] = asr_words[j1 + k]
        elif tag == "replace":
            nu, na = i2 - i1, j2 - j1
            if nu <= 0 or na <= 0:
                continue
            for k in range(nu):
                j_idx = j1 + min(int((k + 0.5) * na / nu), na - 1)
                out[i1 + k] = asr_words[j_idx]

    return out


def _fill_timings(mapped: list[dict | None], excerpt_duration_sec: float) -> list[tuple[float, float, float]]:
    n = len(mapped)
    starts: list[float | None] = [None] * n
    ends: list[float | None] = [None] * n
    scores: list[float] = [0.35] * n

    for i, m in enumerate(mapped):
        if m is not None:
            starts[i] = float(m["start"])
            ends[i] = float(m["end"])
            scores[i] = float(m.get("score", 0.75))

    for i in range(n):
        if starts[i] is not None:
            continue
        lo = i - 1
        while lo >= 0 and starts[lo] is None:
            lo -= 1
        hi = i + 1
        while hi < n and starts[hi] is None:
            hi += 1
        lo_t = 0.0 if lo < 0 else float(ends[lo] if ends[lo] is not None else starts[lo])
        hi_t = excerpt_duration_sec if hi >= n else float(starts[hi])
        gap = hi - lo - 1
        pos = i - lo
        if gap <= 0:
            continue
        span = max(hi_t - lo_t, 0.05)
        starts[i] = lo_t + span * pos / (gap + 1)
        ends[i] = lo_t + span * (pos + 1) / (gap + 1)
        scores[i] = 0.42

    out: list[tuple[float, float, float]] = []
    for i in range(n):
        if starts[i] is None or ends[i] is None:
            step = excerpt_duration_sec / max(n, 1)
            s = i * step
            e = (i + 1) * step
            out.append((float(s), float(max(e, s + 0.02)), 0.35))
        else:
            out.append((float(starts[i]), float(max(ends[i], starts[i] + 0.02)), float(scores[i])))
    return out


def user_word_timings(
    source_text: str,
    aligned: dict,
    excerpt_duration_sec: float,
) -> list[tuple[str, float, float, float]]:
    """
    For each word token from ``sourceText`` (via ``extract_words``), return
    (exact word text, start_sec, end_sec, confidence) relative to excerpt t=0.
    Timings come from WhisperX ASR words; text is always from the user.
    """
    user_words = extract_words(source_text)
    if not user_words:
        raise ValueError("Lyrics must contain at least one word.")

    asr_words: list[dict] = list(aligned.get("word_segments") or [])
    mapped = _map_user_to_asr(user_words, asr_words)
    timings = _fill_timings(mapped, excerpt_duration_sec)

    return [
        (user_words[i], timings[i][0], timings[i][1], timings[i][2])
        for i in range(len(user_words))
    ]
