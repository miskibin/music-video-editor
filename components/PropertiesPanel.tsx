'use client';
import React from 'react';
import { Clip } from '@/lib/types';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';

interface Props {
  clip: Clip | null;
  onChange: (id: string, updates: Partial<Clip>) => void;
}

const getClipKind = (clip: Clip) => {
  if (clip.trackId.startsWith('a')) {
    return 'Audio';
  }

  if (clip.trackId.startsWith('t')) {
    return 'Text';
  }

  return 'Video';
};

const formatTime = (seconds: number) => {
  const safeSeconds = Math.max(seconds, 0);
  const minutes = Math.floor(safeSeconds / 60);
  const wholeSeconds = Math.floor(safeSeconds % 60);
  const tenths = Math.floor((safeSeconds % 1) * 10);
  return `${minutes.toString().padStart(2, '0')}:${wholeSeconds.toString().padStart(2, '0')}.${tenths}`;
};

const formatSeconds = (seconds: number) => `${seconds.toFixed(1)}s`;

function PropertiesPanel({ clip, onChange }: Props) {
  if (!clip) {
    return (
      <aside className="flex w-72 shrink-0 flex-col overflow-hidden border-l border-zinc-800/80 bg-zinc-950">
        <div className="flex h-full items-center justify-center px-6 text-center">
          <div className="flex max-w-44 flex-col gap-2">
            <p className="text-[11px] font-medium uppercase tracking-[0.24em] text-zinc-600">Inspector</p>
            <p className="text-sm text-zinc-400">Select a clip to edit its details.</p>
          </div>
        </div>
      </aside>
    );
  }

  const clipKind = getClipKind(clip);
  const isAudioClip = clipKind === 'Audio';
  const isTextClip = clipKind === 'Text';
  const trimStart = clip.trimStart ?? 0;
  const sourceDuration = clip.sourceDuration ?? clip.duration;
  const trimEnd = Math.min(trimStart + clip.duration, sourceDuration);
  const durationValue = Number(clip.duration.toFixed(1));

  return (
    <aside className="flex w-72 shrink-0 flex-col overflow-hidden border-l border-zinc-800/80 bg-zinc-950">
      <div className="flex h-12 items-center border-b border-zinc-800/80 px-4 shrink-0">
        <h2 className="text-sm font-medium text-zinc-200">Clip Properties</h2>
      </div>

      <div className="panel-scrollbar min-h-0 flex-1 overflow-y-auto px-3 py-3">
        <div className="flex flex-col gap-3">
          <section className="flex flex-col gap-4 rounded-xl border border-zinc-800/80 bg-zinc-900/40 p-4">
            <div className="flex items-start justify-between gap-3">
              <div className="min-w-0 flex-1">
                <p className="text-[11px] font-medium uppercase tracking-[0.24em] text-zinc-600">Inspector</p>
                <p className="mt-1 truncate text-sm font-medium text-zinc-100">{clip.name}</p>
              </div>
              <span className="rounded-full border border-zinc-800 bg-zinc-950 px-2.5 py-1 text-[11px] font-medium uppercase tracking-[0.18em] text-zinc-400">
                {clipKind}
              </span>
            </div>

            <div className="grid grid-cols-2 gap-2">
              <div className="rounded-lg border border-zinc-800/70 bg-zinc-950/80 px-3 py-2">
                <p className="text-[11px] uppercase tracking-[0.18em] text-zinc-600">Start</p>
                <p className="mt-1 font-mono text-sm text-zinc-200">{formatTime(clip.start)}</p>
              </div>
              <div className="rounded-lg border border-zinc-800/70 bg-zinc-950/80 px-3 py-2">
                <p className="text-[11px] uppercase tracking-[0.18em] text-zinc-600">End</p>
                <p className="mt-1 font-mono text-sm text-zinc-200">{formatTime(clip.start + clip.duration)}</p>
              </div>
            </div>
          </section>

          <section className="flex flex-col gap-3 rounded-xl border border-zinc-800/80 bg-zinc-900/30 p-4">
            <p className="text-[11px] font-medium uppercase tracking-[0.24em] text-zinc-600">Details</p>

            <div className="flex flex-col gap-2">
              <Label htmlFor="clip-name" className="text-xs font-medium text-zinc-400">Name</Label>
              <Input
                id="clip-name"
                type="text"
                value={clip.name}
                onChange={(e) => onChange(clip.id, { name: e.target.value })}
                className="h-9 border-zinc-800/80 bg-zinc-950/80 text-zinc-100 focus-visible:ring-zinc-600"
              />
            </div>

            {isTextClip ? (
              <div className="flex flex-col gap-2">
                <Label htmlFor="clip-text" className="text-xs font-medium text-zinc-400">Overlay Text</Label>
                <Input
                  id="clip-text"
                  type="text"
                  value={clip.overlayText ?? ''}
                  onChange={(e) => onChange(clip.id, { overlayText: e.target.value })}
                  className="h-9 border-zinc-800/80 bg-zinc-950/80 text-zinc-100 focus-visible:ring-zinc-600"
                />
              </div>
            ) : null}

            <div className="flex flex-col gap-2">
              <Label htmlFor="clip-duration" className="text-xs font-medium text-zinc-400">Duration</Label>
              <Input
                id="clip-duration"
                type="number"
                min={1}
                step={0.1}
                value={durationValue}
                onChange={(e) => onChange(clip.id, { duration: Math.max(1, Number(e.target.value) || 1) })}
                className="h-9 border-zinc-800/80 bg-zinc-950/80 font-mono text-zinc-100 focus-visible:ring-zinc-600"
              />
            </div>
          </section>

          <section className="flex flex-col gap-3 rounded-xl border border-zinc-800/80 bg-zinc-900/30 p-4">
            <p className="text-[11px] font-medium uppercase tracking-[0.24em] text-zinc-600">Timing</p>

            <div className="grid grid-cols-2 gap-2">
              <div className="rounded-lg border border-zinc-800/70 bg-zinc-950/80 px-3 py-2">
                <p className="text-[11px] uppercase tracking-[0.18em] text-zinc-600">Start</p>
                <p className="mt-1 font-mono text-sm text-zinc-200">{formatTime(clip.start)}</p>
              </div>
              <div className="rounded-lg border border-zinc-800/70 bg-zinc-950/80 px-3 py-2">
                <p className="text-[11px] uppercase tracking-[0.18em] text-zinc-600">Length</p>
                <p className="mt-1 font-mono text-sm text-zinc-200">{formatSeconds(clip.duration)}</p>
              </div>
            </div>

            {isAudioClip ? (
              <div className="grid grid-cols-3 gap-2">
                <div className="rounded-lg border border-zinc-800/70 bg-zinc-950/80 px-3 py-2">
                  <p className="text-[11px] uppercase tracking-[0.18em] text-zinc-600">Trim In</p>
                  <p className="mt-1 font-mono text-sm text-zinc-200">{formatTime(trimStart)}</p>
                </div>
                <div className="rounded-lg border border-zinc-800/70 bg-zinc-950/80 px-3 py-2">
                  <p className="text-[11px] uppercase tracking-[0.18em] text-zinc-600">Trim Out</p>
                  <p className="mt-1 font-mono text-sm text-zinc-200">{formatTime(trimEnd)}</p>
                </div>
                <div className="rounded-lg border border-zinc-800/70 bg-zinc-950/80 px-3 py-2">
                  <p className="text-[11px] uppercase tracking-[0.18em] text-zinc-600">Source</p>
                  <p className="mt-1 font-mono text-sm text-zinc-200">{formatSeconds(sourceDuration)}</p>
                </div>
              </div>
            ) : null}
          </section>

          <section className="flex flex-col gap-3 rounded-xl border border-zinc-800/80 bg-zinc-900/30 p-4">
            <p className="text-[11px] font-medium uppercase tracking-[0.24em] text-zinc-600">Asset</p>

            <div className="grid grid-cols-2 gap-2 text-sm">
              <div className="rounded-lg border border-zinc-800/70 bg-zinc-950/80 px-3 py-2">
                <p className="text-[11px] uppercase tracking-[0.18em] text-zinc-600">Source</p>
                <p className="mt-1 text-zinc-300">{clip.assetId ? 'Uploaded' : 'Sample'}</p>
              </div>
              <div className="rounded-lg border border-zinc-800/70 bg-zinc-950/80 px-3 py-2">
                <p className="text-[11px] uppercase tracking-[0.18em] text-zinc-600">Style</p>
                <p className="mt-1 text-zinc-300">{clip.visualType ?? clipKind}</p>
              </div>
            </div>
          </section>
        </div>
      </div>
    </aside>
  );
}

export default React.memo(PropertiesPanel);
