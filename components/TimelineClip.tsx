'use client';
import React from 'react';
import { Clip } from '@/lib/types';
import { TIMELINE_SNAP_THRESHOLD_PX } from '@/lib/constants';
import { snapNearestTime } from '@/lib/timeline-snap';

type DragAction = 'move' | 'resize-left' | 'resize-right';

interface DraftClipPosition {
  start: number;
  duration: number;
  trimStart?: number;
}

interface DragState {
  action: DragAction;
  pointerId: number;
  target: HTMLDivElement;
  startX: number;
  latestClientX: number;
  initialStart: number;
  initialDuration: number;
  initialTrimStart: number;
  sourceDuration: number;
  isAudioClip: boolean;
}

const MIN_CLIP_DURATION = 1;

const getDraftClipPosition = (
  dragState: Pick<DragState, 'action' | 'initialStart' | 'initialDuration' | 'initialTrimStart' | 'sourceDuration' | 'isAudioClip'>,
  pixelsPerSecond: number,
  clientX: number,
  startX: number,
): DraftClipPosition => {
  const deltaX = clientX - startX;
  const deltaTime = deltaX / pixelsPerSecond;

  if (dragState.isAudioClip) {
    if (dragState.action === 'move') {
      return {
        start: dragState.initialStart + deltaTime,
        duration: dragState.initialDuration,
        trimStart: dragState.initialTrimStart,
      };
    }

    if (dragState.action === 'resize-left') {
      const fixedTrimEnd = Math.min(
        dragState.sourceDuration,
        dragState.initialTrimStart + dragState.initialDuration,
      );
      const nextTrimStart = Math.min(
        Math.max(dragState.initialTrimStart + deltaTime, 0),
        Math.max(fixedTrimEnd - MIN_CLIP_DURATION, 0),
      );

      return {
        start: dragState.initialStart + (nextTrimStart - dragState.initialTrimStart),
        duration: fixedTrimEnd - nextTrimStart,
        trimStart: nextTrimStart,
      };
    }

    return {
      start: dragState.initialStart,
      duration: Math.min(
        Math.max(MIN_CLIP_DURATION, dragState.initialDuration + deltaTime),
        Math.max(dragState.sourceDuration - dragState.initialTrimStart, MIN_CLIP_DURATION),
      ),
      trimStart: dragState.initialTrimStart,
    };
  }

  if (dragState.action === 'move') {
    return {
      start: dragState.initialStart + deltaTime,
      duration: dragState.initialDuration,
    };
  }

  if (dragState.action === 'resize-left') {
    let nextStart = dragState.initialStart + deltaTime;
    let nextDuration = dragState.initialDuration - deltaTime;

    if (nextDuration < MIN_CLIP_DURATION) {
      nextStart = dragState.initialStart + dragState.initialDuration - MIN_CLIP_DURATION;
      nextDuration = MIN_CLIP_DURATION;
    }

    return {
      start: nextStart,
      duration: nextDuration,
    };
  }

  return {
    start: dragState.initialStart,
    duration: Math.max(MIN_CLIP_DURATION, dragState.initialDuration + deltaTime),
  };
};

const applySnapToDraft = (
  draft: DraftClipPosition,
  action: DragAction,
  snapEnabled: boolean,
  snapPoints: readonly number[],
  pixelsPerSecond: number,
  isAudioClip: boolean,
  sourceDuration: number,
): DraftClipPosition => {
  if (!snapEnabled || snapPoints.length === 0) {
    return draft;
  }

  const thresholdSec = TIMELINE_SNAP_THRESHOLD_PX / pixelsPerSecond;
  const snap = (t: number) => snapNearestTime(t, snapPoints, thresholdSec);

  if (action === 'move') {
    return { ...draft, start: snap(draft.start) };
  }

  if (action === 'resize-right') {
    const end = draft.start + draft.duration;
    const snappedEnd = snap(end);
    return { ...draft, duration: Math.max(MIN_CLIP_DURATION, snappedEnd - draft.start) };
  }

  if (action === 'resize-left') {
    const snappedStart = snap(draft.start);
    const delta = snappedStart - draft.start;
    if (Math.abs(delta) < 1e-9) {
      return draft;
    }

    if (isAudioClip) {
      const nextTrim = (draft.trimStart ?? 0) + delta;
      const maxTrim = Math.max(0, sourceDuration - draft.duration);
      if (nextTrim < 0 || nextTrim > maxTrim + 1e-6) {
        return draft;
      }

      return { ...draft, start: snappedStart, trimStart: nextTrim, duration: draft.duration };
    }

    const end = draft.start + draft.duration;
    const nextDur = end - snappedStart;
    if (nextDur < MIN_CLIP_DURATION) {
      return draft;
    }

    return { ...draft, start: snappedStart, duration: nextDur };
  }

  return draft;
};

