"""Split lyrics into cues and word tokens (same rules for alignment + display)."""

from __future__ import annotations

import math
import re

WORD_PATTERN = re.compile(r"[0-9A-Za-zÀ-ž]+(?:['’-][0-9A-Za-zÀ-ž]+)?", re.UNICODE)


def normalize_whitespace(text: str) -> str:
    return re.sub(r"\s+", " ", text).strip()


def extract_words(text: str) -> list[str]:
    return WORD_PATTERN.findall(text)


def build_cue_texts(source_text: str, excerpt_duration: float) -> list[str]:
    stripped_lines = [normalize_whitespace(line) for line in source_text.splitlines()]
    cue_texts = [line for line in stripped_lines if line]

    if len(cue_texts) <= 1:
        normalized_text = normalize_whitespace(source_text)
        sentence_split = [segment.strip() for segment in re.split(r"(?<=[.!?])\s+", normalized_text) if segment.strip()]
        cue_texts = sentence_split if len(sentence_split) > 1 else []

    if not cue_texts:
        words = extract_words(source_text)
        cue_texts = [" ".join(words[index:index + 6]) for index in range(0, len(words), 6)]

    max_cues = max(1, int(max(1, math.floor(excerpt_duration))))
    if len(cue_texts) <= max_cues:
        return cue_texts

    merge_size = math.ceil(len(cue_texts) / max_cues)
    return [
        " ".join(cue_texts[index:index + merge_size])
        for index in range(0, len(cue_texts), merge_size)
    ]
