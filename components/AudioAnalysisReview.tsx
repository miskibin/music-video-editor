'use client';

import { useCallback, useMemo, useRef, useState } from 'react';
import {
  ChevronDown,
  ChevronRight,
  Pause,
  Play,
  SkipBack,
  SkipForward,
} from 'lucide-react';
import type { AudioAnalysisPoint, AudioAnalysisResult } from '@/lib/audio-analysis-types';
import { Button } from '@/components/ui/button';

const MIN_SEGMENT_SEC = 4;
const SEEK_STEP_SECONDS = 5;

const snapNear = (value: number, anchors: readonly number[], maxDist: number) => {
  let best = value;
  let d = maxDist;
  for (const a of anchors) {
    const ad = Math.abs(a - value);
    if (ad < d) {
      d = ad;
      best = a;
    }
  }
  return d < maxDist ? best : value;
};

const clamp = (value: number, min: number, max: number) => Math.min(Math.max(value, min), max);

const formatTime = (timeSec: number) => {
  const safeSeconds = Math.max(0, timeSec);
  const minutes = Math.floor(safeSeconds / 60);
  const seconds = Math.floor(safeSeconds % 60);
  return `${minutes}:${seconds.toString().padStart(2, '0')}`;
};

const quantile = (values: readonly number[], ratio: number) => {
  if (values.length === 0) {
    return 0;
  }

  const sorted = [...values].sort((left, right) => left - right);
  const index = Math.min(sorted.length - 1, Math.max(0, Math.floor(ratio * (sorted.length - 1))));
  return sorted[index] ?? 0;
};

const normalizeSeries = (series: readonly AudioAnalysisPoint[]) => {
  if (series.length === 0) {
    return [] as AudioAnalysisPoint[];
  }

  const values = series.map((point) => point.value);
  const min = Math.min(...values);
  const max = Math.max(...values);
  const range = max - min;
  if (range <= 1e-6) {
    return series.map((point) => ({ ...point, value: 0 }));
  }

  return series.map((point) => ({
    time: point.time,
    value: (point.value - min) / range,
  }));
};

const sampleNearest = (series: readonly AudioAnalysisPoint[], timeSec: number) => {
  if (series.length === 0) {
    return 0;
  }

  let best = series[0];
  let bestDistance = Math.abs(best.time - timeSec);
  for (let index = 1; index < series.length; index += 1) {
    const candidate = series[index];
    const distance = Math.abs(candidate.time - timeSec);
    if (distance < bestDistance) {
      best = candidate;
      bestDistance = distance;
    }
  }
  return best.value;
};

const buildLinePath = (series: readonly AudioAnalysisPoint[], duration: number, height = 100) => {
  if (series.length === 0 || duration <= 0) {
    return '';
  }

  return series.map((point, index) => {
    const x = (point.time / duration) * 100;
    const y = height - point.value * height;
    return `${index === 0 ? 'M' : 'L'} ${x.toFixed(3)} ${y.toFixed(3)}`;
  }).join(' ');
};

const buildAreaPath = (series: readonly AudioAnalysisPoint[], duration: number, height = 100) => {
  if (series.length === 0 || duration <= 0) {
    return '';
  }

  const linePath = buildLinePath(series, duration, height);
  return `${linePath} L 100 ${height} L 0 ${height} Z`;
};

const buildPeakTimes = (series: readonly AudioAnalysisPoint[], minGapSec: number, percentile: number) => {
  if (series.length < 3) {
    return [] as number[];
  }

  const threshold = quantile(series.map((point) => point.value), percentile / 100);
  const peaks: number[] = [];

  for (let index = 1; index < series.length - 1; index += 1) {
    const current = series[index];
    if (current.value < threshold) {
      continue;
    }
    if (current.value >= series[index - 1].value && current.value > series[index + 1].value) {
      const previousPeak = peaks.at(-1);
      if (previousPeak != null && current.time - previousPeak < minGapSec) {
        const previousPoint = series.find((point) => point.time === previousPeak);
        if ((previousPoint?.value ?? 0) < current.value) {
          peaks[peaks.length - 1] = current.time;
        }
      } else {
        peaks.push(current.time);
      }
    }
  }

  return peaks;
};

