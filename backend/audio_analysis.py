from __future__ import annotations

import math

import librosa
import numpy as np


HOP_LENGTH = 512
MAX_SERIES_POINTS = 2000
MIN_TEMPO_BPM = 60
MAX_TEMPO_BPM = 190
SOLO_MIN_DURATION_SECONDS = 6.0


def _normalize_float(value: float | np.ndarray) -> float:
    return float(np.atleast_1d(value).astype(float)[0])


def _fold_bpm(bpm: float, *, min_bpm: float = MIN_TEMPO_BPM, max_bpm: float = MAX_TEMPO_BPM) -> float:
    while bpm > max_bpm:
        bpm /= 2.0
    while bpm < min_bpm:
        bpm *= 2.0
    return bpm


def _beat_track_start_bpm(tempo_hint: float) -> float:
    """Avoid librosa locking to ~2x the perceived tempo (common with eighth-note emphasis)."""
    if tempo_hint <= 0:
        return 120.0
    h = _fold_bpm(tempo_hint)
    if h > 145 and (h / 2.0) >= MIN_TEMPO_BPM:
        h = h / 2.0
    return float(np.clip(h, MIN_TEMPO_BPM, MAX_TEMPO_BPM))


def _estimate_section_count(duration_sec: float, min_section_duration: float, max_sections: int) -> int:
    estimated = max(2, round(duration_sec / min_section_duration))
    return min(max_sections, estimated)


def _downsample_series(times: np.ndarray, values: np.ndarray) -> tuple[np.ndarray, np.ndarray]:
    if len(values) <= MAX_SERIES_POINTS:
        return times, values

    step = math.ceil(len(values) / MAX_SERIES_POINTS)
    return times[::step], values[::step]


def _smooth_series(values: np.ndarray, width: int = 9) -> np.ndarray:
    if width <= 1 or len(values) < width:
        return values

    kernel = np.ones(width, dtype=float) / width
    return np.convolve(values, kernel, mode="same")


def _normalize_series(values: np.ndarray) -> np.ndarray:
    if values.size == 0:
        return values

    min_value = float(np.min(values))
    max_value = float(np.max(values))
    if max_value - min_value <= 1e-9:
        return np.zeros_like(values, dtype=float)
    return (values - min_value) / (max_value - min_value)


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


def _compute_tempo_stability(beat_times: np.ndarray) -> float:
    if beat_times.size < 3:
        return 0.0

    intervals = np.diff(beat_times)
    mean_interval = float(np.mean(intervals))
    if mean_interval <= 1e-6:
        return 0.0

    coefficient_variation = float(np.std(intervals)) / mean_interval
    return float(np.clip(1.0 - coefficient_variation, 0.0, 1.0))


def _series_to_points(times: np.ndarray, values: np.ndarray) -> list[dict[str, float]]:
    return [
        {
            "time": round(float(time_sec), 3),
            "value": round(float(value), 5),
        }
        for time_sec, value in zip(times, values, strict=False)
    ]


def _window_values(times: np.ndarray, values: np.ndarray, start: float, end: float) -> np.ndarray:
    if times.size == 0 or values.size == 0:
        return np.array([0.0], dtype=float)

    mask = (times >= start) & (times < end)
    if np.any(mask):
        return values[mask]

    midpoint = (start + end) / 2.0
    nearest_idx = int(np.argmin(np.abs(times - midpoint)))
    return np.array([float(values[nearest_idx])], dtype=float)


