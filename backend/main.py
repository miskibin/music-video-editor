from __future__ import annotations

import math
import re
from datetime import datetime, timezone
from typing import Literal
from uuid import uuid4

from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from loguru import logger
from pydantic import BaseModel, Field, model_validator


CONFIDENCE_THRESHOLD = 0.55
WORD_PATTERN = re.compile(r"[0-9A-Za-zÀ-ž]+(?:['’-][0-9A-Za-zÀ-ž]+)?", re.UNICODE)


class SubtitleAlignmentRequest(BaseModel):
    language: Literal["en", "pl"]
    excerptStart: float = Field(ge=0)
    excerptEnd: float = Field(gt=0)
    sourceText: str = Field(min_length=1, max_length=20000)

    @model_validator(mode="after")
    def validate_excerpt_range(self) -> "SubtitleAlignmentRequest":
        if self.excerptEnd <= self.excerptStart:
            raise ValueError("excerptEnd must be greater than excerptStart.")

        return self


class SubtitleWordResponse(BaseModel):
    id: str
    text: str
    startMs: int
    endMs: int
    confidence: float | None


class SubtitleCueResponse(BaseModel):
    id: str
    start: float
    duration: float
    text: str
    words: list[SubtitleWordResponse]


class SubtitleAlignmentResponse(BaseModel):
    provider: str
    generatedAt: str
    warnings: list[str]
    lowConfidenceWordIds: list[str]
    cues: list[SubtitleCueResponse]


app = FastAPI(title="Music Video Backend", version="0.1.0")

app.add_middleware(
    CORSMiddleware,
    allow_origins=[
        "http://127.0.0.1:3000",
        "http://localhost:3000",
        "http://127.0.0.1:3001",
        "http://localhost:3001",
    ],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


def _normalize_whitespace(text: str) -> str:
    return re.sub(r"\s+", " ", text).strip()


def _extract_words(text: str) -> list[str]:
    return WORD_PATTERN.findall(text)


def _build_cue_texts(source_text: str, excerpt_duration: float) -> list[str]:
    stripped_lines = [_normalize_whitespace(line) for line in source_text.splitlines()]
    cue_texts = [line for line in stripped_lines if line]

    if len(cue_texts) <= 1:
        normalized_text = _normalize_whitespace(source_text)
        sentence_split = [segment.strip() for segment in re.split(r"(?<=[.!?])\s+", normalized_text) if segment.strip()]
        cue_texts = sentence_split if len(sentence_split) > 1 else []

    if not cue_texts:
        words = _extract_words(source_text)
        cue_texts = [" ".join(words[index:index + 6]) for index in range(0, len(words), 6)]

    max_cues = max(1, int(max(1, math.floor(excerpt_duration))))
    if len(cue_texts) <= max_cues:
        return cue_texts

    merge_size = math.ceil(len(cue_texts) / max_cues)
    return [
        " ".join(cue_texts[index:index + merge_size])
        for index in range(0, len(cue_texts), merge_size)
    ]


def _score_word(word: str) -> float:
    score = 0.68
    normalized = word.replace("'", "").replace("’", "").replace("-", "")

    if len(normalized) <= 2:
        score -= 0.12
    if any(character.isdigit() for character in normalized):
        score -= 0.18
    if not normalized.isalpha():
        score -= 0.08

    return round(max(0.35, min(score, 0.88)), 2)


def _align_lyrics(request: SubtitleAlignmentRequest) -> SubtitleAlignmentResponse:
    cue_texts = _build_cue_texts(request.sourceText, request.excerptEnd - request.excerptStart)
    if not cue_texts:
        raise HTTPException(status_code=400, detail="No lyrics could be extracted from sourceText.")

    cue_words = [_extract_words(cue_text) for cue_text in cue_texts]
    total_word_count = sum(len(words) for words in cue_words)
    if total_word_count == 0:
        raise HTTPException(status_code=400, detail="Lyrics must contain at least one word.")

    excerpt_start_ms = round(request.excerptStart * 1000)
    excerpt_end_ms = round(request.excerptEnd * 1000)
    total_duration_ms = max(excerpt_end_ms - excerpt_start_ms, 1000)
    base_word_duration_ms = total_duration_ms / total_word_count

    current_ms = excerpt_start_ms
    processed_word_count = 0
    low_confidence_word_ids: list[str] = []
    cues: list[SubtitleCueResponse] = []

    for cue_index, words in enumerate(cue_words):
        if not words:
            continue

        cue_start_ms = current_ms
        aligned_words: list[SubtitleWordResponse] = []

        for word_index, word in enumerate(words):
            processed_word_count += 1
            word_start_ms = current_ms
            if processed_word_count == total_word_count:
                word_end_ms = excerpt_end_ms
            else:
                current_ms = excerpt_start_ms + round(processed_word_count * base_word_duration_ms)
                word_end_ms = current_ms

            confidence = _score_word(word)
            word_id = uuid4().hex[:10]
            if confidence < CONFIDENCE_THRESHOLD:
                low_confidence_word_ids.append(word_id)

            aligned_words.append(
                SubtitleWordResponse(
                    id=word_id,
                    text=word,
                    startMs=word_start_ms,
                    endMs=max(word_end_ms, word_start_ms + 1),
                    confidence=confidence,
                )
            )

        cue_end_ms = aligned_words[-1].endMs
        cues.append(
            SubtitleCueResponse(
                id=uuid4().hex[:10],
                start=round(cue_start_ms / 1000, 3),
                duration=round(max((cue_end_ms - cue_start_ms) / 1000, 1.0), 3),
                text=" ".join(word.text for word in aligned_words),
                words=aligned_words,
            )
        )

    return SubtitleAlignmentResponse(
        provider="lyric-sync-draft-heuristic",
        generatedAt=datetime.now(timezone.utc).isoformat(),
        warnings=[
            "Lyric Sync currently uses a draft heuristic aligner based on provided lyrics and excerpt duration. Replace it with a real audio aligner in the next backend iteration.",
        ],
        lowConfidenceWordIds=low_confidence_word_ids,
        cues=cues,
    )


@app.get("/api/health")
def healthcheck() -> dict[str, str]:
    return {"status": "ok"}


@app.post("/api/lyric-sync/subtitles/align", response_model=SubtitleAlignmentResponse)
def align_subtitles(request: SubtitleAlignmentRequest) -> SubtitleAlignmentResponse:
    logger.info(
        "Lyric Sync subtitle alignment request received: language={}, excerpt={}s-{}s",
        request.language,
        request.excerptStart,
        request.excerptEnd,
    )
    return _align_lyrics(request)


if __name__ == "__main__":
    __import__("uvicorn").run(app, host="127.0.0.1", port=8000)
