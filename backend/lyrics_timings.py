"""Map WhisperX ASR word timings onto the user's lyric words (text unchanged)."""

from __future__ import annotations

import math
import re
from difflib import SequenceMatcher
from statistics import median

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


def _allocate_proportional_counts(n: int, weights: list[float]) -> list[int]:
    """Split n into len(weights) non-negative integers proportional to weights; sum equals n."""
    if not weights or n <= 0:
        return [0] * len(weights)
    total = sum(weights)
    if total <= 0:
        return [0] * len(weights)
    raw = [n * w / total for w in weights]
    floors = [math.floor(x) for x in raw]
    counts = list(floors)
    rem = n - sum(counts)
    order = sorted(range(len(weights)), key=lambda i: raw[i] - floors[i], reverse=True)
    for i in range(rem):
        counts[order[i % len(order)]] += 1
    return counts


def _span_sec(rows: list[tuple[str, float, float, float]]) -> float:
    if len(rows) < 2:
        return 0.0
    return float(rows[-1][2] - rows[0][1])


def _matcher_timeline_suspicious(
    rows: list[tuple[str, float, float, float]],
    excerpt_duration_sec: float,
) -> bool:
    """True when difflib mapping squashed most lyrics into a short slice of the excerpt."""
    if len(rows) < 12 or excerpt_duration_sec < 12.0:
        return False
    span = _span_sec(rows)
    if span < excerpt_duration_sec * 0.22:
        return True
    durs = [max(0.0, r[2] - r[1]) for r in rows]
    med = median(durs) if durs else 0.0
    return med < 0.045 and len(rows) > 24


def _timings_from_whisper_segments(
    user_words: list[str],
    aligned: dict,
    excerpt_duration_sec: float,
) -> list[tuple[str, float, float, float]] | None:
    """
    Spread user words across Whisper segment [start,end] intervals in order, proportional
    to each segment's duration. Used when ASR word-level matching compresses the timeline.
    """
    segs = aligned.get("segments") or []
    if not segs:
        return None

    intervals: list[tuple[float, float]] = []
    for seg in segs:
        t1 = float(seg.get("start", 0.0))
        t2 = float(seg.get("end", 0.0))
        t1 = max(0.0, min(t1, excerpt_duration_sec))
        t2 = max(0.0, min(t2, excerpt_duration_sec))
        if t2 > t1 + 1e-6:
            intervals.append((t1, t2))

    if not intervals:
        return None

    intervals.sort(key=lambda x: x[0])
    n = len(user_words)
    weights = [e - s for s, e in intervals]
    total_w = sum(weights)
    if total_w < 0.05:
        return None

    counts = _allocate_proportional_counts(n, weights)
    out: list[tuple[str, float, float, float]] = []
    wi = 0
    for (s, e), nk in zip(intervals, counts, strict=True):
        span = e - s
        for k in range(nk):
            if wi >= n:
                break
            t0 = s + span * k / nk
            t1 = s + span * (k + 1) / nk
            out.append((user_words[wi], t0, t1, 0.48))
            wi += 1
    while wi < n:
        ls, le = intervals[-1]
        out.append((user_words[wi], ls, min(le, ls + 0.08), 0.35))
        wi += 1
    return out


def _split_shared_spans(
    rows: list[tuple[str, float, float, float]],
) -> list[tuple[str, float, float, float]]:
    """Give distinct times to consecutive words that share the same [start,end)."""
    if not rows:
        return rows
    result: list[tuple[str, float, float, float]] = []
    i = 0
    n = len(rows)
    while i < n:
        w, s, e, c = rows[i]
        j = i + 1
        while j < n:
            w2, s2, e2, _ = rows[j]
            if abs(s2 - s) > 1e-4 or abs(e2 - e) > 1e-4:
                break
            j += 1
        run_len = j - i
        if run_len > 1 and e > s + 1e-6:
            chunk = (e - s) / run_len
            for k in range(run_len):
                word, _, _, conf = rows[i + k]
                ns = s + k * chunk
                ne = s + (k + 1) * chunk
                result.append((word, ns, ne, conf))
        else:
            for k in range(run_len):
                result.append(rows[i + k])
        i = j
    return result


def _enforce_monotonic_nonoverlap(
    rows: list[tuple[str, float, float, float]],
    min_dur: float = 0.02,
) -> list[tuple[str, float, float, float]]:
    """Ensure lyric-order monotonicity: each word starts at or after the previous end."""
    if not rows:
        return rows
    out: list[tuple[str, float, float, float]] = []
    prev_end = -1.0
    for w, s, e, c in rows:
        s = max(s, prev_end)
        if e < s + min_dur:
            e = s + min_dur
        out.append((w, s, e, c))
        prev_end = e
    return out


def _clip_times_to_excerpt(
    rows: list[tuple[str, float, float, float]],
    excerpt_duration_sec: float,
) -> list[tuple[str, float, float, float]]:
    out: list[tuple[str, float, float, float]] = []
    for w, s, e, c in rows:
        s = max(0.0, min(s, excerpt_duration_sec))
        e = max(s, min(e, excerpt_duration_sec))
        out.append((w, s, e, c))
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
) -> tuple[list[tuple[str, float, float, float]], list[str]]:
    """
    For each word token from ``sourceText`` (via ``extract_words``), return
    (exact word text, start_sec, end_sec, confidence) relative to excerpt t=0.
    Timings come from WhisperX ASR words; text is always from the user.

    When Whisper's transcript differs a lot from the user's lyrics (common with singing),
    difflib can squash many user words onto one second of ASR time. In that case we fall
    back to spreading words across Whisper segment boundaries (still wrong per-word, but
    the timeline is not compressed to ~1s).

    Returns (rows, extra_warnings).
    """
    user_words = extract_words(source_text)
    if not user_words:
        raise ValueError("Lyrics must contain at least one word.")

    warnings: list[str] = []

    asr_words: list[dict] = list(aligned.get("word_segments") or [])
    # Fast path: wav2vec2 aligned the user's tokens 1:1 (reference segment text in whisperx_align).
    if len(asr_words) == len(user_words):
        aw = [_norm_token(str(w.get("word", ""))) for w in asr_words]
        uw = [_norm_token(w) for w in user_words]
        if aw == uw:
            rows = [
                (
                    user_words[i],
                    float(asr_words[i]["start"]),
                    float(max(asr_words[i]["end"], asr_words[i]["start"] + 0.02)),
                    float(asr_words[i].get("score", 0.75)),
                )
                for i in range(len(user_words))
            ]
            rows = _split_shared_spans(rows)
            rows = _enforce_monotonic_nonoverlap(rows)
            rows = _clip_times_to_excerpt(rows, excerpt_duration_sec)
            return rows, warnings

    mapped = _map_user_to_asr(user_words, asr_words)
    timings = _fill_timings(mapped, excerpt_duration_sec)

    rows: list[tuple[str, float, float, float]] = [
        (user_words[i], timings[i][0], timings[i][1], timings[i][2])
        for i in range(len(user_words))
    ]

    if _matcher_timeline_suspicious(rows, excerpt_duration_sec):
        fallback = _timings_from_whisper_segments(user_words, aligned, excerpt_duration_sec)
        if fallback is not None:
            warnings.append(
                "Lyrics did not match the ASR transcript closely (typical for singing). "
                "Word times were spread across Whisper speech segments instead of ASR word matches; "
                "review and tweak timings in the editor.",
            )
            rows = fallback

    rows = _split_shared_spans(rows)
    rows = _enforce_monotonic_nonoverlap(rows)
    rows = _clip_times_to_excerpt(rows, excerpt_duration_sec)
    return rows, warnings
