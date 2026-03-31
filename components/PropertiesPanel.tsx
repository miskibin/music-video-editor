'use client';

import React, { useMemo } from 'react';
import { MIN_CLIP_DURATION } from '@/lib/project';
import { Clip } from '@/lib/types';
import type {
  MotionConfig,
  SubtitleStyle,
  SubtitleStylePreset,
  TransitionConfig,
} from '@/lib/types';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Slider } from '@/components/ui/slider';
import { SUBTITLE_BG_SWATCHES, SUBTITLE_TEXT_SWATCHES } from '@/lib/subtitle-colors';

interface Props {
  clip: Clip | null;
  onChange: (id: string, updates: Partial<Clip>) => void;
  subtitleStyle: SubtitleStyle;
  onSubtitleStyleChange: (updates: Partial<SubtitleStyle>) => void;
  subtitleKaraokeAvailable: boolean;
  globalTransition: TransitionConfig;
  globalMotion: MotionConfig;
  onGlobalBackgroundChange: (updates: {
    transition?: Partial<TransitionConfig>;
    motion?: Partial<MotionConfig>;
  }) => void;
  musicClip: Clip | null;
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

const PRESET_VALUES: Record<SubtitleStylePreset, Partial<SubtitleStyle>> = {
  glass: {
    preset: 'glass',
    fontSize: 46,
    textColor: '#ffffff',
    backgroundOpacity: 0.58,
    backgroundColor: '#000000',
    textOpacity: 1,
    fontWeight: 700,
    letterSpacing: -0.03,
    bottomOffsetPx: 120,
    horizontalOffsetPx: 0,
    horizontalPaddingPx: 64,
    maxWidthPercent: 82,
    borderRadiusPx: 28,
    backdropBlurPx: 18,
    textTransform: 'none',
    wordHighlightMode: 'none',
  },
  'tiktok-bold': {
    preset: 'tiktok-bold',
    fontSize: 58,
    textColor: '#fef08a',
    backgroundOpacity: 0.78,
    backgroundColor: '#000000',
    textOpacity: 1,
    fontWeight: 900,
    letterSpacing: -0.02,
    bottomOffsetPx: 160,
    horizontalOffsetPx: 0,
    horizontalPaddingPx: 48,
    maxWidthPercent: 90,
    borderRadiusPx: 12,
    backdropBlurPx: 8,
    textTransform: 'uppercase',
    wordHighlightMode: 'none',
  },
  minimal: {
    preset: 'minimal',
    fontSize: 46,
    textColor: '#fafafa',
    backgroundOpacity: 0.22,
    backgroundColor: '#18181b',
    textOpacity: 1,
    fontWeight: 600,
    letterSpacing: 0,
    bottomOffsetPx: 200,
    horizontalOffsetPx: 0,
    horizontalPaddingPx: 72,
    maxWidthPercent: 78,
    borderRadiusPx: 8,
    backdropBlurPx: 12,
    textTransform: 'none',
    wordHighlightMode: 'none',
  },
  outline: {
    preset: 'outline',
    fontSize: 50,
    textColor: '#ffffff',
    backgroundOpacity: 0,
    backgroundColor: '#000000',
    textOpacity: 1,
    fontWeight: 800,
    letterSpacing: -0.02,
    bottomOffsetPx: 180,
    horizontalOffsetPx: 0,
    horizontalPaddingPx: 56,
    maxWidthPercent: 88,
    borderRadiusPx: 0,
    backdropBlurPx: 0,
    textTransform: 'none',
    wordHighlightMode: 'none',
  },
  'captions-cc': {
    preset: 'captions-cc',
    fontSize: 54,
    textColor: '#fde047',
    backgroundOpacity: 0.88,
    backgroundColor: '#000000',
    textOpacity: 1,
    fontWeight: 800,
    letterSpacing: 0,
    bottomOffsetPx: 175,
    horizontalOffsetPx: 0,
    horizontalPaddingPx: 52,
    maxWidthPercent: 92,
    borderRadiusPx: 6,
    backdropBlurPx: 0,
    textTransform: 'none',
    wordHighlightMode: 'none',
  },
  neon: {
    preset: 'neon',
    fontSize: 56,
    textColor: '#67e8f9',
    backgroundOpacity: 0.72,
    backgroundColor: '#0c1220',
    textOpacity: 1,
    fontWeight: 800,
    letterSpacing: -0.02,
    bottomOffsetPx: 170,
    horizontalOffsetPx: 0,
    horizontalPaddingPx: 52,
    maxWidthPercent: 88,
    borderRadiusPx: 14,
    backdropBlurPx: 14,
    textTransform: 'none',
    wordHighlightMode: 'none',
  },
  'soft-rose': {
    preset: 'soft-rose',
    fontSize: 48,
    textColor: '#881337',
    backgroundOpacity: 0.55,
    backgroundColor: '#fff1f2',
    textOpacity: 1,
    fontWeight: 600,
    letterSpacing: 0.01,
    bottomOffsetPx: 190,
    horizontalOffsetPx: 0,
    horizontalPaddingPx: 64,
    maxWidthPercent: 80,
    borderRadiusPx: 20,
    backdropBlurPx: 10,
    textTransform: 'none',
    wordHighlightMode: 'none',
  },
  'lyric-film': {
    preset: 'lyric-film',
    fontSize: 60,
    textColor: '#fafaf0',
    backgroundOpacity: 0.68,
    backgroundColor: '#0a0a0a',
    textOpacity: 1,
    fontWeight: 600,
    letterSpacing: 0.02,
    bottomOffsetPx: 180,
    horizontalOffsetPx: 0,
    horizontalPaddingPx: 56,
    maxWidthPercent: 86,
    borderRadiusPx: 4,
    backdropBlurPx: 8,
    textTransform: 'none',
    wordHighlightMode: 'none',
  },
  podcast: {
    preset: 'podcast',
    fontSize: 50,
    textColor: '#fafafa',
    backgroundOpacity: 0.62,
    backgroundColor: '#27272a',
    textOpacity: 1,
    fontWeight: 600,
    letterSpacing: 0,
    bottomOffsetPx: 185,
    horizontalOffsetPx: 0,
    horizontalPaddingPx: 60,
    maxWidthPercent: 84,
    borderRadiusPx: 16,
    backdropBlurPx: 12,
    textTransform: 'none',
    wordHighlightMode: 'none',
  },
  hype: {
    preset: 'hype',
    fontSize: 58,
    textColor: '#ffffff',
    backgroundOpacity: 0.8,
    backgroundColor: '#6d28d9',
    textOpacity: 1,
    fontWeight: 900,
    letterSpacing: -0.03,
    bottomOffsetPx: 165,
    horizontalOffsetPx: 0,
    horizontalPaddingPx: 48,
    maxWidthPercent: 90,
    borderRadiusPx: 18,
    backdropBlurPx: 10,
    textTransform: 'uppercase',
    wordHighlightMode: 'none',
  },
};

/** One-tap transition + motion combos for the background track (global). */
const VIDEO_QUICK_LOOKS: {
  id: string;
  label: string;
  transition: TransitionConfig;
  motion: MotionConfig;
}[] = [
  {
    id: 'steady',
    label: 'Steady',
    transition: { kind: 'fade', duration: 0.45, ease: 'easeInOut' },
    motion: { mode: 'none', strength: 0.2, sensitivity: 0.65, smoothness: 0.5, frequencyMultiplier: 1, decay: 0.55 },
  },
  {
    id: 'beat-sync',
    label: 'Beat sync',
    transition: { kind: 'crossfade', duration: 0.5, ease: 'easeOut' },
    motion: { mode: 'beat-pulse', strength: 0.28, sensitivity: 0.72, smoothness: 0.45, frequencyMultiplier: 1, decay: 0.52 },
  },
  {
    id: 'slideshow',
    label: 'Slideshow',
    transition: { kind: 'slide', duration: 0.55, ease: 'easeInOut' },
    motion: { mode: 'none', strength: 0.2, sensitivity: 0.65, smoothness: 0.5, frequencyMultiplier: 1, decay: 0.55 },
  },
  {
    id: 'punch-cut',
    label: 'Punch cut',
    transition: { kind: 'flash', duration: 0.22, ease: 'easeIn' },
    motion: { mode: 'kick-zoom', strength: 0.38, sensitivity: 0.7, smoothness: 0.4, frequencyMultiplier: 1.05, decay: 0.48 },
  },
  {
    id: 'zoom-wash',
    label: 'Zoom wash',
    transition: { kind: 'zoom', duration: 0.5, ease: 'easeInOut' },
    motion: { mode: 'none', strength: 0.2, sensitivity: 0.65, smoothness: 0.55, frequencyMultiplier: 1, decay: 0.55 },
  },
];

const transitionKinds: TransitionConfig['kind'][] = [
  'none',
  'fade',
  'slide',
  'crossfade',
  'slide-left',
  'slide-right',
  'zoom',
  'flash',
];

const motionModes: MotionConfig['mode'][] = [
  'none',
  'beat-pulse',
  'kick-zoom',
  'slow-zoom-in',
  'slow-zoom-out',
  'slow-breathe',
];

const motionModeLabels: Record<MotionConfig['mode'], string> = {
  none: 'None',
  'beat-pulse': 'Beat pulse',
  'kick-zoom': 'Kick zoom',
  'slow-zoom-in': 'Slow zoom in (whole clip)',
  'slow-zoom-out': 'Slow zoom out (whole clip)',
  'slow-breathe': 'Slow breathe zoom (whole clip)',
};

function PropertiesPanel({
  clip,
  onChange,
  subtitleStyle,
  onSubtitleStyleChange,
  subtitleKaraokeAvailable,
  globalTransition,
  globalMotion,
  onGlobalBackgroundChange,
  musicClip,
}: Props) {
  const transitionEaseOptions = useMemo(
    () => ['linear', 'easeIn', 'easeOut', 'easeInOut'] as const,
    [],
  );

  const musicSourceDuration = musicClip
    ? (musicClip.sourceDuration ?? musicClip.duration)
    : 0;

  const clipKind = clip ? getClipKind(clip) : null;
  const isAudioClip = clipKind === 'Audio';
  const isTextClip = clipKind === 'Text';
  const isVideoClip = clipKind === 'Video';
  const trimStart = clip?.trimStart ?? 0;
  const sourceDuration = clip?.sourceDuration ?? clip?.duration ?? 0;
  const trimEnd = clip ? Math.min(trimStart + clip.duration, sourceDuration) : 0;
  const durationValue = clip ? Number(clip.duration.toFixed(1)) : 0;

  const inspectorContext =
    clip == null
      ? null
      : isTextClip
        ? 'Subtitle cue'
        : isVideoClip
          ? clip.visualType === 'video'
            ? 'Video'
            : 'Image / background'
          : 'Music / audio';

  return (
    <aside className="flex w-96 shrink-0 flex-col overflow-hidden border-l border-zinc-800/80 bg-zinc-950">
      <div className="flex h-11 shrink-0 flex-col justify-center border-b border-zinc-800/80 px-4">
        <span className="text-xs font-medium text-zinc-400">Inspector</span>
        {inspectorContext ? (
          <span className="text-[11px] text-zinc-600">{inspectorContext}</span>
        ) : null}
      </div>

      <div className="panel-scrollbar min-h-0 flex-1 overflow-y-auto px-4 py-4">
        <div className="flex flex-col gap-6">
          {clip == null ? (
            <section>
              <p className="text-sm leading-relaxed text-zinc-500">
                Select a clip on the timeline: subtitle cues for text styling and layout, background segments for
                transitions and motion, or the music track for trim and fades.
              </p>
            </section>
          ) : null}

          {clip && isTextClip ? (
          <section>
            <p className="mb-3 text-[11px] font-semibold uppercase tracking-wider text-zinc-500">Subtitles (all cues)</p>
            <p className="mb-3 text-[11px] text-zinc-600">
              Style applies to every subtitle. Use the dashed box on the preview to move vertically and resize text
              size and width (centered).
            </p>

            <div className="mb-3 flex flex-col gap-1.5">
              <Label className="text-[11px] text-zinc-600">Preset</Label>
              <select
                className="h-9 w-full rounded-md border border-zinc-800/60 bg-zinc-900/80 px-2 text-sm text-zinc-100"
                value={subtitleStyle.preset}
                onChange={(e) => {
                  const preset = e.target.value as SubtitleStylePreset;
                  onSubtitleStyleChange({ ...PRESET_VALUES[preset], preset });
                }}
              >
                <option value="glass">Glass card</option>
                <option value="tiktok-bold">TikTok bold</option>
                <option value="minimal">Minimal</option>
                <option value="outline">Outline (no box)</option>
                <option value="captions-cc">Broadcast / CC yellow</option>
                <option value="neon">Neon night</option>
                <option value="soft-rose">Soft rose</option>
                <option value="lyric-film">Lyric / film</option>
                <option value="podcast">Podcast clean</option>
                <option value="hype">Hype purple</option>
              </select>
            </div>

            <div className="mb-3 flex flex-col gap-2 py-0.5">
              <div className="flex justify-between text-[11px] text-zinc-600">
                <span>Font size</span>
                <span className="font-mono text-zinc-400">{subtitleStyle.fontSize}px</span>
              </div>
              <Slider
                min={12}
                max={120}
                step={1}
                value={[subtitleStyle.fontSize]}
                onValueChange={([v]) => onSubtitleStyleChange({ fontSize: v ?? 46 })}
              />
            </div>

            <div className="mb-3 flex flex-col gap-1">
              <Label className="text-[11px] text-zinc-600">Weight</Label>
              <Input
                type="number"
                min={100}
                max={900}
                step={100}
                value={subtitleStyle.fontWeight}
                onChange={(e) => onSubtitleStyleChange({ fontWeight: Number(e.target.value) || 700 })}
                className="h-9 border-zinc-800/60 bg-transparent font-mono text-sm text-zinc-200"
              />
            </div>

            <div className="mb-3 flex flex-col gap-2">
              <Label className="text-[11px] text-zinc-600">Text color</Label>
              <div className="flex flex-wrap gap-2">
                {SUBTITLE_TEXT_SWATCHES.map((hex) => {
                  const active = subtitleStyle.textColor.toLowerCase() === hex.toLowerCase();
                  return (
                    <button
                      key={hex}
                      type="button"
                      title={hex}
                      className={`size-7 rounded-md border border-zinc-700/80 shadow-inner transition focus:outline-none focus-visible:ring-2 focus-visible:ring-emerald-500 ${
                        active ? 'ring-2 ring-emerald-400 ring-offset-2 ring-offset-zinc-950' : 'hover:opacity-90'
                      }`}
                      style={{ backgroundColor: hex }}
                      onClick={() => onSubtitleStyleChange({ textColor: hex })}
                    />
                  );
                })}
              </div>
            </div>
            <div className="mb-3 flex flex-col gap-2">
              <Label className="text-[11px] text-zinc-600">Card background</Label>
              <div className="flex flex-wrap gap-2">
                {SUBTITLE_BG_SWATCHES.map((hex) => {
                  const active = subtitleStyle.backgroundColor.toLowerCase() === hex.toLowerCase();
                  return (
                    <button
                      key={hex}
                      type="button"
                      title={hex}
                      className={`size-7 rounded-md border border-zinc-600/50 shadow-inner transition focus:outline-none focus-visible:ring-2 focus-visible:ring-emerald-500 ${
                        active ? 'ring-2 ring-emerald-400 ring-offset-2 ring-offset-zinc-950' : 'hover:opacity-90'
                      }`}
                      style={{ backgroundColor: hex }}
                      onClick={() => onSubtitleStyleChange({ backgroundColor: hex })}
                    />
                  );
                })}
              </div>
            </div>

            <div className="mb-2 flex flex-col gap-2 py-0.5">
              <div className="flex justify-between text-[11px] text-zinc-600">
                <span>Text opacity</span>
                <span className="font-mono text-zinc-400">{Math.round(subtitleStyle.textOpacity * 100)}%</span>
              </div>
              <Slider
                min={0}
                max={100}
                step={1}
                value={[Math.round(subtitleStyle.textOpacity * 100)]}
                onValueChange={([v]) => onSubtitleStyleChange({ textOpacity: (v ?? 100) / 100 })}
              />
            </div>

            <div className="mb-3 flex flex-col gap-2 py-0.5">
              <div className="flex justify-between text-[11px] text-zinc-600">
                <span>Background opacity</span>
                <span className="font-mono text-zinc-400">{Math.round(subtitleStyle.backgroundOpacity * 100)}%</span>
              </div>
              <Slider
                min={0}
                max={100}
                step={1}
                value={[Math.round(subtitleStyle.backgroundOpacity * 100)]}
                onValueChange={([v]) => onSubtitleStyleChange({ backgroundOpacity: (v ?? 58) / 100 })}
              />
            </div>

            <div className="mb-3 flex flex-col gap-1">
              <Label className="text-[11px] text-zinc-600">Bottom offset (px)</Label>
              <Input
                type="number"
                min={0}
                max={600}
                value={subtitleStyle.bottomOffsetPx}
                onChange={(e) => onSubtitleStyleChange({ bottomOffsetPx: Number(e.target.value) || 120 })}
                className="h-9 border-zinc-800/60 bg-transparent font-mono text-sm text-zinc-200"
              />
            </div>

            <div className="mb-3 flex flex-col gap-1">
              <Label className="text-[11px] text-zinc-600">Max width %</Label>
              <Input
                type="number"
                min={40}
                max={100}
                value={subtitleStyle.maxWidthPercent}
                onChange={(e) => onSubtitleStyleChange({ maxWidthPercent: Number(e.target.value) || 82 })}
                className="h-9 border-zinc-800/60 bg-transparent font-mono text-sm text-zinc-200"
              />
            </div>

            <p className="mb-2 text-[11px] font-medium uppercase tracking-wider text-zinc-600">Cue entrance</p>
            <p className="mb-2 text-[11px] text-zinc-600">
              How each subtitle line appears. Independent of background clip transitions.
            </p>
            <div className="mb-3 flex flex-col gap-1.5">
              <Label className="text-[11px] text-zinc-600">Mode</Label>
              <select
                className="h-9 w-full rounded-md border border-zinc-800/60 bg-zinc-900/80 px-2 text-sm text-zinc-100"
                value={subtitleStyle.subtitleEntrance ?? 'none'}
                onChange={(e) => onSubtitleStyleChange({
                  subtitleEntrance: e.target.value as SubtitleStyle['subtitleEntrance'],
                })}
              >
                <option value="none">Instant</option>
                <option value="fade">Quick fade</option>
                <option value="spring">Spring</option>
              </select>
            </div>
            {(subtitleStyle.subtitleEntrance ?? 'none') === 'fade' ? (
              <div className="mb-3 flex flex-col gap-2 py-0.5">
                <div className="flex justify-between text-[11px] text-zinc-600">
                  <span>Fade duration (s)</span>
                  <span className="font-mono text-zinc-400">
                    {(subtitleStyle.entranceFadeDurationSec ?? 0.12).toFixed(2)}
                  </span>
                </div>
                <Slider
                  min={4}
                  max={90}
                  step={1}
                  value={[Math.round((subtitleStyle.entranceFadeDurationSec ?? 0.12) * 100)]}
                  onValueChange={([v]) => onSubtitleStyleChange({
                    entranceFadeDurationSec: Math.max(0.04, Math.min(0.9, (v ?? 12) / 100)),
                  })}
                />
              </div>
            ) : null}
            {(subtitleStyle.subtitleEntrance ?? 'none') === 'spring' ? (
              <div className="mb-3 flex flex-col gap-2 py-0.5">
                <div className="flex justify-between text-[11px] text-zinc-600">
                  <span>Spring stiffness</span>
                  <span className="font-mono text-zinc-400">{subtitleStyle.entranceSpringStiffness ?? 420}</span>
                </div>
                <Slider
                  min={80}
                  max={600}
                  step={5}
                  value={[subtitleStyle.entranceSpringStiffness ?? 420]}
                  onValueChange={([v]) => onSubtitleStyleChange({
                    entranceSpringStiffness: v ?? 420,
                  })}
                />
              </div>
            ) : null}

            <div className="mb-3 flex flex-col gap-1.5">
              <Label className="text-[11px] text-zinc-600">Text transform</Label>
              <select
                className="h-9 w-full rounded-md border border-zinc-800/60 bg-zinc-900/80 px-2 text-sm text-zinc-100"
                value={subtitleStyle.textTransform}
                onChange={(e) => onSubtitleStyleChange({
                  textTransform: e.target.value as SubtitleStyle['textTransform'],
                })}
              >
                <option value="none">None</option>
                <option value="uppercase">Uppercase</option>
                <option value="lowercase">Lowercase</option>
              </select>
            </div>

            <div className="flex flex-col gap-1.5">
              <Label className="text-[11px] text-zinc-600">Word highlight</Label>
              <select
                className="h-9 w-full rounded-md border border-zinc-800/60 bg-zinc-900/80 px-2 text-sm text-zinc-100 disabled:opacity-50"
                disabled={!subtitleKaraokeAvailable}
                value={subtitleStyle.wordHighlightMode}
                onChange={(e) => onSubtitleStyleChange({
                  wordHighlightMode: e.target.value as SubtitleStyle['wordHighlightMode'],
                })}
              >
                <option value="none">Off</option>
                <option value="karaoke" disabled={!subtitleKaraokeAvailable}>Karaoke (needs aligned words)</option>
              </select>
              {!subtitleKaraokeAvailable ? (
                <p className="text-[10px] text-zinc-600">Run subtitle alignment to enable karaoke.</p>
              ) : null}
            </div>
          </section>
          ) : null}

          {clip && isVideoClip ? (
          <section>
            <p className="mb-3 text-[11px] font-semibold uppercase tracking-wider text-zinc-500">Video / background (all segments)</p>
            <p className="mb-2 text-[11px] text-zinc-600">Quick looks apply transition + motion together; adjust sliders anytime.</p>
            <div className="mb-4 flex flex-wrap gap-1.5">
              {VIDEO_QUICK_LOOKS.map((look) => (
                <button
                  key={look.id}
                  type="button"
                  className="rounded-md border border-zinc-700/80 bg-zinc-900/80 px-2.5 py-1 text-[11px] text-zinc-300 hover:border-zinc-600 hover:bg-zinc-800/90 hover:text-zinc-100"
                  onClick={() => onGlobalBackgroundChange({
                    transition: look.transition,
                    motion: look.motion,
                  })}
                >
                  {look.label}
                </button>
              ))}
            </div>

            <div className="mb-3 flex flex-col gap-1.5">
              <Label className="text-[11px] text-zinc-600">Transition</Label>
              <select
                className="h-9 w-full rounded-md border border-zinc-800/60 bg-zinc-900/80 px-2 text-sm text-zinc-100"
                value={globalTransition.kind}
                onChange={(e) => onGlobalBackgroundChange({
                  transition: {
                    ...globalTransition,
                    kind: e.target.value as TransitionConfig['kind'],
                  },
                })}
              >
                {transitionKinds.map((k) => (
                  <option key={k} value={k}>{k}</option>
                ))}
              </select>
            </div>

            <div className="mb-3 flex flex-col gap-2 py-0.5">
              <div className="flex justify-between text-[11px] text-zinc-600">
                <span>Transition duration (s)</span>
                <span className="font-mono text-zinc-400">{globalTransition.duration.toFixed(2)}</span>
              </div>
              <Slider
                min={0}
                max={200}
                step={5}
                value={[Math.round(globalTransition.duration * 100)]}
                onValueChange={([v]) => onGlobalBackgroundChange({
                  transition: {
                    ...globalTransition,
                    duration: (v ?? 0) / 100,
                  },
                })}
              />
            </div>

            <div className="mb-3 flex flex-col gap-1.5">
              <Label className="text-[11px] text-zinc-600">Easing</Label>
              <select
                className="h-9 w-full rounded-md border border-zinc-800/60 bg-zinc-900/80 px-2 text-sm text-zinc-100"
                value={globalTransition.ease ?? 'easeInOut'}
                onChange={(e) => onGlobalBackgroundChange({
                  transition: {
                    ...globalTransition,
                    ease: e.target.value as TransitionConfig['ease'],
                  },
                })}
              >
                {transitionEaseOptions.map((ease) => (
                  <option key={ease} value={ease}>{ease}</option>
                ))}
              </select>
            </div>

            <p className="mb-2 mt-4 text-[11px] font-medium uppercase tracking-wider text-zinc-600">Motion / beat</p>
            <div className="mb-3 flex flex-col gap-1.5">
              <Label className="text-[11px] text-zinc-600">Mode</Label>
              <select
                className="h-9 w-full rounded-md border border-zinc-800/60 bg-zinc-900/80 px-2 text-sm text-zinc-100"
                value={globalMotion.mode}
                onChange={(e) => onGlobalBackgroundChange({
                  motion: {
                    ...globalMotion,
                    mode: e.target.value as MotionConfig['mode'],
                  },
                })}
              >
                {motionModes.map((m) => (
                  <option key={m} value={m}>{motionModeLabels[m]}</option>
                ))}
              </select>
            </div>

            <div className="mb-2 flex flex-col gap-2 py-0.5">
              <div className="flex justify-between text-[11px] text-zinc-600">
                <span>Strength</span>
                <span className="font-mono text-zinc-400">{globalMotion.strength.toFixed(2)}</span>
              </div>
              <Slider
                min={0}
                max={100}
                step={1}
                value={[Math.round(globalMotion.strength * 100)]}
                onValueChange={([v]) => onGlobalBackgroundChange({
                  motion: { ...globalMotion, strength: (v ?? 0) / 100 },
                })}
              />
            </div>
            {globalMotion.mode === 'beat-pulse' || globalMotion.mode === 'kick-zoom' ? (
              <>
                <div className="mb-2 flex flex-col gap-2 py-0.5">
                  <div className="flex justify-between text-[11px] text-zinc-600">
                    <span>Sensitivity</span>
                    <span className="font-mono text-zinc-400">{globalMotion.sensitivity.toFixed(2)}</span>
                  </div>
                  <Slider
                    min={0}
                    max={100}
                    step={1}
                    value={[Math.round(globalMotion.sensitivity * 100)]}
                    onValueChange={([v]) => onGlobalBackgroundChange({
                      motion: { ...globalMotion, sensitivity: (v ?? 65) / 100 },
                    })}
                  />
                </div>
                <div className="mb-2 flex flex-col gap-2 py-0.5">
                  <div className="flex justify-between text-[11px] text-zinc-600">
                    <span>Smoothness</span>
                    <span className="font-mono text-zinc-400">{globalMotion.smoothness.toFixed(2)}</span>
                  </div>
                  <Slider
                    min={0}
                    max={100}
                    step={1}
                    value={[Math.round(globalMotion.smoothness * 100)]}
                    onValueChange={([v]) => onGlobalBackgroundChange({
                      motion: { ...globalMotion, smoothness: (v ?? 50) / 100 },
                    })}
                  />
                </div>
                <div className="mb-2 flex flex-col gap-2 py-0.5">
                  <div className="flex justify-between text-[11px] text-zinc-600">
                    <span>Beat frequency ×</span>
                    <span className="font-mono text-zinc-400">{globalMotion.frequencyMultiplier.toFixed(2)}</span>
                  </div>
                  <Slider
                    min={25}
                    max={400}
                    step={5}
                    value={[Math.round(globalMotion.frequencyMultiplier * 100)]}
                    onValueChange={([v]) => onGlobalBackgroundChange({
                      motion: { ...globalMotion, frequencyMultiplier: (v ?? 100) / 100 },
                    })}
                  />
                </div>
                <div className="mb-2 flex flex-col gap-2 py-0.5">
                  <div className="flex justify-between text-[11px] text-zinc-600">
                    <span>Kick decay</span>
                    <span className="font-mono text-zinc-400">{globalMotion.decay.toFixed(2)}</span>
                  </div>
                  <Slider
                    min={0}
                    max={100}
                    step={1}
                    value={[Math.round(globalMotion.decay * 100)]}
                    onValueChange={([v]) => onGlobalBackgroundChange({
                      motion: { ...globalMotion, decay: (v ?? 55) / 100 },
                    })}
                  />
                </div>
              </>
            ) : null}
          </section>
          ) : null}

          {clip && isAudioClip && musicClip ? (
            <section className="border-t border-zinc-800/60 pt-4">
              <p className="mb-3 text-[11px] font-semibold uppercase tracking-wider text-zinc-500">Music</p>
              <div className="mb-3 grid grid-cols-2 gap-2">
                <div className="flex flex-col gap-1">
                  <Label className="text-[11px] text-zinc-600">Trim start (s)</Label>
                  <Input
                    type="number"
                    min={0}
                    max={musicSourceDuration}
                    step={0.1}
                    value={Number((musicClip.trimStart ?? 0).toFixed(2))}
                    onChange={(e) => {
                      const sd = musicClip.sourceDuration ?? musicClip.duration;
                      const next = Math.max(0, Number(e.target.value) || 0);
                      const maxTrim = Math.max(0, sd - MIN_CLIP_DURATION);
                      const t = Math.min(next, maxTrim);
                      onChange(musicClip.id, {
                        trimStart: t,
                        duration: Math.min(musicClip.duration, Math.max(MIN_CLIP_DURATION, sd - t)),
                      });
                    }}
                    className="h-9 border-zinc-800/60 bg-transparent font-mono text-sm text-zinc-200"
                  />
                </div>
                <div className="flex flex-col gap-1">
                  <Label className="text-[11px] text-zinc-600">Trim end (s)</Label>
                  <Input
                    type="number"
                    min={MIN_CLIP_DURATION}
                    max={musicSourceDuration}
                    step={0.1}
                    value={Number(
                      Math.min(
                        (musicClip.trimStart ?? 0) + musicClip.duration,
                        musicSourceDuration,
                      ).toFixed(2),
                    )}
                    onChange={(e) => {
                      const sd = musicClip.sourceDuration ?? musicClip.duration;
                      const trim = musicClip.trimStart ?? 0;
                      const end = Math.max(trim + MIN_CLIP_DURATION, Number(e.target.value) || 0);
                      const capped = Math.min(end, sd);
                      onChange(musicClip.id, { duration: Math.max(MIN_CLIP_DURATION, capped - trim) });
                    }}
                    className="h-9 border-zinc-800/60 bg-transparent font-mono text-sm text-zinc-200"
                  />
                </div>
              </div>
              <div className="mb-3 flex flex-col gap-2 py-0.5">
                <div className="flex justify-between text-[11px] text-zinc-600">
                  <span>Region length</span>
                  <span className="font-mono text-zinc-300">{formatTime(musicClip.duration)}</span>
                </div>
                <Slider
                  min={MIN_CLIP_DURATION * 100}
                  max={Math.max(
                    MIN_CLIP_DURATION * 100,
                    Math.floor(((musicClip.sourceDuration ?? musicClip.duration) - (musicClip.trimStart ?? 0)) * 100),
                  )}
                  step={10}
                  value={[Math.round(musicClip.duration * 100)]}
                  onValueChange={([v]) => {
                    const sd = musicClip.sourceDuration ?? musicClip.duration;
                    const trim = musicClip.trimStart ?? 0;
                    const next = Math.max(MIN_CLIP_DURATION, (v ?? 0) / 100);
                    const maxLen = Math.max(MIN_CLIP_DURATION, sd - trim);
                    onChange(musicClip.id, { duration: Math.min(next, maxLen) });
                  }}
                />
              </div>

              <p className="mb-2 text-[11px] font-medium uppercase tracking-wider text-zinc-600">Fades</p>
              <div className="mb-2 flex flex-col gap-2 py-0.5">
                <div className="flex justify-between text-[11px] text-zinc-600">
                  <span>Fade in (s)</span>
                  <span className="font-mono text-zinc-400">{(musicClip.fadeInDuration ?? 0).toFixed(2)}</span>
                </div>
                <Slider
                  min={0}
                  max={Math.min(500, Math.floor(musicClip.duration * 100))}
                  step={5}
                  value={[Math.round((musicClip.fadeInDuration ?? 0) * 100)]}
                  onValueChange={([v]) => onChange(musicClip.id, { fadeInDuration: (v ?? 0) / 100 })}
                />
              </div>
              <div className="mb-2 flex flex-col gap-2 py-0.5">
                <div className="flex justify-between text-[11px] text-zinc-600">
                  <span>Fade out (s)</span>
                  <span className="font-mono text-zinc-400">{(musicClip.fadeOutDuration ?? 0).toFixed(2)}</span>
                </div>
                <Slider
                  min={0}
                  max={Math.min(500, Math.floor(musicClip.duration * 100))}
                  step={5}
                  value={[Math.round((musicClip.fadeOutDuration ?? 0) * 100)]}
                  onValueChange={([v]) => onChange(musicClip.id, { fadeOutDuration: (v ?? 0) / 100 })}
                />
              </div>
            </section>
          ) : null}

          {clip ? (
            <section className="border-t border-zinc-800/60 pt-4">
              <p className="mb-3 text-[11px] font-semibold uppercase tracking-wider text-zinc-500">
                {isTextClip ? 'This cue' : isVideoClip ? 'This segment' : 'This track'}
              </p>
              <div className="mb-3 flex items-center justify-between">
                <span className="text-[11px] text-zinc-600">Type</span>
                <span className="rounded-md bg-zinc-900 px-2 py-0.5 text-[10px] font-medium uppercase tracking-wider text-zinc-500">
                  {clipKind}
                </span>
              </div>

              {isTextClip ? (
                <div className="mb-3 flex flex-col gap-1.5">
                  <span className="text-[11px] text-zinc-600">Subtitle line</span>
                  <Input
                    type="text"
                    value={clip.overlayText ?? clip.name}
                    onChange={(e) => onChange(clip.id, { overlayText: e.target.value })}
                    className="h-9 border-zinc-800/60 bg-transparent text-sm text-zinc-100 focus-visible:ring-1 focus-visible:ring-zinc-600"
                  />
                </div>
              ) : (
                <div className="mb-3 flex flex-col gap-1.5">
                  <span className="text-[11px] text-zinc-600">Name</span>
                  <Input
                    type="text"
                    value={clip.name}
                    onChange={(e) => onChange(clip.id, { name: e.target.value })}
                    className="h-9 border-zinc-800/60 bg-transparent text-sm text-zinc-100"
                  />
                </div>
              )}

              <div className="mb-3 flex flex-col gap-1.5">
                <span className="text-[11px] text-zinc-600">Duration (s)</span>
                <Input
                  type="number"
                  min={MIN_CLIP_DURATION}
                  step={0.1}
                  value={durationValue}
                  onChange={(e) => onChange(clip.id, {
                    duration: Math.max(MIN_CLIP_DURATION, Number(e.target.value) || MIN_CLIP_DURATION),
                  })}
                  className="h-9 border-zinc-800/60 bg-transparent font-mono text-sm tabular-nums text-zinc-200"
                />
              </div>

              {isVideoClip && clip.visualType === 'video' ? (
                <div className="mb-3 grid grid-cols-2 gap-2">
                  <div className="flex flex-col gap-1">
                    <Label className="text-[11px] text-zinc-600">Source trim (s)</Label>
                    <Input
                      type="number"
                      min={0}
                      step={0.1}
                      value={Number((clip.trimStart ?? 0).toFixed(2))}
                      onChange={(e) => {
                        const sd = clip.sourceDuration ?? clip.duration;
                        const next = Math.max(0, Number(e.target.value) || 0);
                        const maxTrim = Math.max(0, sd - MIN_CLIP_DURATION);
                        const t = Math.min(next, maxTrim);
                        onChange(clip.id, {
                          trimStart: t,
                          duration: Math.min(clip.duration, Math.max(MIN_CLIP_DURATION, sd - t)),
                        });
                      }}
                      className="h-9 border-zinc-800/60 bg-transparent font-mono text-sm text-zinc-200"
                    />
                  </div>
                </div>
              ) : null}

              <div className="border-t border-zinc-800/40 pt-3">
                <p className="mb-2 text-[11px] font-medium uppercase tracking-wider text-zinc-600">Timeline</p>
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
                      <span className="text-zinc-600">Trim window</span>
                      <span className="text-zinc-300">
                        {formatTime(trimStart)}
                        {' — '}
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
            </section>
          ) : null}
        </div>
      </div>
    </aside>
  );
}

export default React.memo(PropertiesPanel);
