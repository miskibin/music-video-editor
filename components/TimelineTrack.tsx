'use client';
import React from 'react';
import { Eye, Lock } from 'lucide-react';
import { Video, Music, Type } from 'lucide-react';
import TimelineClip from './TimelineClip';
import { MEDIA_GALLERY_DRAG_MIME, parseMediaGalleryDragPayload } from '@/lib/media-drag';
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
  trackRowHeight: number;
  width: number;
  timelineDuration: number;
  scrollLeft: number;
  clips: Clip[];
  selectedClipId: string | null;
  pixelsPerSecond: number;
  snapEnabled: boolean;
  snapPoints: readonly number[];
  onSelectClip: (id: string | null) => void;
  onChangeClip: (id: string, updates: Partial<Clip>) => void;
  onDragEnd: (id: string) => void;
  onDropMediaFromGallery?: (payload: { trackId: string; timeSec: number; assetId: string }) => void;
}

function TimelineTrack({
  track,
  trackRowHeight,
  width,
  timelineDuration,
  scrollLeft,
  clips,
  selectedClipId,
  pixelsPerSecond,
  snapEnabled,
  snapPoints,
  onSelectClip,
  onChangeClip,
  onDragEnd,
  onDropMediaFromGallery,
}: Props) {
  const Icon = ICONS[track.type];
  const contentStyle = React.useMemo(() => ({ minWidth: `${width}px` }), [width]);
  const rowStyle = React.useMemo(() => ({ height: trackRowHeight, minHeight: trackRowHeight }), [trackRowHeight]);
  const [isMediaDragOver, setIsMediaDragOver] = React.useState(false);

  const snapTime = React.useCallback(
    (raw: number) => {
      if (!snapEnabled || snapPoints.length === 0) {
        return Math.round(raw * 1000) / 1000;
      }

      const threshold = 0.12;
      let best = raw;
      let bestDist = Number.POSITIVE_INFINITY;
      for (const t of snapPoints) {
        const d = Math.abs(t - raw);
        if (d < bestDist && d <= threshold) {
          bestDist = d;
          best = t;
        }
      }

      return Math.round(best * 1000) / 1000;
    },
    [snapEnabled, snapPoints],
  );

  const handleDragOver = React.useCallback(
    (event: React.DragEvent) => {
      if (!onDropMediaFromGallery) {
        return;
      }

      if (!event.dataTransfer.types.includes(MEDIA_GALLERY_DRAG_MIME)) {
        return;
      }

      event.preventDefault();
      event.dataTransfer.dropEffect = 'copy';
      setIsMediaDragOver(true);
    },
    [onDropMediaFromGallery],
  );

  React.useEffect(() => {
    const clear = () => setIsMediaDragOver(false);
    document.addEventListener('dragend', clear);
    return () => document.removeEventListener('dragend', clear);
  }, []);

  const handleDrop = React.useCallback(
    (event: React.DragEvent) => {
      setIsMediaDragOver(false);
      if (!onDropMediaFromGallery) {
        return;
      }

      const payload = parseMediaGalleryDragPayload(event.dataTransfer);
      if (!payload) {
        return;
      }

      event.preventDefault();
      const rect = event.currentTarget.getBoundingClientRect();
      const x = event.clientX - rect.left + scrollLeft;
      const rawTime = Math.max(0, Math.min(x / pixelsPerSecond, timelineDuration));
      const timeSec = snapTime(rawTime);
      onDropMediaFromGallery({ trackId: track.id, timeSec, assetId: payload.assetId });
    },
    [onDropMediaFromGallery, pixelsPerSecond, scrollLeft, snapTime, timelineDuration, track.id],
  );

  return (
    <div className="flex border-b border-zinc-800/50 group w-max min-w-full" style={rowStyle}>
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

      <div
        className={`flex-1 relative bg-zinc-950/50 ${isMediaDragOver ? 'ring-2 ring-inset ring-sky-500/60 bg-sky-950/20' : ''}`}
        style={contentStyle}
        onDragOver={handleDragOver}
        onDrop={handleDrop}
      >
        <div className="absolute inset-0 pointer-events-none" style={GRID_STYLE} />
        {clips.map((clip) => (
          <TimelineClip
            key={clip.id}
            clip={clip}
            selected={clip.id === selectedClipId}
            pixelsPerSecond={pixelsPerSecond}
            snapEnabled={snapEnabled}
            snapPoints={snapPoints}
            onSelect={onSelectClip}
            onChange={onChangeClip}
            onDragEnd={onDragEnd}
            onGalleryMediaDrop={
              onDropMediaFromGallery
                ? ({ timeSec, assetId }) => onDropMediaFromGallery({
                  trackId: track.id,
                  timeSec: snapTime(timeSec),
                  assetId,
                })
                : undefined
            }
          />
        ))}
      </div>
    </div>
  );
}

function areTrackPropsEqual(previous: Props, next: Props) {
  return previous.track === next.track
    && previous.trackRowHeight === next.trackRowHeight
    && previous.width === next.width
    && previous.timelineDuration === next.timelineDuration
    && previous.scrollLeft === next.scrollLeft
    && previous.clips === next.clips
    && previous.selectedClipId === next.selectedClipId
    && previous.pixelsPerSecond === next.pixelsPerSecond
    && previous.snapEnabled === next.snapEnabled
    && previous.snapPoints === next.snapPoints
    && previous.onSelectClip === next.onSelectClip
    && previous.onChangeClip === next.onChangeClip
    && previous.onDragEnd === next.onDragEnd
    && previous.onDropMediaFromGallery === next.onDropMediaFromGallery;
}

export default React.memo(TimelineTrack, areTrackPropsEqual);
