'use client';
import { useCallback, useMemo, useRef, useState } from 'react';
import TimelineTrack from './TimelineTrack';
import { Trash2, Magnet, Pause, Play, SkipBack, SkipForward, Square, Volume2, Maximize2 } from 'lucide-react';
import { Clip, Track } from '@/lib/types';
import { PIXELS_PER_SECOND } from '@/lib/constants';
import { Button } from '@/components/ui/button';
import { Slider } from '@/components/ui/slider';
import { Separator } from '@/components/ui/separator';
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip';

interface Props {
  tracks: Track[];
  clips: Clip[];
  selectedClipId: string | null;
  onSelectClip: (id: string | null) => void;
  onChangeClip: (id: string, updates: Partial<Clip>) => void;
  onDeleteClip: (id: string) => void;
  onDragEnd: (id: string) => void;
  currentTime: number;
  onTimeChange: (time: number) => void;
  isPlaying: boolean;
  hasPlayableAudio: boolean;
  onPlay: () => void;
  onPause: () => void;
  onStop: () => void;
  onStepTime: (delta: number) => void;
}

const EMPTY_CLIPS: Clip[] = [];

export default function Timeline({
  tracks,
  clips,
  selectedClipId,
  onSelectClip,
  onChangeClip,
  onDeleteClip,
  onDragEnd,
  currentTime,
  onTimeChange,
  isPlaying,
  hasPlayableAudio,
  onPlay,
  onPause,
  onStop,
  onStepTime,
}: Props) {
  const [snapEnabled, setSnapEnabled] = useState(true);
  const [zoom, setZoom] = useState(1);
  const rulerRef = useRef<HTMLDivElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);

  const pixelsPerSecond = useMemo(() => PIXELS_PER_SECOND * zoom, [zoom]);
  const maxClipEnd = useMemo(
    () => clips.reduce((max, clip) => Math.max(max, clip.start + clip.duration), 0),
    [clips],
  );
  const timelineDuration = useMemo(
    () => Math.max(60 * 5, maxClipEnd + 60),
    [maxClipEnd],
  );
  const timelineWidth = useMemo(
    () => timelineDuration * pixelsPerSecond,
    [pixelsPerSecond, timelineDuration],
  );
  const clipsByTrack = useMemo(() => {
    const groupedClips = new Map<string, Clip[]>();

    clips.forEach((clip) => {
      const currentTrackClips = groupedClips.get(clip.trackId);
      if (currentTrackClips) {
        currentTrackClips.push(clip);
        return;
      }

      groupedClips.set(clip.trackId, [clip]);
    });

    return groupedClips;
  }, [clips]);
  const rulerSegments = useMemo(
    () => Array.from({ length: Math.ceil(timelineDuration / 5) }, (_, index) => index * 5),
    [timelineDuration],
  );
  const rulerWidthStyle = useMemo(
    () => ({ width: `${timelineWidth}px` }),
    [timelineWidth],
  );
  const playheadStyle = useMemo(
    () => ({ left: `${currentTime * pixelsPerSecond}px` }),
    [currentTime, pixelsPerSecond],
  );
  const trackPlayheadStyle = useMemo(
    () => ({ left: `${currentTime * pixelsPerSecond + 160}px` }),
    [currentTime, pixelsPerSecond],
  );
  const deleteDisabled = !selectedClipId;

  const handleZoomIn = useCallback(() => {
    setZoom((currentZoom) => Math.min(currentZoom + 0.5, 5));
  }, []);
  const handleZoomOut = useCallback(() => {
    setZoom((currentZoom) => Math.max(currentZoom - 0.5, 0.5));
  }, []);
  const handleZoomChange = useCallback((values: number[]) => {
    const [nextZoom = 1] = values;
    setZoom(nextZoom);
  }, []);
  const handleDeleteSelected = useCallback(() => {
    if (!selectedClipId) {
      return;
    }

    onDeleteClip(selectedClipId);
  }, [onDeleteClip, selectedClipId]);
  const handleToggleSnap = useCallback(() => {
    setSnapEnabled((enabled) => !enabled);
  }, []);
  const handleClearSelection = useCallback(() => {
    onSelectClip(null);
  }, [onSelectClip]);
  const handleScroll = useCallback((e: React.UIEvent<HTMLDivElement>) => {
    if (rulerRef.current) {
      rulerRef.current.scrollLeft = e.currentTarget.scrollLeft;
    }
  }, []);
  const handleRulerPointerDown = useCallback((e: React.PointerEvent) => {
    e.stopPropagation();
    if (!rulerRef.current || !containerRef.current) {
      return;
    }

    const target = e.currentTarget;
    target.setPointerCapture(e.pointerId);

    const updateTime = (clientX: number) => {
      const rect = rulerRef.current?.getBoundingClientRect();
      const scrollLeft = containerRef.current?.scrollLeft ?? 0;
      if (!rect) {
        return;
      }

      const x = clientX - rect.left + scrollLeft;
      const nextTime = Math.max(0, Math.min(x / pixelsPerSecond, timelineDuration));
      onTimeChange(nextTime);
    };

    updateTime(e.clientX);

    const onPointerMove = (moveEvent: PointerEvent) => {
      updateTime(moveEvent.clientX);
    };

    const onPointerUp = (upEvent: PointerEvent) => {
      target.releasePointerCapture(upEvent.pointerId);
      window.removeEventListener('pointermove', onPointerMove);
      window.removeEventListener('pointerup', onPointerUp);
    };

    window.addEventListener('pointermove', onPointerMove);
    window.addEventListener('pointerup', onPointerUp);
  }, [onTimeChange, pixelsPerSecond, timelineDuration]);
  const formatTime = useCallback((seconds: number) => {
    const minutes = Math.floor(seconds / 60);
    const wholeSeconds = Math.floor(seconds % 60);
    return `${minutes.toString().padStart(2, '0')}:${wholeSeconds.toString().padStart(2, '0')}`;
  }, []);

  return (
    <div className="flex flex-col h-full bg-zinc-950 select-none" onClick={handleClearSelection}>
      <div className="h-10 border-b border-zinc-800 flex items-center justify-between px-4 shrink-0 bg-zinc-900" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center gap-1 flex-1">
          <Tooltip>
            <TooltipTrigger asChild>
              <span>
                <Button
                  variant="ghost"
                  size="icon"
                  onClick={handleDeleteSelected}
                  disabled={deleteDisabled}
                  className="h-7 w-7 text-zinc-400 hover:text-white hover:bg-zinc-800"
                >
                  <Trash2 className="w-4 h-4" />
                </Button>
              </span>
            </TooltipTrigger>
            <TooltipContent className="bg-zinc-800 text-zinc-100 border-zinc-700">
              <p>Delete Selected Clip</p>
            </TooltipContent>
          </Tooltip>

          <Separator orientation="vertical" className="h-4 bg-zinc-700 mx-1" />

          <Tooltip>
            <TooltipTrigger asChild>
              <Button
                variant={snapEnabled ? 'secondary' : 'ghost'}
                size="icon"
                onClick={handleToggleSnap}
                className={`h-7 w-7 ${snapEnabled ? 'bg-zinc-700 text-white hover:bg-zinc-600' : 'text-zinc-400 hover:text-white hover:bg-zinc-800'}`}
              >
                <Magnet className="w-4 h-4" />
              </Button>
            </TooltipTrigger>
            <TooltipContent className="bg-zinc-800 text-zinc-100 border-zinc-700">
              <p>Toggle Snapping</p>
            </TooltipContent>
          </Tooltip>
        </div>

        <div className="flex items-center justify-center gap-4 flex-1">
          <span className="font-mono text-xs text-zinc-400 w-12 text-right">{formatTime(currentTime)}</span>
          <div className="flex items-center gap-1">
            <Button variant="ghost" size="icon" onClick={() => onStepTime(-5)} disabled={!hasPlayableAudio} className="h-7 w-7 text-zinc-400 hover:text-white hover:bg-zinc-800 disabled:opacity-40">
              <SkipBack className="w-4 h-4" />
            </Button>
            <Button variant="ghost" size="icon" onClick={isPlaying ? onPause : onPlay} disabled={!hasPlayableAudio} className="h-7 w-7 text-zinc-300 hover:text-white hover:bg-zinc-800 disabled:opacity-40">
              {isPlaying ? <Pause className="w-4 h-4" /> : <Play className="w-4 h-4" />}
            </Button>
            <Button variant="ghost" size="icon" onClick={onStop} disabled={!hasPlayableAudio && currentTime === 0} className="h-7 w-7 text-zinc-400 hover:text-white hover:bg-zinc-800 disabled:opacity-40">
              <Square className="w-4 h-4" />
            </Button>
            <Button variant="ghost" size="icon" onClick={() => onStepTime(5)} disabled={!hasPlayableAudio} className="h-7 w-7 text-zinc-400 hover:text-white hover:bg-zinc-800 disabled:opacity-40">
              <SkipForward className="w-4 h-4" />
            </Button>
          </div>
          <span className="font-mono text-xs text-zinc-600 w-12 text-left">{formatTime(timelineDuration)}</span>
        </div>

        <div className="flex items-center justify-end gap-1 flex-1">
          <Button variant="ghost" size="icon" className="h-7 w-7 text-zinc-400 hover:text-white hover:bg-zinc-800">
            <Volume2 className="w-4 h-4" />
          </Button>
          <Button variant="ghost" size="icon" className="h-7 w-7 text-zinc-400 hover:text-white hover:bg-zinc-800 mr-2">
            <Maximize2 className="w-4 h-4" />
          </Button>
          <Separator orientation="vertical" className="h-4 bg-zinc-700 mx-1" />
          <Button variant="ghost" size="icon" onClick={handleZoomOut} className="h-6 w-6 text-zinc-500 hover:text-white">
            -
          </Button>
          <div className="w-24 px-1">
            <Slider
              min={0.5}
              max={5}
              step={0.1}
              value={[zoom]}
              onValueChange={handleZoomChange}
              className="w-full"
            />
          </div>
          <Button variant="ghost" size="icon" onClick={handleZoomIn} className="h-6 w-6 text-zinc-500 hover:text-white">
            +
          </Button>
        </div>
      </div>

      <div className="flex h-6 shrink-0 border-b border-zinc-800 bg-zinc-900" onClick={(e) => e.stopPropagation()}>
        <div className="w-40 shrink-0 border-r border-zinc-800 z-20" />

        <div
          ref={rulerRef}
          className="flex-1 overflow-hidden cursor-text relative"
          onPointerDown={handleRulerPointerDown}
        >
          <div className="flex items-end h-full" style={rulerWidthStyle}>
            {rulerSegments.map((segmentStart) => (
              <div key={segmentStart} className="relative h-full border-l border-zinc-700/50 shrink-0" style={{ width: `${pixelsPerSecond * 5}px` }}>
                <span className="absolute top-1 left-1 text-[10px] text-zinc-500 font-mono pointer-events-none">
                  {formatTime(segmentStart)}
                </span>
                <div className="absolute bottom-0 left-1/2 w-px h-2 bg-zinc-700/50 pointer-events-none" />
              </div>
            ))}
          </div>

          <div className="absolute top-0 bottom-0 w-px bg-red-500 z-30 pointer-events-none" style={playheadStyle}>
            <div className="absolute bottom-0 -left-1.5 w-3 h-3 bg-red-500" style={{ clipPath: 'polygon(0 0, 100% 0, 50% 100%)' }} />
          </div>
        </div>
      </div>

      <div
        ref={containerRef}
        onScroll={handleScroll}
        className="flex-1 overflow-y-auto overflow-x-auto relative [&::-webkit-scrollbar]:w-2 [&::-webkit-scrollbar]:h-2 [&::-webkit-scrollbar-track]:bg-zinc-950 [&::-webkit-scrollbar-thumb]:bg-zinc-800 [&::-webkit-scrollbar-thumb]:rounded-full hover:[&::-webkit-scrollbar-thumb]:bg-zinc-700"
      >
        <div className="absolute top-0 bottom-0 w-px bg-red-500 z-30 pointer-events-none" style={trackPlayheadStyle} />

        {tracks.map((track) => (
          <TimelineTrack
            key={track.id}
            track={track}
            width={timelineWidth}
            clips={clipsByTrack.get(track.id) || EMPTY_CLIPS}
            selectedClipId={selectedClipId}
            pixelsPerSecond={pixelsPerSecond}
            onSelectClip={onSelectClip}
            onChangeClip={onChangeClip}
            onDragEnd={onDragEnd}
          />
        ))}
      </div>
    </div>
  );
}