def _build_section_diagnostics(
    *,
    sections: list[dict[str, float | int]],
    rms_times: np.ndarray,
    rms_energy: np.ndarray,
    onset_times: np.ndarray,
    onset_envelope: np.ndarray,
    novelty_times: np.ndarray,
    novelty_strength: np.ndarray,
    feature_times: np.ndarray,
    spectral_centroid: np.ndarray,
    spectral_rolloff: np.ndarray,
    zero_crossing_rate: np.ndarray,
    voice_times: np.ndarray,
    voice_activity: np.ndarray,
    harmonic_times: np.ndarray,
    harmonic_ratio: np.ndarray,
    percussive_ratio: np.ndarray,
    min_section_duration: float,
) -> list[dict[str, float | int]]:
    diagnostics: list[dict[str, float | int]] = []

    for section in sections:
        start = float(section["start"])
        end = float(section["end"])
        duration = float(section["duration"])

        energy_values = _window_values(rms_times, rms_energy, start, end)
        onset_values = _window_values(onset_times, onset_envelope, start, end)
        novelty_values = _window_values(novelty_times, novelty_strength, start, end)
        centroid_values = _window_values(feature_times, spectral_centroid, start, end)
        rolloff_values = _window_values(feature_times, spectral_rolloff, start, end)
        zcr_values = _window_values(feature_times, zero_crossing_rate, start, end)
        voice_values = _window_values(voice_times, voice_activity, start, end)
        harmonic_values = _window_values(harmonic_times, harmonic_ratio, start, end)
        percussive_values = _window_values(harmonic_times, percussive_ratio, start, end)

        diagnostics.append(
            {
                "sectionIndex": int(section["index"]),
                "start": round(start, 3),
                "end": round(end, 3),
                "duration": round(duration, 3),
                "meanEnergy": round(float(np.mean(energy_values)), 5),
                "energyStd": round(float(np.std(energy_values)), 5),
                "meanOnsetStrength": round(float(np.mean(onset_values)), 5),
                "meanNovelty": round(float(np.mean(novelty_values)), 5),
                "meanSpectralCentroid": round(float(np.mean(centroid_values)), 5),
                "meanSpectralRolloff": round(float(np.mean(rolloff_values)), 5),
                "meanZeroCrossingRate": round(float(np.mean(zcr_values)), 5),
                "meanVoiceActivity": round(float(np.mean(voice_values)), 5),
                "meanHarmonicRatio": round(float(np.mean(harmonic_values)), 5),
                "meanPercussiveRatio": round(float(np.mean(percussive_values)), 5),
            }
        )

    if not diagnostics:
        return diagnostics

    energy_means = np.array([float(item["meanEnergy"]) for item in diagnostics], dtype=float)
    onset_means = np.array([float(item["meanOnsetStrength"]) for item in diagnostics], dtype=float)
    novelty_means = np.array([float(item["meanNovelty"]) for item in diagnostics], dtype=float)
    percussive_means = np.array([float(item["meanPercussiveRatio"]) for item in diagnostics], dtype=float)
    voice_means = np.array([float(item["meanVoiceActivity"]) for item in diagnostics], dtype=float)

    energy_norm = _normalize_series(energy_means)
    onset_norm = _normalize_series(onset_means)
    novelty_norm = _normalize_series(novelty_means)
    percussive_norm = _normalize_series(percussive_means)
    voice_absence = np.clip(1.0 - voice_means, 0.0, 1.0)

    min_duration = max(min_section_duration * 0.65, 1e-6)
    for idx, item in enumerate(diagnostics):
        duration_scale = float(np.clip(float(item["duration"]) / min_duration, 0.55, 1.0))
        instrumental_drive = (
            0.38 * float(energy_norm[idx])
            + 0.24 * float(onset_norm[idx])
            + 0.18 * float(novelty_norm[idx])
            + 0.20 * float(percussive_norm[idx])
        )
        solo_likelihood = instrumental_drive * (0.55 + 0.45 * float(voice_absence[idx])) * duration_scale

        item["instrumentalDrive"] = round(float(np.clip(instrumental_drive, 0.0, 1.0)), 5)
        item["soloLikelihood"] = round(float(np.clip(solo_likelihood, 0.0, 1.0)), 5)

    return diagnostics


def _build_solo_windows(
    section_diagnostics: list[dict[str, float | int]],
    *,
    min_section_duration: float,
) -> list[dict[str, float | int | str]]:
    if not section_diagnostics:
        return []

    solo_scores = np.array([float(item["soloLikelihood"]) for item in section_diagnostics], dtype=float)
    threshold = float(np.clip(np.quantile(solo_scores, 0.70), 0.52, 0.78))
    min_duration = max(SOLO_MIN_DURATION_SECONDS, min_section_duration * 0.75)

    windows: list[dict[str, float | int | str]] = []
    for item in section_diagnostics:
        duration = float(item["duration"])
        confidence = float(item["soloLikelihood"])
        if duration < min_duration or confidence < threshold:
            continue

        window_type = "instrumental" if float(item["meanVoiceActivity"]) < 0.45 else "vocal"
        windows.append(
            {
                "sectionIndex": int(item["sectionIndex"]),
                "start": round(float(item["start"]), 3),
                "end": round(float(item["end"]), 3),
                "duration": round(duration, 3),
                "confidence": round(confidence, 5),
                "type": window_type,
            }
        )

    if windows:
        return windows

    best_idx = int(np.argmax(solo_scores))
    best_item = section_diagnostics[best_idx]
    best_duration = float(best_item["duration"])
    best_confidence = float(best_item["soloLikelihood"])
    if best_duration >= min_duration and best_confidence >= 0.60:
        return [
            {
                "sectionIndex": int(best_item["sectionIndex"]),
                "start": round(float(best_item["start"]), 3),
                "end": round(float(best_item["end"]), 3),
                "duration": round(best_duration, 3),
                "confidence": round(best_confidence, 5),
                "type": "instrumental" if float(best_item["meanVoiceActivity"]) < 0.45 else "vocal",
            }
        ]

    return []


