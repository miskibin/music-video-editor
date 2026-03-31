"""Split lyrics into cues and word tokens (same rules for alignment + display)."""

from __future__ import annotations

import re

WORD_PATTERN = re.compile(r"[0-9A-Za-zÀ-ž]+(?:['’-][0-9A-Za-zÀ-ž]+)?", re.UNICODE)


def normalize_whitespace(text: str) -> str:
    return re.sub(r"\s+", " ", text).strip()


def extract_words(text: str) -> list[str]:
    return WORD_PATTERN.findall(text)


def build_cue_texts_from_lines(source_text: str) -> list[str]:
    """
    One cue per non-empty line, preserving verses / lines as the user pasted them.
    Blank lines are skipped; leading/trailing space on each line is normalized.
    """
    stripped_lines = [normalize_whitespace(line) for line in source_text.splitlines()]
    cue_texts = [line for line in stripped_lines if line]
    if cue_texts:
        return cue_texts
    normalized = normalize_whitespace(source_text)
    return [normalized] if normalized else []


def cue_word_index_ranges(source_text: str, excerpt_duration: float) -> list[tuple[int, int]]:
    """
    For each non-empty lyric line (verse line), return [start, end) indices into
    ``extract_words(source_text)``.

    ``excerpt_duration`` is accepted for API compatibility and ignored; cues always
    follow uploaded line breaks.
    """
    _ = excerpt_duration
    user_words = extract_words(source_text)
    cue_texts = build_cue_texts_from_lines(source_text)
    ranges: list[tuple[int, int]] = []
    i = 0
    for ct in cue_texts:
        words_in_cue = extract_words(ct)
        n = len(words_in_cue)
        if i + n > len(user_words) or user_words[i : i + n] != words_in_cue:
            raise ValueError(
                "Lyric cue split does not match full lyrics tokenization. "
                "Check line breaks and that merged cues still match extract_words order.",
            )
        ranges.append((i, i + n))
        i += n
    if i != len(user_words):
        raise ValueError("Cue word count does not cover all lyrics words.")
    return ranges
