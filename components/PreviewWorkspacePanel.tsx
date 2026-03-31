'use client';

import React from 'react';

const formatTimecode = (seconds: number) => {
  const safe = Math.max(seconds, 0);
  const m = Math.floor(safe / 60);
  const s = Math.floor(safe % 60);
  const f = Math.floor((safe % 1) * 10);
  return `${m.toString().padStart(2, '0')}:${s.toString().padStart(2, '0')}.${f}`;
};

interface Props {
  projectName: string;
  currentTime: number;
  timelineDuration: number;
  bpm: number | null;
  activeVisualName: string | null;
  subtitleLine: string;
  subtitleCueCount: number;
  backgroundSegmentCount: number;
}

function PreviewWorkspacePanel({
  projectName,
  currentTime,
  timelineDuration,
  bpm,
  activeVisualName,
  subtitleLine,
  subtitleCueCount,
  backgroundSegmentCount,
}: Props) {
  const trimmedSubtitle = subtitleLine.trim();
  const displayBpm = bpm != null ? `${Math.round(bpm)} BPM` : '—';

  return (
    <aside className="flex w-56 shrink-0 flex-col overflow-hidden border-r border-zinc-800/80 bg-zinc-950/90">
      <div className="shrink-0 border-b border-zinc-800/80 px-3 py-3">
        <p className="text-[11px] font-medium uppercase tracking-[0.24em] text-zinc-600">Project</p>
        <p className="mt-1 truncate text-sm font-medium text-zinc-100" title={projectName}>
          {projectName}
        </p>
      </div>

      <div className="panel-scrollbar min-h-0 flex-1 space-y-4 overflow-y-auto px-3 py-4">
        <section className="space-y-2">
          <p className="text-[11px] font-medium uppercase tracking-[0.24em] text-zinc-600">Playback</p>
          <div className="rounded-lg border border-zinc-800/70 bg-zinc-900/50 px-3 py-2.5">
            <p className="font-mono text-lg tabular-nums text-zinc-100">{formatTimecode(currentTime)}</p>
            <p className="mt-1 text-[11px] text-zinc-500">
              of {formatTimecode(timelineDuration)} timeline
            </p>
          </div>
        </section>

        <section className="space-y-2">
          <p className="text-[11px] font-medium uppercase tracking-[0.24em] text-zinc-600">Music</p>
          <div className="rounded-lg border border-zinc-800/70 bg-zinc-900/50 px-3 py-2">
            <p className="text-sm text-zinc-200">{displayBpm}</p>
            <p className="mt-0.5 text-[11px] text-zinc-500">Beat grid & motion</p>
          </div>
        </section>

        <section className="space-y-2">
          <p className="text-[11px] font-medium uppercase tracking-[0.24em] text-zinc-600">Frame</p>
          <div className="rounded-lg border border-zinc-800/70 bg-zinc-900/50 px-3 py-2">
            <p className="line-clamp-2 text-sm text-zinc-200" title={activeVisualName ?? undefined}>
              {activeVisualName ?? 'No visual clip'}
            </p>
          </div>
        </section>

        <section className="space-y-2">
          <p className="text-[11px] font-medium uppercase tracking-[0.24em] text-zinc-600">Subtitles</p>
          <div className="rounded-lg border border-zinc-800/70 bg-zinc-900/50 px-3 py-2">
            <p className="line-clamp-4 text-sm leading-snug text-zinc-300">
              {trimmedSubtitle.length > 0 ? trimmedSubtitle : 'No line at playhead'}
            </p>
            <p className="mt-2 text-[11px] text-zinc-500">
              {subtitleCueCount} cue{subtitleCueCount === 1 ? '' : 's'} on timeline
            </p>
          </div>
        </section>

        <section className="space-y-2">
          <p className="text-[11px] font-medium uppercase tracking-[0.24em] text-zinc-600">Composition</p>
          <div className="rounded-lg border border-zinc-800/70 bg-zinc-900/50 px-3 py-2 text-[11px] text-zinc-400">
            <p>{backgroundSegmentCount} background segment{backgroundSegmentCount === 1 ? '' : 's'}</p>
          </div>
        </section>
      </div>
    </aside>
  );
}

export default React.memo(PreviewWorkspacePanel);