type Props = {
  analysis: AudioAnalysisResult;
  waveformPeaks: number[];
  playheadSec: number;
  isPlaying: boolean;
  internalBoundaries: number[];
  sectionLabels: string[];
  onSeekAudio: (timeSec: number) => void;
  onPlayAudio: () => void | Promise<void>;
  onPauseAudio: () => void;
  onInternalBoundariesChange: (next: number[]) => void;
  onSectionLabelsChange: (next: string[]) => void;
};

export default function AudioAnalysisReview({
  analysis,
  waveformPeaks,
  playheadSec,
  isPlaying,
  internalBoundaries,
  sectionLabels,
  onSeekAudio,
  onPlayAudio,
  onPauseAudio,
  onInternalBoundariesChange,
  onSectionLabelsChange,
}: Props) {
  const timelineRef = useRef<HTMLDivElement | null>(null);
  const [dragIndex, setDragIndex] = useState<number | null>(null);
  const [isScrubbing, setIsScrubbing] = useState(false);
  const [diagOpen, setDiagOpen] = useState(false);

  const duration = analysis.duration;
  const beatGrid = analysis.beatGrid;
  const waveformSeries = useMemo(
    () => waveformPeaks.length
      ? waveformPeaks
      : normalizeSeries(analysis.energyStrength ?? analysis.onsetStrength).map((point) => point.value),
    [analysis.energyStrength, analysis.onsetStrength, waveformPeaks],
  );
  const energySeries = useMemo(
    () => normalizeSeries(analysis.energyStrength?.length ? analysis.energyStrength : analysis.onsetStrength),
    [analysis.energyStrength, analysis.onsetStrength],
  );
  const noveltySeries = useMemo(
    () => normalizeSeries(analysis.noveltyStrength?.length ? analysis.noveltyStrength : analysis.onsetStrength),
    [analysis.noveltyStrength, analysis.onsetStrength],
  );
  const voiceSeries = useMemo(
    () => normalizeSeries(analysis.voiceActivity ?? []),
    [analysis.voiceActivity],
  );
  const instrumentalSeries = useMemo(() => {
    if (energySeries.length === 0) {
      return [] as AudioAnalysisPoint[];
    }

    return energySeries.map((point) => {
      const voiceValue = sampleNearest(voiceSeries, point.time);
      const instrumentalValue = clamp(point.value * 0.6 + (1 - voiceValue) * 0.4, 0, 1);
      return {
        time: point.time,
        value: instrumentalValue,
      };
    });
  }, [energySeries, voiceSeries]);
  const energyPeaks = useMemo(
    () => buildPeakTimes(energySeries, 1.1, 88).slice(0, 80),
    [energySeries],
  );
  const noveltyPeaks = useMemo(
    () => buildPeakTimes(noveltySeries, 1.1, 90).slice(0, 80),
    [noveltySeries],
  );
  const summary = analysis.summary;
  const tempoStability = analysis.tempoStability ?? null;

  const displayBeats = useMemo(() => {
    const maxLines = 360;
    if (beatGrid.length <= maxLines) {
      return beatGrid;
    }
    const step = Math.ceil(beatGrid.length / maxLines);
    return beatGrid.filter((_, i) => i % step === 0);
  }, [beatGrid]);

  const xToTime = useCallback(
    (x: number, width: number) => clamp(x / Math.max(width, 1), 0, 1) * duration,
    [duration],
  );

  const seekFromPointer = useCallback((clientX: number) => {
    if (!timelineRef.current) {
      return;
    }
    const rect = timelineRef.current.getBoundingClientRect();
    const x = clientX - rect.left;
    onSeekAudio(clamp(xToTime(x, rect.width), 0, duration));
  }, [duration, onSeekAudio, xToTime]);

  const onPointerMove = useCallback(
    (e: React.PointerEvent) => {
      if (!timelineRef.current) {
        return;
      }

      if (dragIndex !== null) {
        const rect = timelineRef.current.getBoundingClientRect();
        const x = e.clientX - rect.left;
        const t = xToTime(x, rect.width);
        const sorted = [...internalBoundaries].sort((a, b) => a - b);
        const prev = dragIndex === 0 ? 0 : sorted[dragIndex - 1];
        const next = dragIndex === sorted.length - 1 ? duration : sorted[dragIndex + 1];
        let nextT = snapNear(t, beatGrid, 0.22);
        nextT = Math.min(Math.max(nextT, prev + MIN_SEGMENT_SEC), next - MIN_SEGMENT_SEC);
        const nextArr = [...sorted];
        nextArr[dragIndex] = nextT;
        nextArr.sort((a, b) => a - b);
        onInternalBoundariesChange(nextArr);
        return;
      }

      if (isScrubbing) {
        seekFromPointer(e.clientX);
      }
    },
    [
      beatGrid,
      dragIndex,
      duration,
      internalBoundaries,
      isScrubbing,
      onInternalBoundariesChange,
      seekFromPointer,
      xToTime,
    ],
  );

  const endDrag = useCallback(() => {
    setDragIndex(null);
    setIsScrubbing(false);
  }, []);

  const boundariesSorted = useMemo(
    () => [...internalBoundaries].sort((a, b) => a - b),
    [internalBoundaries],
  );

  const fullBoundaries = useMemo(
    () => [0, ...boundariesSorted, duration],
    [boundariesSorted, duration],
  );

  const playheadPercent = duration > 0 ? (clamp(playheadSec, 0, duration) / duration) * 100 : 0;

  return (
    <div className="flex min-h-0 flex-col gap-4 overflow-y-auto">
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <Metric label="BPM" value={analysis.bpm.toFixed(1)} />
        {tempoStability != null ? (
          <Metric label="Tempo stability" value={tempoStability.toFixed(2)} hint="0–1" />
        ) : null}
        {summary ? (
          <>
            <Metric label="Energy (mean)" value={summary.meanEnergy.toFixed(3)} />
            <Metric label="Energy range" value={summary.energyDynamicRange.toFixed(3)} />
            <Metric label="Onset density / s" value={summary.onsetDensityPerSecond.toFixed(2)} />
            <Metric label="Voice activity (mean)" value={summary.meanVoiceActivity.toFixed(2)} />
            <Metric label="Solo sections" value={String(summary.soloSectionCount)} />
          </>
        ) : null}
      </div>

      <p className="text-xs text-zinc-500">
        Scrub the waveform to preview any moment. Section names are editable placeholders, and boundary handles still snap to nearby beats when close.
      </p>

      <div className="flex flex-wrap items-center gap-2">
        <Button
          type="button"
          variant="secondary"
          className="gap-2"
          onClick={() => {
            if (isPlaying) {
              onPauseAudio();
            } else {
              void onPlayAudio();
            }
          }}
        >
          {isPlaying ? <Pause className="h-4 w-4" /> : <Play className="h-4 w-4" />}
          {isPlaying ? 'Pause' : 'Play'}
        </Button>
        <Button type="button" variant="ghost" size="icon" onClick={() => onSeekAudio(clamp(playheadSec - SEEK_STEP_SECONDS, 0, duration))}>
          <SkipBack className="h-4 w-4" />
        </Button>
        <Button type="button" variant="ghost" size="icon" onClick={() => onSeekAudio(clamp(playheadSec + SEEK_STEP_SECONDS, 0, duration))}>
          <SkipForward className="h-4 w-4" />
        </Button>
        <div className="rounded-full border border-zinc-800 bg-zinc-900/70 px-3 py-1 text-xs text-zinc-400">
          {formatTime(playheadSec)} / {formatTime(duration)}
        </div>
      </div>

      <div className="rounded-xl border border-zinc-800 bg-zinc-950">
        <div className="relative h-9 overflow-hidden border-b border-zinc-800/80">
          {fullBoundaries.slice(0, -1).map((start, i) => {
            const end = fullBoundaries[i + 1];
            const left = `${(start / duration) * 100}%`;
            const width = `${((end - start) / duration) * 100}%`;
            return (
              <div
                key={`${start}-${end}`}
                className={`absolute top-0 flex h-full items-center justify-center border-r border-zinc-800/80 px-1 ${i % 2 === 0 ? 'bg-white/[0.02]' : 'bg-white/[0.04]'}`}
                style={{ left, width }}
              >
                <input
                  value={sectionLabels[i] ?? `Section ${i + 1}`}
                  onChange={(ev) => {
                    const next = [...sectionLabels];
                    next[i] = ev.target.value;
                    onSectionLabelsChange(next);
                  }}
                  className="w-full max-w-[min(100%,8rem)] truncate bg-transparent text-center text-[11px] text-zinc-300 outline-none"
                />
              </div>
            );
          })}
        </div>

        <div
          ref={timelineRef}
          className="relative select-none"
          onPointerMove={onPointerMove}
          onPointerUp={endDrag}
          onPointerLeave={endDrag}
        >
          <div
            className="relative h-48 cursor-ew-resize overflow-hidden border-b border-zinc-800/80 bg-gradient-to-b from-zinc-950 to-zinc-900"
            onPointerDown={(e) => {
              seekFromPointer(e.clientX);
              setIsScrubbing(true);
              e.currentTarget.setPointerCapture(e.pointerId);
            }}
          >
            <div className="pointer-events-none absolute inset-0 flex items-center gap-px px-1">
              {waveformSeries.map((peak, index) => (
                <div
                  key={`${index}-${peak}`}
                  className="flex-1 rounded-full bg-rose-300/80"
                  style={{
                    height: `${Math.max(6, peak * 100)}%`,
                    opacity: 0.22 + peak * 0.6,
                  }}
                />
              ))}
            </div>

            <svg className="pointer-events-none absolute inset-0 h-full w-full" viewBox="0 0 100 100" preserveAspectRatio="none">
              {displayBeats.map((beatTime) => (
                <line
                  key={`wave-beat-${beatTime}`}
                  x1={(beatTime / duration) * 100}
                  y1={0}
                  x2={(beatTime / duration) * 100}
                  y2={100}
                  stroke="rgba(250,250,250,0.06)"
                  strokeWidth={0.08}
                />
              ))}
              {boundariesSorted.map((boundary) => (
                <line
                  key={`wave-boundary-${boundary}`}
                  x1={(boundary / duration) * 100}
                  y1={0}
                  x2={(boundary / duration) * 100}
                  y2={100}
                  stroke="rgba(255,255,255,0.35)"
                  strokeWidth={0.18}
                />
              ))}
              <line
                x1={playheadPercent}
                y1={0}
                x2={playheadPercent}
                y2={100}
                stroke="rgba(251,191,36,0.95)"
                strokeWidth={0.2}
              />
            </svg>

            {boundariesSorted.map((boundary, index) => (
              <button
                key={`handle-${boundary}`}
                type="button"
                aria-label={`Section boundary ${index + 1}`}
                className="absolute top-0 h-full w-3 -translate-x-1/2 cursor-ew-resize bg-transparent"
                style={{ left: `${(boundary / duration) * 100}%` }}
                onPointerDown={(e) => {
                  e.stopPropagation();
                  e.currentTarget.setPointerCapture(e.pointerId);
                  setDragIndex(index);
                }}
              >
                <span className="pointer-events-none absolute left-1/2 top-0 h-full w-px -translate-x-1/2 bg-white/70" />
              </button>
            ))}
          </div>

          <AnalysisLane
            title="Vocal / Instrument Activity"
            duration={duration}
            beatGrid={displayBeats}
            boundaries={boundariesSorted}
            playheadPercent={playheadPercent}
            fills={[
              { series: instrumentalSeries, color: 'rgba(56,189,248,0.18)' },
              { series: voiceSeries, color: 'rgba(244,114,182,0.14)' },
            ]}
            lines={[
              { series: instrumentalSeries, color: '#38bdf8' },
              { series: voiceSeries, color: '#fb7185' },
            ]}
            legend="cyan instrument activity, rose vocal activity"
          />

          <AnalysisLane
            title="Energy / Peaks / Novelty"
            duration={duration}
            beatGrid={displayBeats}
            boundaries={boundariesSorted}
            playheadPercent={playheadPercent}
            fills={[
              { series: energySeries, color: 'rgba(168,85,247,0.14)' },
            ]}
            lines={[
              { series: energySeries, color: '#c084fc' },
              { series: noveltySeries, color: '#fbbf24' },
            ]}
            markers={[
              { times: energyPeaks, color: '#c084fc', y: 22 },
              { times: noveltyPeaks, color: '#fbbf24', y: 78 },
            ]}
            legend="violet energy, amber novelty, dots mark peak candidates"
          />
        </div>

        <div className="flex flex-wrap gap-4 border-t border-zinc-800 px-3 py-2 text-[10px] text-zinc-500">
          <span className="text-zinc-400">|</span> beats
          <span className="text-white">|</span> section boundaries
          <span className="text-amber-300">|</span> playhead
          <span className="text-cyan-300">-</span> instrument activity
          <span className="text-rose-300">-</span> vocal activity
          <span className="text-fuchsia-300">-</span> energy
          <span className="text-amber-300">-</span> novelty
        </div>
      </div>

      {analysis.sectionDiagnostics?.length ? (
        <div className="rounded-xl border border-zinc-800">
          <button
            type="button"
            onClick={() => setDiagOpen((o) => !o)}
            className="flex w-full items-center gap-2 px-3 py-2 text-left text-sm text-zinc-300 hover:bg-zinc-900/80"
          >
            {diagOpen ? <ChevronDown className="h-4 w-4" /> : <ChevronRight className="h-4 w-4" />}
            Per-section diagnostics
          </button>
          {diagOpen ? (
            <div className="max-h-48 overflow-auto border-t border-zinc-800 px-3 py-2 font-mono text-[10px] text-zinc-400">
              {analysis.sectionDiagnostics.map((row) => (
                <pre key={row.sectionIndex} className="whitespace-pre-wrap break-all border-b border-zinc-800/60 py-1">
                  {JSON.stringify(row)}
                </pre>
              ))}
            </div>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}

function Metric({ label, value, hint }: { label: string; value: string; hint?: string }) {
  return (
    <div className="rounded-lg border border-zinc-800 bg-zinc-900/40 px-3 py-2">
      <p className="text-[10px] uppercase tracking-wide text-zinc-500">{label}</p>
      <p className="font-mono text-sm text-zinc-100">{value}{hint ? <span className="text-zinc-500"> {hint}</span> : null}</p>
    </div>
  );
}

function AnalysisLane({
  title,
  legend,
  duration,
  beatGrid,
  boundaries,
  playheadPercent,
  fills,
  lines,
  markers,
}: {
  title: string;
  legend: string;
  duration: number;
  beatGrid: readonly number[];
  boundaries: readonly number[];
  playheadPercent: number;
  fills?: Array<{ series: readonly AudioAnalysisPoint[]; color: string }>;
  lines: Array<{ series: readonly AudioAnalysisPoint[]; color: string }>;
  markers?: Array<{ times: readonly number[]; color: string; y: number }>;
}) {
  return (
    <div className="border-b border-zinc-800/80 last:border-b-0">
      <div className="flex items-center justify-between px-3 py-2 text-[11px] uppercase tracking-[0.18em] text-zinc-500">
        <span>{title}</span>
        <span className="tracking-normal normal-case text-zinc-600">{legend}</span>
      </div>
      <div className="relative h-28 overflow-hidden bg-zinc-950">
        <svg className="absolute inset-0 h-full w-full" viewBox="0 0 100 100" preserveAspectRatio="none">
          {fills?.map((fill, index) => {
            const path = buildAreaPath(fill.series, duration);
            if (!path) {
              return null;
            }
            return <path key={`fill-${title}-${index}`} d={path} fill={fill.color} stroke="none" />;
          })}
          {beatGrid.map((beatTime) => (
            <line
              key={`${title}-beat-${beatTime}`}
              x1={(beatTime / duration) * 100}
              y1={0}
              x2={(beatTime / duration) * 100}
              y2={100}
              stroke="rgba(250,250,250,0.05)"
              strokeWidth={0.08}
            />
          ))}
          {boundaries.map((boundary) => (
            <line
              key={`${title}-boundary-${boundary}`}
              x1={(boundary / duration) * 100}
              y1={0}
              x2={(boundary / duration) * 100}
              y2={100}
              stroke="rgba(255,255,255,0.18)"
              strokeWidth={0.14}
            />
          ))}
          {markers?.flatMap((marker, markerIndex) => marker.times.map((timeSec) => (
            <circle
              key={`${title}-marker-${markerIndex}-${timeSec}`}
              cx={(timeSec / duration) * 100}
              cy={marker.y}
              r={0.55}
              fill={marker.color}
            />
          )))}
          {lines.map((line, index) => {
            const path = buildLinePath(line.series, duration);
            if (!path) {
              return null;
            }
            return (
              <path
                key={`line-${title}-${index}`}
                d={path}
                fill="none"
                stroke={line.color}
                strokeWidth={0.7}
                vectorEffect="non-scaling-stroke"
              />
            );
          })}
          <line
            x1={playheadPercent}
            y1={0}
            x2={playheadPercent}
            y2={100}
            stroke="rgba(251,191,36,0.95)"
            strokeWidth={0.18}
          />
        </svg>
      </div>
    </div>
  );
}
