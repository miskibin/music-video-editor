from __future__ import annotations

import os
import tempfile
from datetime import datetime, timezone
from pathlib import Path
from typing import Literal
from uuid import uuid4

from fastapi import FastAPI, HTTPException, Request
from starlette.datastructures import UploadFile
from fastapi.middleware.cors import CORSMiddleware
from loguru import logger
from pydantic import BaseModel, Field, ValidationError, model_validator


CONFIDENCE_THRESHOLD = 0.55


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


def _align_subtitles(request: SubtitleAlignmentRequest, audio_path: str) -> SubtitleAlignmentResponse:
    from lyrics_timings import user_word_timings
    from subtitle_common import build_cue_texts, extract_words
    from whisperx_align import run_whisperx_alignment

    excerpt_duration = request.excerptEnd - request.excerptStart
    excerpt_start_ms = round(request.excerptStart * 1000)
    excerpt_end_ms = round(request.excerptEnd * 1000)

    aligned = run_whisperx_alignment(
        audio_path,
        request.language,
        request.sourceText,
        request.excerptStart,
        request.excerptEnd,
    )

    word_rows = user_word_timings(request.sourceText, aligned, excerpt_duration)

    cue_texts = build_cue_texts(request.sourceText, excerpt_duration)
    if not cue_texts:
        raise HTTPException(status_code=400, detail="No lyrics could be extracted from sourceText.")

    cue_words = [extract_words(cue_text) for cue_text in cue_texts]
    total_word_count = sum(len(words) for words in cue_words)
    if total_word_count != len(word_rows):
        raise HTTPException(status_code=500, detail="Internal cue/word split mismatch.")

    warnings: list[str] = []
    if not (aligned.get("word_segments") or []):
        warnings.append("No ASR words; timings were spread evenly across your lyrics.")

    low_confidence_word_ids: list[str] = []
    cues: list[SubtitleCueResponse] = []

    idx = 0
    for words in cue_words:
        if not words:
            continue

        aligned_words: list[SubtitleWordResponse] = []
        cue_start_ms: int | None = None

        for _ in words:
            utext, rs, re, conf = word_rows[idx]
            idx += 1
            word_start_ms = excerpt_start_ms + round(rs * 1000)
            word_end_ms = excerpt_start_ms + round(re * 1000)
            word_end_ms = min(max(word_end_ms, word_start_ms + 1), excerpt_end_ms)
            if cue_start_ms is None:
                cue_start_ms = word_start_ms

            word_id = uuid4().hex[:10]
            if conf < CONFIDENCE_THRESHOLD:
                low_confidence_word_ids.append(word_id)

            aligned_words.append(
                SubtitleWordResponse(
                    id=word_id,
                    text=utext,
                    startMs=word_start_ms,
                    endMs=word_end_ms,
                    confidence=round(conf, 2),
                )
            )

        if not aligned_words or cue_start_ms is None:
            continue

        cue_end_ms = aligned_words[-1].endMs
        cues.append(
            SubtitleCueResponse(
                id=uuid4().hex[:10],
                start=round(cue_start_ms / 1000, 3),
                duration=round(max((cue_end_ms - cue_start_ms) / 1000, 1.0), 3),
                text=" ".join(w.text for w in aligned_words),
                words=aligned_words,
            )
        )

    return SubtitleAlignmentResponse(
        provider="whisperx",
        generatedAt=datetime.now(timezone.utc).isoformat(),
        warnings=warnings,
        lowConfidenceWordIds=low_confidence_word_ids,
        cues=cues,
    )


@app.get("/api/health")
def healthcheck() -> dict[str, str]:
    return {"status": "ok"}


@app.post("/api/lyric-sync/subtitles/align", response_model=SubtitleAlignmentResponse)
async def align_subtitles(request: Request) -> SubtitleAlignmentResponse:
    if "multipart/form-data" not in request.headers.get("content-type", "").lower():
        raise HTTPException(status_code=400, detail="Send multipart/form-data with audio, language, excerptStart, excerptEnd, sourceText.")

    form = await request.form()
    audio = form.get("audio")
    if not isinstance(audio, UploadFile):
        raise HTTPException(status_code=400, detail="Missing audio file field.")

    language = form.get("language")
    excerpt_start = form.get("excerptStart")
    excerpt_end = form.get("excerptEnd")
    source_text = form.get("sourceText")
    if not isinstance(language, str) or not isinstance(excerpt_start, str) or not isinstance(excerpt_end, str):
        raise HTTPException(status_code=400, detail="language, excerptStart, excerptEnd required.")
    if not isinstance(source_text, str):
        raise HTTPException(status_code=400, detail="sourceText required.")

    try:
        alignment_request = SubtitleAlignmentRequest(
            language=language,  # type: ignore[arg-type]
            excerptStart=float(excerpt_start),
            excerptEnd=float(excerpt_end),
            sourceText=source_text,
        )
    except ValidationError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc

    suffix = Path(audio.filename or "audio.bin").suffix or ".bin"
    with tempfile.NamedTemporaryFile(delete=False, suffix=suffix) as tmp:
        path = tmp.name
        tmp.write(await audio.read())

    logger.info(
        "Align: lang={} excerpt={}-{}s",
        alignment_request.language,
        alignment_request.excerptStart,
        alignment_request.excerptEnd,
    )
    try:
        return _align_subtitles(alignment_request, path)
    except Exception as exc:
        logger.exception("Alignment failed")
        raise HTTPException(status_code=503, detail=str(exc)) from exc
    finally:
        os.unlink(path)


if __name__ == "__main__":
    __import__("uvicorn").run(app, host="127.0.0.1", port=8000)