interface Props {
  clip: Clip;
  selected: boolean;
  pixelsPerSecond: number;
  snapEnabled: boolean;
  snapPoints: readonly number[];
  onSelect: (id: string) => void;
  onChange: (id: string, updates: Partial<Clip>) => void;
  onDragEnd: (id: string) => void;
}

function TimelineClip({
  clip,
  selected,
  pixelsPerSecond,
  snapEnabled,
  snapPoints,
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
  const displayedTrimStart = draftClipPosition?.trimStart ?? clip.trimStart ?? 0;

  const updateDraftPosition = React.useCallback(() => {
    frameRef.current = null;

    const dragState = dragStateRef.current;
    if (!dragState) {
      return;
    }

    const raw = getDraftClipPosition(
      dragState,
      pixelsPerSecond,
      dragState.latestClientX,
      dragState.startX,
    );
    const nextPosition = applySnapToDraft(
      raw,
      dragState.action,
      snapEnabled,
      snapPoints,
      pixelsPerSecond,
      isAudioClip,
      clip.sourceDuration ?? clip.duration,
    );

    setDraftClipPosition((currentDraft) => {
      if (
        currentDraft
        && currentDraft.start === nextPosition.start
        && currentDraft.duration === nextPosition.duration
        && currentDraft.trimStart === nextPosition.trimStart
      ) {
        return currentDraft;
      }

      return nextPosition;
    });
  }, [clip.duration, clip.sourceDuration, isAudioClip, pixelsPerSecond, snapEnabled, snapPoints]);

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
      initialTrimStart: clip.trimStart ?? 0,
      sourceDuration: clip.sourceDuration ?? clip.duration,
      isAudioClip,
    };
    setDraftClipPosition({
      start: clip.start,
      duration: clip.duration,
      trimStart: clip.trimStart,
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

      const raw = getDraftClipPosition(
        dragState,
        pixelsPerSecond,
        upEvent.clientX,
        dragState.startX,
      );
      const nextPosition = applySnapToDraft(
        raw,
        dragState.action,
        snapEnabled,
        snapPoints,
        pixelsPerSecond,
        isAudioClip,
        clip.sourceDuration ?? clip.duration,
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
      if ((nextPosition.trimStart ?? 0) !== (clip.trimStart ?? 0)) {
        updates.trimStart = nextPosition.trimStart;
      }

      if (Object.keys(updates).length > 0) {
        onChange(clip.id, updates);
      }

      onDragEnd(clip.id);
    };

    window.addEventListener('pointermove', onPointerMove);
    window.addEventListener('pointerup', onPointerUp);
  }, [
    clip.duration,
    clip.id,
    clip.sourceDuration,
    clip.start,
    clip.trimStart,
    isAudioClip,
    onChange,
    onDragEnd,
    onSelect,
    pixelsPerSecond,
    snapEnabled,
    snapPoints,
    updateDraftPosition,
  ]);

  React.useEffect(() => {
    if (!dragStateRef.current) {
      setDraftClipPosition(null);
    }
  }, [clip.duration, clip.start, clip.trimStart]);

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

  const waveformSourceDuration = React.useMemo(
    () => Math.max(clip.sourceDuration ?? clip.duration, clip.duration, MIN_CLIP_DURATION),
    [clip.duration, clip.sourceDuration],
  );

  const waveformHeights = React.useMemo(() => {
    const waveform = clip.waveform ?? [];

    if (!isAudioClip || waveform.length === 0) {
      return [];
    }

    return waveform.map((bar) => Math.max(14, 18 + bar * 64));
  }, [clip.waveform, isAudioClip]);

  const waveformStripStyle = React.useMemo(() => ({
    width: `${waveformSourceDuration * pixelsPerSecond}px`,
    transform: `translateX(${-displayedTrimStart * pixelsPerSecond}px)`,
  }), [displayedTrimStart, pixelsPerSecond, waveformSourceDuration]);

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
        <div className="absolute inset-y-0 left-2 right-2 overflow-hidden opacity-45 pointer-events-none">
          <div className="flex h-full items-center gap-px" style={waveformStripStyle}>
            {waveformHeights.map((height, index) => (
              <span
                key={`${clip.id}-bar-${index}`}
                className="h-auto min-w-px flex-1 rounded-full bg-white/85"
                style={{ height: `${height}%` }}
              />
            ))}
          </div>
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
    && previous.snapEnabled === next.snapEnabled
    && previous.snapPoints === next.snapPoints
    && previous.onSelect === next.onSelect
    && previous.onChange === next.onChange
    && previous.onDragEnd === next.onDragEnd;
}

export default React.memo(TimelineClip, areClipPropsEqual);
