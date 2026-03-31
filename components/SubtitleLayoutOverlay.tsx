'use client';

import { useEffect, useRef } from 'react';
import type { SubtitleStyle } from '@/lib/types';

const COMPOSITION_WIDTH = 1080;

type DragState =
  | {
    kind: 'move';
    startY: number;
    startBottom: number;
  }
  | {
    kind: 'resize';
    startX: number;
    startY: number;
    startMaxW: number;
    startFont: number;
  };

type Props = {
  subtitleStyle: SubtitleStyle;
  onSubtitleStyleChange: (updates: Partial<SubtitleStyle>) => void;
  enabled?: boolean;
};

const clamp = (v: number, min: number, max: number) => Math.min(Math.max(v, min), max);

export function SubtitleLayoutOverlay({
  subtitleStyle,
  onSubtitleStyleChange,
  enabled = true,
}: Props) {
  const wrapRef = useRef<HTMLDivElement>(null);
  const dragRef = useRef<DragState | null>(null);

  const getScale = () => {
    const el = wrapRef.current;
    if (!el || el.clientWidth <= 0) {
      return 1;
    }
    return el.clientWidth / COMPOSITION_WIDTH;
  };

  useEffect(() => {
    const onMove = (e: PointerEvent) => {
      const d = dragRef.current;
      if (!d) {
        return;
      }
      const s = getScale();
      if (s <= 0) {
        return;
      }

      if (d.kind === 'move') {
        onSubtitleStyleChange({
          horizontalOffsetPx: 0,
          bottomOffsetPx: clamp(d.startBottom - (e.clientY - d.startY) / s, 0, 600),
        });
      } else {
        const dx = e.clientX - d.startX;
        const dy = e.clientY - d.startY;
        onSubtitleStyleChange({
          horizontalOffsetPx: 0,
          maxWidthPercent: clamp(d.startMaxW + (dx / s) * 0.1, 40, 100),
          fontSize: clamp(Math.round(d.startFont - (dy / s) * 0.15), 12, 120),
        });
      }
    };

    const onUp = () => {
      dragRef.current = null;
    };

    window.addEventListener('pointermove', onMove);
    window.addEventListener('pointerup', onUp);
    window.addEventListener('pointercancel', onUp);

    return () => {
      window.removeEventListener('pointermove', onMove);
      window.removeEventListener('pointerup', onUp);
      window.removeEventListener('pointercancel', onUp);
    };
  }, [onSubtitleStyleChange]);

  const startMove = (e: React.PointerEvent) => {
    if (!enabled) {
      return;
    }
    e.preventDefault();
    e.stopPropagation();
    dragRef.current = {
      kind: 'move',
      startY: e.clientY,
      startBottom: subtitleStyle.bottomOffsetPx,
    };
  };

  const startResize = (e: React.PointerEvent) => {
    if (!enabled) {
      return;
    }
    e.preventDefault();
    e.stopPropagation();
    dragRef.current = {
      kind: 'resize',
      startX: e.clientX,
      startY: e.clientY,
      startMaxW: subtitleStyle.maxWidthPercent,
      startFont: subtitleStyle.fontSize,
    };
  };

  const scale = typeof window === 'undefined' ? 1 : getScale();
  const bottomPx = subtitleStyle.bottomOffsetPx * scale;
  const widthPct = subtitleStyle.maxWidthPercent;

  return (
    <div
      ref={wrapRef}
      className="pointer-events-none absolute inset-0 z-10"
      aria-hidden
    >
      <div
        className="pointer-events-auto absolute flex justify-center"
        style={{
          bottom: bottomPx,
          left: '50%',
          width: `${widthPct}%`,
          transform: 'translateX(-50%)',
          minHeight: Math.max(48, subtitleStyle.fontSize * scale * 1.4),
        }}
      >
        <div
          role="presentation"
          onPointerDown={startMove}
          className={`relative w-full rounded-md border border-dashed border-emerald-400/45 bg-emerald-500/[0.06] shadow-[inset_0_0_0_1px_rgba(16,185,129,0.12)] ${
            enabled ? 'cursor-grab active:cursor-grabbing' : 'cursor-default opacity-60'
          }`}
        >
          <button
            type="button"
            aria-label="Resize subtitle text size and box width"
            onPointerDown={startResize}
            className="pointer-events-auto absolute -right-1 -bottom-1 size-3 rounded-sm border border-emerald-400/70 bg-emerald-600/90 hover:bg-emerald-500 cursor-nwse-resize"
          />
        </div>
      </div>
    </div>
  );
}
