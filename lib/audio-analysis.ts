import { SplitPartRangePreset, SubtitleCue, TimelineSplitMarker } from './types';

export interface AudioAnalysisPoint {
  time: number;
  value: number;
}

export interface AudioAnalysisSection {
  start: number;
  end: number;
  duration: number;
}

export interface AudioAnalysisResult {
  provider: string;
  generatedAt: string;
  duration: number;
  sampleRate: number;
  bpm: number;
  beatGrid: number[];
  onsetStrength: AudioAnalysisPoint[];
  energyStrength: AudioAnalysisPoint[];
  sectionBoundaries: number[];
  sections: AudioAnalysisSection[];
}

const DEFAULT_AUDIO_ANALYSIS_API_BASE_URL = 'http://127.0.0.1:8000';

const SPLIT_PART_RANGES: Record<SplitPartRangePreset, [number, number]> = {
  '4-7': [4, 7],
  '6-10': [6, 10],
  '9-15': [9, 15],
  '15-25': [15, 25],
};

const getAudioAnalysisApiBaseUrl = () => {
  const configuredBaseUrl = process.env.NEXT_PUBLIC_LYRIC_SYNC_API_BASE_URL?.trim()
    || process.env.NEXT_PUBLIC_PHASE3_API_BASE_URL?.trim();

  if (!configuredBaseUrl) {
    return DEFAULT_AUDIO_ANALYSIS_API_BASE_URL;
  }

  return configuredBaseUrl.replace(/\/$/, '');
};

export const analyzeAudio = async (
  audioBlob: Blob,
  options?: { minSectionDuration?: number; maxSections?: number },
): Promise<AudioAnalysisResult> => {
  const form = new FormData();
  form.append('audio', audioBlob, 'audio');
  form.append('minSectionDuration', String(options?.minSectionDuration ?? 8));
  form.append('maxSections', String(options?.maxSections ?? 10));

  const response = await fetch(`${getAudioAnalysisApiBaseUrl()}/api/audio/analysis`, {
    method: 'POST',
    body: form,
  });

  const contentType = response.headers.get('content-type') ?? '';
  const responseBody = contentType.includes('application/json')
    ? await response.json()
    : await response.text();

  if (!response.ok) {
    const errorMessage = typeof responseBody === 'object'
      && responseBody !== null
      && 'detail' in responseBody
      ? String((responseBody as { detail: unknown }).detail)
      : `Audio analysis failed with status ${response.status}.`;

    throw new Error(errorMessage);
  }

  return responseBody as AudioAnalysisResult;
};

const roundTime = (value: number) => Math.round(value * 1000) / 1000;

const clamp = (value: number, min: number, max: number) => Math.min(Math.max(value, min), max);

const snapToNearest = (value: number, anchors: readonly number[], maxDistance = 0.3) => {
  if (anchors.length === 0) {
    return roundTime(value);
  }

  let best = value;
  let bestDistance = Number.POSITIVE_INFINITY;
  for (const anchor of anchors) {
    const distance = Math.abs(anchor - value);
    if (distance < bestDistance) {
      best = anchor;
      bestDistance = distance;
    }
  }

  return roundTime(bestDistance <= maxDistance ? best : value);
};

const localPeakTimes = (series: readonly AudioAnalysisPoint[], minGapSec: number, percentile: number) => {
  if (series.length < 3) {
    return [] as number[];
  }

  const values = series.map((point) => point.value);
  const sorted = [...values].sort((left, right) => left - right);
  const percentileIndex = Math.min(sorted.length - 1, Math.max(0, Math.floor((percentile / 100) * (sorted.length - 1))));
  const threshold = sorted[percentileIndex] ?? 0;
  const peaks: number[] = [];

  for (let index = 1; index < series.length - 1; index += 1) {
    const current = series[index];
    if (current.value < threshold) {
      continue;
    }

    if (current.value >= series[index - 1].value && current.value > series[index + 1].value) {
      const previousPeak = peaks.at(-1);
      if (previousPeak != null && current.time - previousPeak < minGapSec) {
        const previousPeakIndex = peaks.length - 1;
        const previousPeakPoint = series.find((point) => point.time === previousPeak);
        if ((previousPeakPoint?.value ?? 0) < current.value) {
          peaks[previousPeakIndex] = current.time;
        }
        continue;
      }

      peaks.push(current.time);
    }
  }

  return peaks;
};

const chooseTargetPartCount = (
  preset: SplitPartRangePreset,
  durationSec: number,
  bpm: number,
  cueCount: number,
  sectionCount: number,
  peakCount: number,
) => {
  const [low, high] = SPLIT_PART_RANGES[preset];
  let density = 0;
  density += Math.min(1, Math.max(0, (bpm - 75) / 80)) * 0.35;
  density += Math.min(1, cueCount / Math.max(1, durationSec / 5)) * 0.25;
  density += Math.min(1, sectionCount / Math.max(1, durationSec / 10)) * 0.2;
  density += Math.min(1, peakCount / Math.max(1, durationSec / 3)) * 0.2;
  return Math.round(low + (high - low) * Math.min(1, density));
};

