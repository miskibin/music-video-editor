'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';

const clamp = (v: number, lo: number, hi: number) => Math.min(Math.max(v, lo), hi);
import { ChevronDown, ChevronRight } from 'lucide-react';
import type { AudioAnalysisResult } from '@/lib/audio-analysis-types';
import type { MelSpectrogramResult } from '@/lib/mel-spectrogram';
import { getEffectiveSectionBoundaries } from '@/lib/audio-analysis';
import { Button } from '@/components/ui/button';

const MIN_SEGMENT_SEC = 4;

type Props = {
  analysis: AudioAnalysisResult;
  mel: MelSpectrogramResult | null;
  melLoading: boolean;
  internalBoundaries: number[];
  sectionLabels: string[];
  onInternalBoundariesChange: (next: number[]) => void;
  onSectionLabelsChange: (next: string[]) => void;
};

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

export default function AudioAnalysisReview({
  analysis,
  mel,
  melLoading,
  internalBoundaries,
  sectionLabels,
  onInternalBoundariesChange,
  onSectionLabelsChange,
}: Props) {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const wrapRef = useRef<HTMLDivElement | null>(null);
  const [dragIndex, setDragIndex] = useState<number | null>(null);
  const [diagOpen, setDiagOpen] = useState(false);

  const duration = analysis.duration;
  const beatGrid = analysis.beatGrid;
  const novelty = analysis.noveltyStrength ?? analysis.onsetStrength;
  const soloWindows = analysis.soloWindows ?? [];
  const summary = analysis.summary;
  const tempoStability = analysis.tempoStability ?? null;

  const noveltyPeaks = useMemo(() => {
    if (novelty.length < 5) {
      return [] as number[];
    }
    const vals = novelty.map((p) => p.value);
    const sorted = [...vals].sort((a, b) => a - b);
    const th = sorted[Math.floor(sorted.length * 0.92)] ?? 0;
    const peaks: number[] = [];
    for (let i = 1; i < novelty.length - 1; i += 1) {
      const p = novelty[i];
      if (p.value >= th && p.value >= novelty[i - 1].value && p.value > novelty[i + 1].value) {
        peaks.push(p.time);
      }
    }
    return peaks.slice(0, 80);
  }, [novelty]);

  const displayBeats = useMemo(() => {
    const maxLines = 360;
    if (beatGrid.length <= maxLines) {
      return beatGrid;
    }
    const step = Math.ceil(beatGrid.length / maxLines);
    return beatGrid.filter((_, i) => i % step === 0);
  }, [beatGrid]);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas || !mel) {
      return;
    }

    const ctx = canvas.getContext('2d');
    if (!ctx) {
      return;
    }

    const w = canvas.clientWidth;
    const h = 220;
    const dpr = typeof window !== 'undefined' ? window.devicePixelRatio || 1 : 1;
    canvas.width = Math.floor(w * dpr);
    canvas.height = Math.floor(h * dpr);
    canvas.style.height = `${h}px`;
    ctx.scale(dpr, dpr);

    ctx.fillStyle = '#09090b';
    ctx.fillRect(0, 0, w, h);

    const { data, cols, rows } = mel;
    const cellW = w / cols;
    const cellH = h / rows;

    for (let x = 0; x < cols; x += 1) {
      for (let y = 0; y < rows; y += 1) {
        const v = data[y * cols + x];
        const t = Math.floor(v * 255);
        ctx.fillStyle = `rgb(${t},${Math.floor(t * 0.35)},${Math.floor(t * 0.55)})`;
        ctx.fillRect(x * cellW, h - (y + 1) * cellH, cellW + 0.5, cellH + 0.5);
      }
    }
  }, [mel]);

  const xToTime = useCallback(
    (x: number, width: number) => clamp(x / Math.max(width, 1), 0, 1) * duration,
    [duration],
  );

  const onPointerMove = useCallback(
    (e: React.PointerEvent) => {
      if (dragIndex === null || !wrapRef.current) {
        return;
      }
      const rect = wrapRef.current.getBoundingClientRect();
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
    },
    [beatGrid, dragIndex, duration, internalBoundaries, onInternalBoundariesChange, xToTime],
  );

  const endDrag = useCallback(() => {
    setDragIndex(null);
  }, []);

  const boundariesSorted = useMemo(
    () => [...internalBoundaries].sort((a, b) => a - b),
    [internalBoundaries],
  );

  const fullBoundaries = useMemo(
    () => [0, ...boundariesSorted, duration],
    [boundariesSorted, duration],
  );

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
        Section names are editable placeholders — they are not inferred from genre. Drag vertical handles to adjust structure; cuts snap to nearby beats when close.
      </p>

      <div
        ref={wrapRef}
        className="relative w-full select-none rounded-xl border border-zinc-800 bg-zinc-950"
        onPointerMove={onPointerMove}
        onPointerUp={endDrag}
        onPointerLeave={endDrag}
      >
        <div className="relative h-8 w-full overflow-hidden border-b border-zinc-800/80">
          {fullBoundaries.slice(0, -1).map((start, i) => {
            const end = fullBoundaries[i + 1];
            const left = `${(start / duration) * 100}%`;
            const width = `${((end - start) / duration) * 100}%`;
            return (
              <div
                key={`${start}-${end}`}
                className="absolute top-0 flex h-full items-center justify-center border-r border-zinc-800/80 px-1"
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

        <div className="relative">
          {melLoading ? (
            <div className="flex h-[220px] items-center justify-center text-sm text-zinc-500">Computing mel spectrogram…</div>
          ) : (
            <canvas ref={canvasRef} className="block h-[220px] w-full" />
          )}

          <svg className="pointer-events-none absolute inset-0 h-[220px] w-full" viewBox="0 0 100 100" preserveAspectRatio="none">
            {soloWindows.map((sw, idx) => (
              <rect
                key={`${sw.start}-${sw.end}-${idx}`}
                x={(sw.start / duration) * 100}
                y={0}
                width={((sw.end - sw.start) / duration) * 100}
                height={100}
                fill={String(sw.type) === 'instrumental' ? 'rgba(59,130,246,0.12)' : 'rgba(244,63,94,0.1)'}
              />
            ))}
            {displayBeats.map((bt) => (
              <line
                key={`b-${bt}`}
                x1={(bt / duration) * 100}
                y1={0}
                x2={(bt / duration) * 100}
                y2={100}
                stroke="rgba(250,250,250,0.06)"
                strokeWidth={0.08}
              />
            ))}
            {noveltyPeaks.map((nt) => (
              <circle
                key={`n-${nt}`}
                cx={(nt / duration) * 100}
                cy={92}
                r={0.35}
                fill="rgba(250,204,21,0.85)"
              />
            ))}
            {boundariesSorted.map((bt) => (
              <line
                key={`cut-${bt}`}
                x1={(bt / duration) * 100}
                y1={0}
                x2={(bt / duration) * 100}
                y2={100}
                stroke="rgba(255,255,255,0.35)"
                strokeWidth={0.12}
              />
            ))}
          </svg>

          {boundariesSorted.map((bt, i) => (
            <button
              key={`handle-${bt}`}
              type="button"
              aria-label={`Section boundary ${i + 1}`}
              className="absolute top-0 h-[220px] w-3 -translate-x-1/2 cursor-ew-resize bg-transparent"
              style={{ left: `${(bt / duration) * 100}%` }}
              onPointerDown={(e) => {
                e.currentTarget.setPointerCapture(e.pointerId);
                setDragIndex(i);
              }}
            />
          ))}
        </div>

        <div className="flex flex-wrap gap-4 border-t border-zinc-800 px-3 py-2 text-[10px] text-zinc-500">
          <span className="text-zinc-400">■</span> beats
          <span className="text-amber-300">●</span> novelty peaks
          <span className="text-blue-400/80">■</span> instrumental
          <span className="text-rose-400/80">■</span> vocal emphasis
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
