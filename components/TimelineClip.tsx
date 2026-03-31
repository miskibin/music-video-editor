'use client';
import React from 'react';
import { Clip } from '@/lib/types';

type DragAction = 'move' | 'resize-left' | 'resize-right';

interface DraftClipPosition {
  start: number;
  duration: number;
}

interface DragState {
  action: DragAction;
  pointerId: number;
  target: HTMLDivElement;
  startX: number;
  latestClientX: number;
  initialStart: number;
  initialDuration: number;
}

const getDraftClipPosition = (
  action: DragAction,
  initialStart: number,
  initialDuration: number,
  pixelsPerSecond: number,
  clientX: number,
  startX: number,
): DraftClipPosition => {
  const deltaX = clientX - startX;
  const deltaTime = deltaX / pixelsPerSecond;

  if (action === 'move') {
    return {
      start: initialStart + deltaTime,
      duration: initialDuration,
    };
  }

  if (action === 'resize-left') {
    let nextStart = initialStart + deltaTime;
    let nextDuration = initialDuration - deltaTime;

    if (nextDuration < 1) {
      nextStart = initialStart + initialDuration - 1;
      nextDuration = 1;
    }

    return {
      start: nextStart,
      duration: nextDuration,
    };
  }

  return {
    start: initialStart,
    duration: Math.max(1, initialDuration + deltaTime),
  };
};

interface Props {
  clip: Clip;
  selected: boolean;
  pixelsPerSecond: number;
  onSelect: (id: string) => void;
  onChange: (id: string, updates: Partial<Clip>) => void;
  onDragEnd: (id: string) => void;
}