export const buildSmartSplitMarkers = (input: {
  analysis: AudioAnalysisResult;
  cues: readonly SubtitleCue[];
  preset: SplitPartRangePreset;
  timelineStartSec: number;
  sourceStartSec: number;
  visibleDurationSec: number;
}): TimelineSplitMarker[] => {
  const {
    analysis,
    cues,
    preset,
    timelineStartSec,
    sourceStartSec,
    visibleDurationSec,
  } = input;
  const sourceEndSec = sourceStartSec + visibleDurationSec;
  const beatGrid = analysis.beatGrid.filter((time) => time >= sourceStartSec && time <= sourceEndSec);
  const visibleCues = cues.filter((cue) => cue.start + cue.duration > sourceStartSec && cue.start < sourceEndSec);
  const sectionBoundaries = analysis.sectionBoundaries.filter((time) => time > sourceStartSec && time < sourceEndSec);
  const energySeries = (analysis.energyStrength?.length ? analysis.energyStrength : analysis.onsetStrength)
    .filter((point) => point.time >= sourceStartSec && point.time <= sourceEndSec);
  const energyPeaks = localPeakTimes(energySeries, 1.5, 72).map((time) => snapToNearest(time, beatGrid, 0.35));
  const targetParts = chooseTargetPartCount(
    preset,
    visibleDurationSec,
    analysis.bpm,
    visibleCues.length,
    Math.max(0, sectionBoundaries.length - 1),
    energyPeaks.length,
  );

  const candidates = new Map<number, TimelineSplitMarker>();

  const addCandidate = (time: number, score: number, reason: string) => {
    const clamped = clamp(time, sourceStartSec, sourceEndSec);
    if (clamped <= sourceStartSec + 0.5 || clamped >= sourceEndSec - 0.5) {
      return;
    }

    const snapped = snapToNearest(clamped, beatGrid, 0.35);
    const existing = candidates.get(snapped);
    if (!existing) {
      candidates.set(snapped, { time: snapped, score, reasons: [reason] });
      return;
    }

    existing.score = Math.max(existing.score, score);
    if (!existing.reasons.includes(reason)) {
      existing.reasons.push(reason);
    }
  };

  sectionBoundaries.forEach((time) => addCandidate(time, 1, 'section-change'));

  visibleCues.forEach((cue) => {
    addCandidate(cue.start, 0.66, 'lyric-start');
    addCandidate(cue.start + cue.duration, 0.82, 'lyric-end');
  });

  for (let index = 0; index < visibleCues.length - 1; index += 1) {
    const currentEnd = visibleCues[index].start + visibleCues[index].duration;
    const nextStart = visibleCues[index + 1].start;
    const pause = nextStart - currentEnd;
    if (pause >= 0.3) {
      addCandidate((currentEnd + nextStart) / 2, 0.92, 'lyric-pause');
    }
  }

  energyPeaks.forEach((time) => addCandidate(time, 0.72, 'energy-peak'));

  const ranked = [...candidates.values()].sort((left, right) => {
    if (right.score !== left.score) {
      return right.score - left.score;
    }
    return left.time - right.time;
  });

  const selected = [sourceStartSec, sourceEndSec];
  const minGap = Math.max(1.4, (visibleDurationSec / targetParts) * 0.55);
  const maxGap = Math.max(minGap * 1.5, (visibleDurationSec / targetParts) * 1.75);

  const canInsert = (time: number) => {
    const withCandidate = [...selected, time].sort((left, right) => left - right);
    for (let index = 0; index < withCandidate.length - 1; index += 1) {
      if (withCandidate[index + 1] - withCandidate[index] < minGap) {
        return false;
      }
    }
    return true;
  };

  for (const candidate of ranked) {
    if (selected.length >= targetParts + 1) {
      break;
    }
    if (canInsert(candidate.time)) {
      selected.push(candidate.time);
    }
  }

  while (selected.length < targetParts + 1) {
    const ordered = [...selected].sort((left, right) => left - right);
    let widestStart = ordered[0];
    let widestEnd = ordered[1];
    for (let index = 0; index < ordered.length - 1; index += 1) {
      if (ordered[index + 1] - ordered[index] > widestEnd - widestStart) {
        widestStart = ordered[index];
        widestEnd = ordered[index + 1];
      }
    }

    const midpoint = snapToNearest((widestStart + widestEnd) / 2, beatGrid, 0.45);
    if (!canInsert(midpoint)) {
      break;
    }
    selected.push(midpoint);
    candidates.set(midpoint, candidates.get(midpoint) ?? {
      time: midpoint,
      score: 0.4,
      reasons: ['spacing-fill'],
    });
  }

  let needsGapSplit = true;
  while (needsGapSplit) {
    needsGapSplit = false;
    const ordered = [...selected].sort((left, right) => left - right);
    for (let index = 0; index < ordered.length - 1; index += 1) {
      const gap = ordered[index + 1] - ordered[index];
      if (gap <= maxGap) {
        continue;
      }

      const midpoint = snapToNearest((ordered[index] + ordered[index + 1]) / 2, beatGrid, 0.45);
      if (!canInsert(midpoint)) {
        continue;
      }

      selected.push(midpoint);
      candidates.set(midpoint, candidates.get(midpoint) ?? {
        time: midpoint,
        score: 0.45,
        reasons: ['gap-split'],
      });
      needsGapSplit = true;
      break;
    }
  }

  return [...new Set(selected.map(roundTime))]
    .sort((left, right) => left - right)
    .slice(1, -1)
    .map((sourceTime) => {
      const marker = candidates.get(sourceTime) ?? {
        time: sourceTime,
        score: 0.35,
        reasons: ['spacing-fill'],
      };

      return {
        time: roundTime(timelineStartSec + (sourceTime - sourceStartSec)),
        score: Number(marker.score.toFixed(3)),
        reasons: [...marker.reasons],
      };
    });
};