def _build_summary(
    *,
    duration_sec: float,
    rms_energy: np.ndarray,
    onset_envelope: np.ndarray,
    voice_activity: np.ndarray,
    section_diagnostics: list[dict[str, float | int]],
    solo_windows: list[dict[str, float | int | str]],
) -> dict[str, float | int]:
    if rms_energy.size:
        dynamic_range = float(np.quantile(rms_energy, 0.9) - np.quantile(rms_energy, 0.1))
        mean_energy = float(np.mean(rms_energy))
    else:
        dynamic_range = 0.0
        mean_energy = 0.0

    onset_norm = _normalize_series(onset_envelope)
    onset_delta = np.abs(np.diff(onset_norm, prepend=onset_norm[0])) if onset_norm.size else np.array([], dtype=float)
    if onset_delta.size:
        threshold = float(np.quantile(onset_delta, 0.85))
        onset_density = float(np.sum(onset_delta >= threshold)) / max(duration_sec, 1e-6)
    else:
        onset_density = 0.0

    mean_voice_activity = float(np.mean(voice_activity)) if voice_activity.size else 0.0
    mean_instrumental_drive = (
        float(np.mean([float(item["instrumentalDrive"]) for item in section_diagnostics]))
        if section_diagnostics
        else 0.0
    )

    return {
        "meanEnergy": round(mean_energy, 5),
        "energyDynamicRange": round(dynamic_range, 5),
        "onsetDensityPerSecond": round(onset_density, 5),
        "meanVoiceActivity": round(mean_voice_activity, 5),
        "meanInstrumentalDrive": round(mean_instrumental_drive, 5),
        "soloSectionCount": int(len(solo_windows)),
    }


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

    spectral_centroid = librosa.feature.spectral_centroid(y=audio, sr=sample_rate, hop_length=HOP_LENGTH)[0].astype(float)
    spectral_rolloff = librosa.feature.spectral_rolloff(
        y=audio,
        sr=sample_rate,
        hop_length=HOP_LENGTH,
        roll_percent=0.85,
    )[0].astype(float)
    zero_crossing_rate = librosa.feature.zero_crossing_rate(
        y=audio,
        frame_length=2048,
        hop_length=HOP_LENGTH,
    )[0].astype(float)
    feature_times = librosa.times_like(spectral_centroid, sr=sample_rate, hop_length=HOP_LENGTH)

    harmonic_audio, percussive_audio = librosa.effects.hpss(audio)
    harmonic_energy = librosa.feature.rms(y=harmonic_audio, hop_length=HOP_LENGTH)[0].astype(float)
    percussive_energy = librosa.feature.rms(y=percussive_audio, hop_length=HOP_LENGTH)[0].astype(float)
    hpss_times = librosa.times_like(harmonic_energy, sr=sample_rate, hop_length=HOP_LENGTH)
    hpss_total = harmonic_energy + percussive_energy + 1e-8
    harmonic_ratio = harmonic_energy / hpss_total
    percussive_ratio = percussive_energy / hpss_total

    stft_power = np.abs(librosa.stft(audio, n_fft=2048, hop_length=HOP_LENGTH)) ** 2
    fft_freqs = librosa.fft_frequencies(sr=sample_rate, n_fft=2048)
    voice_mask = (fft_freqs >= 300.0) & (fft_freqs <= 3400.0)
    total_power = np.sum(stft_power, axis=0) + 1e-8
    voice_activity = np.sum(stft_power[voice_mask], axis=0) / total_power
    voice_activity = np.clip(_smooth_series(voice_activity.astype(float), 9), 0.0, 1.0)
    voice_times = librosa.frames_to_time(np.arange(voice_activity.size), sr=sample_rate, hop_length=HOP_LENGTH)

    novelty_len = min(onset_envelope.size, rms_energy.size, spectral_centroid.size)
    onset_novelty = _normalize_series(_smooth_series(onset_envelope[:novelty_len], 9))
    rms_novelty = _normalize_series(_smooth_series(rms_energy[:novelty_len], 9))
    centroid_novelty = _normalize_series(_smooth_series(spectral_centroid[:novelty_len], 9))
    novelty_strength = (
        0.45 * np.abs(np.diff(onset_novelty, prepend=onset_novelty[0]))
        + 0.35 * np.abs(np.diff(rms_novelty, prepend=rms_novelty[0]))
        + 0.20 * np.abs(np.diff(centroid_novelty, prepend=centroid_novelty[0]))
    )
    novelty_strength = _normalize_series(_smooth_series(novelty_strength.astype(float), 7))
    novelty_times = onset_times[:novelty_len]

    tempo_hint = _estimate_tempo_from_onsets(onset_envelope, sample_rate)
    tempo, beat_frames = librosa.beat.beat_track(
        onset_envelope=onset_envelope,
        sr=sample_rate,
        hop_length=HOP_LENGTH,
        start_bpm=_beat_track_start_bpm(tempo_hint),
    )
    tempo_bpm = round(_fold_bpm(_normalize_float(tempo)), 2)
    beat_times = librosa.frames_to_time(beat_frames, sr=sample_rate, hop_length=HOP_LENGTH)
    tempo_stability = _compute_tempo_stability(beat_times)

    section_count = _estimate_section_count(duration_sec, min_section_duration, max_sections)
    chroma = librosa.feature.chroma_stft(y=audio, sr=sample_rate, hop_length=HOP_LENGTH)
    if chroma.shape[1] < 2:
        boundary_times = np.array([], dtype=float)
    else:
        boundary_frames = librosa.segment.agglomerative(
            chroma,
            k=int(np.clip(section_count, 2, chroma.shape[1])),
        )
        boundary_times = librosa.frames_to_time(boundary_frames, sr=sample_rate, hop_length=HOP_LENGTH)

    normalized_boundaries = sorted(
        {
            0.0,
            *[round(float(boundary), 3) for boundary in boundary_times],
            round(duration_sec, 3),
        }
    )

    sections: list[dict[str, float | int]] = []
    for index in range(len(normalized_boundaries) - 1):
        start = normalized_boundaries[index]
        end = normalized_boundaries[index + 1]
        if end <= start:
            continue
        sections.append(
            {
                "index": index + 1,
                "start": start,
                "end": end,
                "duration": round(end - start, 3),
            }
        )

    section_diagnostics = _build_section_diagnostics(
        sections=sections,
        rms_times=rms_times,
        rms_energy=rms_energy,
        onset_times=onset_times,
        onset_envelope=onset_envelope,
        novelty_times=novelty_times,
        novelty_strength=novelty_strength,
        feature_times=feature_times,
        spectral_centroid=spectral_centroid,
        spectral_rolloff=spectral_rolloff,
        zero_crossing_rate=zero_crossing_rate,
        voice_times=voice_times,
        voice_activity=voice_activity,
        harmonic_times=hpss_times,
        harmonic_ratio=harmonic_ratio,
        percussive_ratio=percussive_ratio,
        min_section_duration=min_section_duration,
    )
    solo_windows = _build_solo_windows(
        section_diagnostics,
        min_section_duration=min_section_duration,
    )
    summary = _build_summary(
        duration_sec=duration_sec,
        rms_energy=rms_energy,
        onset_envelope=onset_envelope,
        voice_activity=voice_activity,
        section_diagnostics=section_diagnostics,
        solo_windows=solo_windows,
    )

    onset_times, onset_envelope = _downsample_series(onset_times, onset_envelope)
    rms_times, rms_energy = _downsample_series(rms_times, rms_energy)
    centroid_times = feature_times.copy()
    rolloff_times = feature_times.copy()
    zcr_times = feature_times.copy()
    centroid_times, spectral_centroid = _downsample_series(centroid_times, spectral_centroid)
    rolloff_times, spectral_rolloff = _downsample_series(rolloff_times, spectral_rolloff)
    zcr_times, zero_crossing_rate = _downsample_series(zcr_times, zero_crossing_rate)
    novelty_times, novelty_strength = _downsample_series(novelty_times, novelty_strength)
    voice_times, voice_activity = _downsample_series(voice_times, voice_activity)
    harmonic_times, harmonic_ratio = _downsample_series(hpss_times, harmonic_ratio)
    percussive_times, percussive_ratio = _downsample_series(hpss_times, percussive_ratio)

    return {
        "duration": round(duration_sec, 3),
        "sampleRate": int(sample_rate),
        "bpm": round(tempo_bpm, 2),
        "tempoStability": round(tempo_stability, 5),
        "beatGrid": [round(float(beat_time), 3) for beat_time in beat_times],
        "onsetStrength": _series_to_points(onset_times, onset_envelope),
        "energyStrength": _series_to_points(rms_times, rms_energy),
        "spectralCentroid": _series_to_points(centroid_times, spectral_centroid),
        "spectralRolloff": _series_to_points(rolloff_times, spectral_rolloff),
        "zeroCrossingRate": _series_to_points(zcr_times, zero_crossing_rate),
        "noveltyStrength": _series_to_points(novelty_times, novelty_strength),
        "voiceActivity": _series_to_points(voice_times, voice_activity),
        "harmonicEnergyRatio": _series_to_points(harmonic_times, harmonic_ratio),
        "percussiveEnergyRatio": _series_to_points(percussive_times, percussive_ratio),
        "sectionBoundaries": normalized_boundaries,
        "sections": sections,
        "sectionDiagnostics": section_diagnostics,
        "soloWindows": solo_windows,
        "summary": summary,
    }