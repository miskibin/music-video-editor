'use client';
import React from 'react';
import { Clip } from '@/lib/types';
import { Input } from '@/components/ui/input';

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

function PropertiesPanel({ clip, onChange }: Props) {
  if (!clip) {
    return (
      <aside className="flex w-96 shrink-0 flex-col overflow-hidden border-l border-zinc-800/80 bg-zinc-950">
        <div className="flex h-full items-center justify-center px-8 text-center">
          <p className="text-sm text-zinc-500">Select a clip to edit.</p>
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
    <aside className="flex w-96 shrink-0 flex-col overflow-hidden border-l border-zinc-800/80 bg-zinc-950">
      <div className="flex h-11 shrink-0 items-center justify-between border-b border-zinc-800/80 px-4">
        <span className="text-xs font-medium text-zinc-500">Clip</span>
        <span className="rounded-md bg-zinc-900 px-2 py-0.5 text-[10px] font-medium uppercase tracking-wider text-zinc-500">
          {clipKind}
        </span>
      </div>

      <div className="panel-scrollbar min-h-0 flex-1 overflow-y-auto px-4 py-4">
        <div className="flex flex-col gap-5">
          {isTextClip ? (
            <div className="flex flex-col gap-1.5">
              <span className="text-[11px] text-zinc-600">Subtitle</span>
              <Input
                id="clip-subtitle-line"
                type="text"
                value={clip.overlayText ?? clip.name}
                onChange={(e) => onChange(clip.id, { overlayText: e.target.value })}
                className="h-9 border-zinc-800/60 bg-transparent text-sm text-zinc-100 focus-visible:ring-1 focus-visible:ring-zinc-600"
              />
            </div>
          ) : (
            <div className="flex flex-col gap-1.5">
              <span className="text-[11px] text-zinc-600">Name</span>
              <Input
                id="clip-name"
                type="text"
                value={clip.name}
                onChange={(e) => onChange(clip.id, { name: e.target.value })}
                className="h-9 border-zinc-800/60 bg-transparent text-sm text-zinc-100 placeholder:text-zinc-600 focus-visible:ring-1 focus-visible:ring-zinc-600"
                placeholder="Name"
              />
            </div>
          )}

          <div className="flex flex-col gap-1.5">
            <span className="text-[11px] text-zinc-600">Duration (s)</span>
            <Input
              id="clip-duration"
              type="number"
              min={1}
              step={0.1}
              value={durationValue}
              onChange={(e) => onChange(clip.id, { duration: Math.max(1, Number(e.target.value) || 1) })}
              className="h-9 border-zinc-800/60 bg-transparent font-mono text-sm tabular-nums text-zinc-200 focus-visible:ring-1 focus-visible:ring-zinc-600"
            />
          </div>

          <div className="border-t border-zinc-800/60 pt-4">
            <p className="mb-2.5 text-[11px] font-medium uppercase tracking-wider text-zinc-600">Timeline</p>
            <div className="flex flex-col gap-2 font-mono text-xs tabular-nums text-zinc-400">
              <div className="flex justify-between gap-3">
                <span className="text-zinc-600">Start</span>
                <span className="text-zinc-300">{formatTime(clip.start)}</span>
              </div>
              <div className="flex justify-between gap-3">
                <span className="text-zinc-600">End</span>
                <span className="text-zinc-300">{formatTime(clip.start + clip.duration)}</span>
              </div>
            </div>

            {isAudioClip ? (
              <div className="mt-3 flex flex-col gap-2 border-t border-zinc-800/40 pt-3 font-mono text-xs tabular-nums text-zinc-400">
                <div className="flex justify-between gap-3">
                  <span className="text-zinc-600">Trim</span>
                  <span className="text-zinc-300">
                    {formatTime(trimStart)}
                    {' '}
                    —
                    {' '}
                    {formatTime(trimEnd)}
                  </span>
                </div>
                <div className="flex justify-between gap-3">
                  <span className="text-zinc-600">Source</span>
                  <span className="text-zinc-300">{sourceDuration.toFixed(1)}s</span>
                </div>
              </div>
            ) : null}
          </div>
        </div>
      </div>
    </aside>
  );
}

export default React.memo(PropertiesPanel);
