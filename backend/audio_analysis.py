from __future__ import annotations

import math

import librosa
import numpy as np


HOP_LENGTH = 512
MAX_ONSET_POINTS = 2000


def _normalize_float(value: float | np.ndarray) -> float:
    return float(np.atleast_1d(value).astype(float)[0])


def _estimate_section_count(duration_sec: float, min_section_duration: float, max_sections: int) -> int:
    estimated = max(2, round(duration_sec / min_section_duration))
    return min(max_sections, estimated)


def _downsample_onset_series(onset_times: np.ndarray, onset_envelope: np.ndarray) -> tuple[np.ndarray, np.ndarray]:
    if len(onset_envelope) <= MAX_ONSET_POINTS:
        return onset_times, onset_envelope

    step = math.ceil(len(onset_envelope) / MAX_ONSET_POINTS)
    return onset_times[::step], onset_envelope[::step]


def analyze_audio_structure(
    audio_path: str,
    *,
    min_section_duration: float = 8.0,
    max_sections: int = 12,
) -> dict[str, object]:
    audio, sample_rate = librosa.load(audio_path, sr=None, mono=True)
    if audio.size == 0:
        raise ValueError("Audio file produced no samples.")

    duration_sec = float(librosa.get_duration(y=audio, sr=sample_rate))
    if duration_sec <= 0:
        raise ValueError("Audio duration must be greater than zero.")

    onset_envelope = librosa.onset.onset_strength(y=audio, sr=sample_rate, hop_length=HOP_LENGTH)
    onset_times = librosa.times_like(onset_envelope, sr=sample_rate, hop_length=HOP_LENGTH)
    tempo, beat_frames = librosa.beat.beat_track(
        onset_envelope=onset_envelope,
        sr=sample_rate,
        hop_length=HOP_LENGTH,
    )
    beat_times = librosa.frames_to_time(beat_frames, sr=sample_rate, hop_length=HOP_LENGTH)

    section_count = _estimate_section_count(duration_sec, min_section_duration, max_sections)
    chroma = librosa.feature.chroma_stft(y=audio, sr=sample_rate, hop_length=HOP_LENGTH)
    boundary_frames = librosa.segment.agglomerative(chroma, k=section_count)
    boundary_times = librosa.frames_to_time(boundary_frames, sr=sample_rate, hop_length=HOP_LENGTH)

    normalized_boundaries = sorted(
        {
            0.0,
            *[round(float(boundary), 3) for boundary in boundary_times],
            round(duration_sec, 3),
        }
    )

    onset_times, onset_envelope = _downsample_onset_series(onset_times, onset_envelope)

    sections: list[dict[str, float]] = []
    for index in range(len(normalized_boundaries) - 1):
        start = normalized_boundaries[index]
        end = normalized_boundaries[index + 1]
        if end <= start:
            continue
        sections.append(
            {
                "start": start,
                "end": end,
                "duration": round(end - start, 3),
            }
        )

    return {
        "duration": round(duration_sec, 3),
        "sampleRate": int(sample_rate),
        "bpm": round(_normalize_float(tempo), 2),
        "beatGrid": [round(float(beat_time), 3) for beat_time in beat_times],
        "onsetStrength": [
            {
                "time": round(float(time_sec), 3),
                "value": round(float(strength), 5),
            }
            for time_sec, strength in zip(onset_times, onset_envelope, strict=False)
        ],
        "sectionBoundaries": normalized_boundaries,
        "sections": sections,
    }