function TimelineClip({
  clip,
  selected,
  pixelsPerSecond,
  onSelect,
  onChange,
  onDragEnd,
}: Props) {
  const isAudioClip = clip.trackId.startsWith('a');
  const dragStateRef = React.useRef<DragState | null>(null);
  const frameRef = React.useRef<number | null>(null);
  const [draftClipPosition, setDraftClipPosition] = React.useState<DraftClipPosition | null>(null);
  const displayedStart = draftClipPosition?.start ?? clip.start;
  const displayedDuration = draftClipPosition?.duration ?? clip.duration;

  const updateDraftPosition = React.useCallback(() => {
    frameRef.current = null;

    const dragState = dragStateRef.current;
    if (!dragState) {
      return;
    }

    const nextPosition = getDraftClipPosition(
      dragState.action,
      dragState.initialStart,
      dragState.initialDuration,
      pixelsPerSecond,
      dragState.latestClientX,
      dragState.startX,
    );

    setDraftClipPosition((currentDraft) => {
      if (
        currentDraft
        && currentDraft.start === nextPosition.start
        && currentDraft.duration === nextPosition.duration
      ) {
        return currentDraft;
      }

      return nextPosition;
    });
  }, [pixelsPerSecond]);

  const handlePointerDown = React.useCallback((e: React.PointerEvent<HTMLDivElement>, action: DragAction) => {
    e.stopPropagation();
    onSelect(clip.id);
    
    const target = e.currentTarget;
    target.setPointerCapture(e.pointerId);

    dragStateRef.current = {
      action,
      pointerId: e.pointerId,
      target,
      startX: e.clientX,
      latestClientX: e.clientX,
      initialStart: clip.start,
      initialDuration: clip.duration,
    };
    setDraftClipPosition({
      start: clip.start,
      duration: clip.duration,
    });

    const onPointerMove = (moveEvent: PointerEvent) => {
      const dragState = dragStateRef.current;
      if (!dragState) {
        return;
      }

      dragState.latestClientX = moveEvent.clientX;
      if (frameRef.current === null) {
        frameRef.current = requestAnimationFrame(updateDraftPosition);
      }
    };

    const onPointerUp = (upEvent: PointerEvent) => {
      const dragState = dragStateRef.current;
      if (!dragState) {
        return;
      }

      if (frameRef.current !== null) {
        cancelAnimationFrame(frameRef.current);
        frameRef.current = null;
      }

      const nextPosition = getDraftClipPosition(
        dragState.action,
        dragState.initialStart,
        dragState.initialDuration,
        pixelsPerSecond,
        upEvent.clientX,
        dragState.startX,
      );

      dragState.target.releasePointerCapture(dragState.pointerId);
      window.removeEventListener('pointermove', onPointerMove);
      window.removeEventListener('pointerup', onPointerUp);

      dragStateRef.current = null;
      setDraftClipPosition(null);

      const updates: Partial<Clip> = {};
      if (nextPosition.start !== clip.start) {
        updates.start = nextPosition.start;
      }
      if (nextPosition.duration !== clip.duration) {
        updates.duration = nextPosition.duration;
      }

      if (Object.keys(updates).length > 0) {
        onChange(clip.id, updates);
      }

      onDragEnd(clip.id);
    };

    window.addEventListener('pointermove', onPointerMove);
    window.addEventListener('pointerup', onPointerUp);
  }, [clip.duration, clip.id, clip.start, onChange, onDragEnd, onSelect, pixelsPerSecond, updateDraftPosition]);

  React.useEffect(() => {
    if (!dragStateRef.current) {
      setDraftClipPosition(null);
    }
  }, [clip.duration, clip.start]);

  React.useEffect(() => () => {
    if (frameRef.current !== null) {
      cancelAnimationFrame(frameRef.current);
    }
  }, []);

  const clipStyle = React.useMemo(() => ({
    width: `${displayedDuration * pixelsPerSecond}px`,
    left: `${displayedStart * pixelsPerSecond}px`,
    backgroundColor: clip.color,
    borderColor: 'rgba(255,255,255,0.2)',
  }), [clip.color, displayedDuration, displayedStart, pixelsPerSecond]);

  const waveformHeights = React.useMemo(() => {
    const waveform = clip.waveform ?? [];

    if (!isAudioClip || waveform.length === 0) {
      return [];
    }

    return waveform.map((bar) => Math.max(14, 18 + bar * 64));
  }, [clip.waveform, isAudioClip]);

  return (
    <div
      onPointerDown={(e) => handlePointerDown(e, 'move')}
      onClick={(e) => e.stopPropagation()}
      className={`absolute top-1 bottom-1 rounded-md border flex items-center px-2 overflow-hidden cursor-grab active:cursor-grabbing group ${
        selected ? 'ring-2 ring-white z-10' : 'opacity-90 hover:opacity-100'
      }`}
      style={clipStyle}
    >
      {isAudioClip && waveformHeights.length > 0 ? (
        <div className="absolute inset-0 flex items-center gap-px px-2 opacity-45 pointer-events-none">
          {waveformHeights.map((height, index) => (
            <span
              key={`${clip.id}-bar-${index}`}
              className="flex-1 rounded-full bg-white/85"
              style={{ height: `${height}%` }}
            />
          ))}
        </div>
      ) : null}

      {/* Left Handle */}
      <div 
        onPointerDown={(e) => handlePointerDown(e, 'resize-left')}
        className="absolute left-0 top-0 bottom-0 w-3 cursor-ew-resize hover:bg-white/40 opacity-0 group-hover:opacity-100 transition-opacity z-20" 
      />
      
      <span className="text-xs font-medium text-white truncate drop-shadow-md select-none pointer-events-none relative z-10">
        {clip.name}
      </span>

      {/* Right Handle */}
      <div 
        onPointerDown={(e) => handlePointerDown(e, 'resize-right')}
        className="absolute right-0 top-0 bottom-0 w-3 cursor-ew-resize hover:bg-white/40 opacity-0 group-hover:opacity-100 transition-opacity z-20" 
      />
    </div>
  );
}

function areClipPropsEqual(previous: Props, next: Props) {
  return previous.clip === next.clip
    && previous.selected === next.selected
    && previous.pixelsPerSecond === next.pixelsPerSecond
    && previous.onSelect === next.onSelect
    && previous.onChange === next.onChange
    && previous.onDragEnd === next.onDragEnd;
}

export default React.memo(TimelineClip, areClipPropsEqual);
