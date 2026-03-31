'use client';
import React from 'react';
import { Eye, Lock } from 'lucide-react';
import { Video, Music, Type } from 'lucide-react';
import TimelineClip from './TimelineClip';
import { Clip, Track } from '@/lib/types';
import { Button } from '@/components/ui/button';

const ICONS = {
  video: Video,
  audio: Music,
  text: Type,
};

const GRID_STYLE = {
  backgroundImage: 'linear-gradient(to right, #27272a 1px, transparent 1px)',
  backgroundSize: '100px 100%',
  opacity: 0.2,
} as const;

interface Props {
  track: Track;
  width: number;
  clips: Clip[];
  selectedClipId: string | null;
  pixelsPerSecond: number;
  activeAudioClipId: string | null;
  waveformTime?: number;
  isWaveformAnimating: boolean;
  onSelectClip: (id: string | null) => void;
  onChangeClip: (id: string, updates: Partial<Clip>) => void;
  onDragEnd: (id: string) => void;
}

function TimelineTrack({
  track,
  width,
  clips,
  selectedClipId,
  pixelsPerSecond,
  activeAudioClipId,
  waveformTime,
  isWaveformAnimating,
  onSelectClip,
  onChangeClip,
  onDragEnd,
}: Props) {
  const Icon = ICONS[track.type];
  const contentStyle = React.useMemo(() => ({ minWidth: `${width}px` }), [width]);

  return (
    <div className="flex h-12 border-b border-zinc-800/50 group w-max min-w-full">
      <div className="w-40 shrink-0 bg-zinc-900 border-r border-zinc-800 flex items-center justify-between px-3 sticky left-0 z-40">
        <div className="flex items-center gap-2 text-zinc-400">
          <Icon className="w-3.5 h-3.5" />
          <span className="text-xs font-medium truncate w-16">{track.name}</span>
        </div>
        <div className="flex items-center gap-0.5 opacity-0 group-hover:opacity-100 transition-opacity">
          <Button variant="ghost" size="icon" className="h-6 w-6 text-zinc-500 hover:text-zinc-300">
            <Lock className="w-3 h-3" />
          </Button>
          <Button variant="ghost" size="icon" className="h-6 w-6 text-zinc-500 hover:text-zinc-300">
            <Eye className="w-3 h-3" />
          </Button>
        </div>
      </div>

      <div className="flex-1 relative bg-zinc-950/50" style={contentStyle}>
        <div className="absolute inset-0 pointer-events-none" style={GRID_STYLE} />
        {clips.map((clip) => (
          <TimelineClip
            key={clip.id}
            clip={clip}
            selected={clip.id === selectedClipId}
            pixelsPerSecond={pixelsPerSecond}
            waveformTime={clip.id === activeAudioClipId ? waveformTime : undefined}
            isWaveformAnimating={clip.id === activeAudioClipId && isWaveformAnimating}
            isActiveAudioClip={clip.id === activeAudioClipId}
            onSelect={onSelectClip}
            onChange={onChangeClip}
            onDragEnd={onDragEnd}
          />
        ))}
      </div>
    </div>
  );
}

function areTrackPropsEqual(previous: Props, next: Props) {
  if (
    previous.track !== next.track
    || previous.width !== next.width
    || previous.clips !== next.clips
    || previous.selectedClipId !== next.selectedClipId
    || previous.pixelsPerSecond !== next.pixelsPerSecond
    || previous.activeAudioClipId !== next.activeAudioClipId
    || previous.isWaveformAnimating !== next.isWaveformAnimating
    || previous.onSelectClip !== next.onSelectClip
    || previous.onChangeClip !== next.onChangeClip
    || previous.onDragEnd !== next.onDragEnd
  ) {
    return false;
  }

  const previousHasAnimatedClip = previous.isWaveformAnimating
    && previous.clips.some((clip) => clip.id === previous.activeAudioClipId);
  const nextHasAnimatedClip = next.isWaveformAnimating
    && next.clips.some((clip) => clip.id === next.activeAudioClipId);

  if (!previousHasAnimatedClip && !nextHasAnimatedClip) {
    return true;
  }

  return previous.waveformTime === next.waveformTime;
}

export default React.memo(TimelineTrack, areTrackPropsEqual);
