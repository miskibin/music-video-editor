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


class AudioAnalysisRequest(BaseModel):
    minSectionDuration: float = Field(default=8.0, ge=2.0, le=60.0)
    maxSections: int = Field(default=12, ge=2, le=24)


class AudioAnalysisPointResponse(BaseModel):
    time: float
    value: float


class AudioAnalysisSectionResponse(BaseModel):
    index: int
    start: float
    end: float
    duration: float


class AudioAnalysisSectionDiagnosticsResponse(BaseModel):
    sectionIndex: int
    start: float
    end: float
    duration: float
    meanEnergy: float
    energyStd: float
    meanOnsetStrength: float
    meanNovelty: float
    meanSpectralCentroid: float
    meanSpectralRolloff: float
    meanZeroCrossingRate: float
    meanVoiceActivity: float
    meanHarmonicRatio: float
    meanPercussiveRatio: float
    instrumentalDrive: float
    soloLikelihood: float


class AudioAnalysisSoloWindowResponse(BaseModel):
    sectionIndex: int
    start: float
    end: float
    duration: float
    confidence: float
    type: Literal["instrumental", "vocal"]


class AudioAnalysisSummaryResponse(BaseModel):
    meanEnergy: float
    energyDynamicRange: float
    onsetDensityPerSecond: float
    meanVoiceActivity: float
    meanInstrumentalDrive: float
    soloSectionCount: int


class AudioAnalysisResponse(BaseModel):
    provider: str
    generatedAt: str
    duration: float
    sampleRate: int
    bpm: float
    tempoStability: float
    beatGrid: list[float]
    onsetStrength: list[AudioAnalysisPointResponse]
    energyStrength: list[AudioAnalysisPointResponse]
    spectralCentroid: list[AudioAnalysisPointResponse]
    spectralRolloff: list[AudioAnalysisPointResponse]
    zeroCrossingRate: list[AudioAnalysisPointResponse]
    noveltyStrength: list[AudioAnalysisPointResponse]
    voiceActivity: list[AudioAnalysisPointResponse]
    harmonicEnergyRatio: list[AudioAnalysisPointResponse]
    percussiveEnergyRatio: list[AudioAnalysisPointResponse]
    sectionBoundaries: list[float]
    sections: list[AudioAnalysisSectionResponse]
    sectionDiagnostics: list[AudioAnalysisSectionDiagnosticsResponse]
    soloWindows: list[AudioAnalysisSoloWindowResponse]
    summary: AudioAnalysisSummaryResponse


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
    from subtitle_common import cue_word_index_ranges, extract_words
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

    word_rows, timing_warnings = user_word_timings(request.sourceText, aligned, excerpt_duration)

    try:
        ranges = cue_word_index_ranges(request.sourceText, excerpt_duration)
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc

    if len(word_rows) != len(extract_words(request.sourceText)):
        raise HTTPException(status_code=500, detail="Word timing count does not match lyrics.")

    warnings: list[str] = list(timing_warnings)
    if not (aligned.get("word_segments") or []):
        warnings.append("No ASR words; timings were spread evenly across your lyrics.")

    low_confidence_word_ids: list[str] = []
    cues: list[SubtitleCueResponse] = []

    for start, end in ranges:
        aligned_words: list[SubtitleWordResponse] = []
        cue_start_ms: int | None = None

        for idx in range(start, end):
            utext, rs, re, conf = word_rows[idx]
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

    flat_texts = [w.text for cue in cues for w in cue.words]
    if flat_texts != extract_words(request.sourceText):
        raise HTTPException(status_code=500, detail="Response words must match uploaded lyrics exactly.")

    return SubtitleAlignmentResponse(
        provider="whisperx",
        generatedAt=datetime.now(timezone.utc).isoformat(),
        warnings=warnings,
        lowConfidenceWordIds=low_confidence_word_ids,
        cues=cues,
    )


def _analyze_audio(request: AudioAnalysisRequest, audio_path: str) -> AudioAnalysisResponse:
    from audio_analysis import analyze_audio_structure

    analysis = analyze_audio_structure(
        audio_path,
        min_section_duration=request.minSectionDuration,
        max_sections=request.maxSections,
    )
    return AudioAnalysisResponse(
        provider="librosa",
        generatedAt=datetime.now(timezone.utc).isoformat(),
        **analysis,
    )


async def _persist_upload(audio: UploadFile) -> str:
    suffix = Path(audio.filename or "audio.bin").suffix or ".bin"
    with tempfile.NamedTemporaryFile(delete=False, suffix=suffix) as tmp:
        path = tmp.name
        tmp.write(await audio.read())
    return path


@app.get("/api/health")
def healthcheck() -> dict[str, str]:
    return {"status": "ok"}


@app.post("/api/audio/analysis", response_model=AudioAnalysisResponse)
async def analyze_audio(request: Request) -> AudioAnalysisResponse:
    if "multipart/form-data" not in request.headers.get("content-type", "").lower():
        raise HTTPException(status_code=400, detail="Send multipart/form-data with audio and optional minSectionDuration, maxSections.")

    form = await request.form()
    audio = form.get("audio")
    if not isinstance(audio, UploadFile):
        raise HTTPException(status_code=400, detail="Missing audio file field.")

    min_section_duration = form.get("minSectionDuration", "8")
    max_sections = form.get("maxSections", "12")
    if not isinstance(min_section_duration, str) or not isinstance(max_sections, str):
        raise HTTPException(status_code=400, detail="minSectionDuration and maxSections must be strings when provided.")

    try:
        analysis_request = AudioAnalysisRequest(
            minSectionDuration=float(min_section_duration),
            maxSections=int(max_sections),
        )
    except ValidationError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc

    path = await _persist_upload(audio)
    logger.info(
        "Analyze audio: minSectionDuration={} maxSections={}",
        analysis_request.minSectionDuration,
        analysis_request.maxSections,
    )
    try:
        return _analyze_audio(analysis_request, path)
    except Exception as exc:
        logger.exception("Audio analysis failed")
        raise HTTPException(status_code=503, detail=str(exc)) from exc
    finally:
        os.unlink(path)


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

    path = await _persist_upload(audio)

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
