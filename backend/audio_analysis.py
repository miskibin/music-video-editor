from __future__ import annotations

import math

import librosa
import numpy as np


HOP_LENGTH = 512
MAX_ONSET_POINTS = 2000
MIN_TEMPO_BPM = 60
MAX_TEMPO_BPM = 190


def _normalize_float(value: float | np.ndarray) -> float:
    return float(np.atleast_1d(value).astype(float)[0])


def _fold_bpm(bpm: float, *, min_bpm: float = MIN_TEMPO_BPM, max_bpm: float = MAX_TEMPO_BPM) -> float:
    while bpm > max_bpm:
        bpm /= 2.0
    while bpm < min_bpm:
        bpm *= 2.0
    return bpm


def _estimate_section_count(duration_sec: float, min_section_duration: float, max_sections: int) -> int:
    estimated = max(2, round(duration_sec / min_section_duration))
    return min(max_sections, estimated)


def _downsample_onset_series(onset_times: np.ndarray, onset_envelope: np.ndarray) -> tuple[np.ndarray, np.ndarray]:
    if len(onset_envelope) <= MAX_ONSET_POINTS:
        return onset_times, onset_envelope

    step = math.ceil(len(onset_envelope) / MAX_ONSET_POINTS)
    return onset_times[::step], onset_envelope[::step]


def _smooth_series(values: np.ndarray, width: int = 9) -> np.ndarray:
    if width <= 1 or len(values) < width:
        return values

    kernel = np.ones(width, dtype=float) / width
    return np.convolve(values, kernel, mode="same")


def _estimate_tempo_from_onsets(onset_envelope: np.ndarray, sample_rate: int) -> float:
    if onset_envelope.size < 8:
        return 0.0

    envelope = onset_envelope.astype(float, copy=True)
    peak = float(np.max(envelope))
    if peak <= 1e-8:
        return 0.0

    envelope /= peak
    diff = np.maximum(0.0, np.diff(envelope))
    if diff.size < 4:
        return 0.0

    env_rate = sample_rate / HOP_LENGTH
    min_lag = max(2, int(math.floor((60.0 / MAX_TEMPO_BPM) * env_rate)))
    max_lag = min(diff.size - 1, int(math.ceil((60.0 / MIN_TEMPO_BPM) * env_rate)))
    if max_lag <= min_lag:
        return 0.0

    best_lag = -1
    best_score = -1.0
    for lag in range(min_lag, max_lag + 1):
        limit = diff.size - lag
        if limit <= 0:
            continue
        score = float(np.dot(diff[:limit], diff[lag:lag + limit]))
        if score > best_score:
            best_score = score
            best_lag = lag

    if best_lag <= 0 or best_score <= 0:
        return 0.0

    bpm = 60.0 / (best_lag / env_rate)
    return _fold_bpm(bpm)


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
    rms_energy = librosa.feature.rms(y=audio, hop_length=HOP_LENGTH)[0].astype(float)
    rms_energy = _smooth_series(rms_energy)
    rms_times = librosa.times_like(rms_energy, sr=sample_rate, hop_length=HOP_LENGTH)
    tempo_hint = _estimate_tempo_from_onsets(onset_envelope, sample_rate)
    tempo, beat_frames = librosa.beat.beat_track(
        onset_envelope=onset_envelope,
        sr=sample_rate,
        hop_length=HOP_LENGTH,
        start_bpm=tempo_hint if tempo_hint > 0 else 120.0,
    )
    tempo_bpm = tempo_hint if tempo_hint > 0 else _normalize_float(tempo)
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
    rms_times, rms_energy = _downsample_onset_series(rms_times, rms_energy)

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
        "bpm": round(tempo_bpm, 2),
        "beatGrid": [round(float(beat_time), 3) for beat_time in beat_times],
        "onsetStrength": [
            {
                "time": round(float(time_sec), 3),
                "value": round(float(strength), 5),
            }
            for time_sec, strength in zip(onset_times, onset_envelope, strict=False)
        ],
        "energyStrength": [
            {
                "time": round(float(time_sec), 3),
                "value": round(float(strength), 5),
            }
            for time_sec, strength in zip(rms_times, rms_energy, strict=False)
        ],
        "sectionBoundaries": normalized_boundaries,
        "sections": sections,
    }