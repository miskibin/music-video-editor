import {
  BackgroundSegment,
  DEFAULT_SUBTITLE_STYLE,
  EditorProject,
  MotionConfig,
  MusicClip,
  SubtitleCue,
  SubtitleStyle,
  SubtitleWord,
  TransitionConfig,
} from './types';

export const RENDER_COMPOSITION_ID = 'MusicVideo';
export const RENDER_FPS = 30;
export const MIN_RENDER_FRAMES = 1;

export type RenderAudioTrack = {
  src: string;
  durationInFrames: number;
  trimBefore: number;
  trimAfter: number;
  bpm: number | null;
  fadeInFrames: number;
  fadeOutFrames: number;
};

type CreateRenderManifestOptions = {
  audioAlreadyTrimmed?: boolean;
};

export type RenderSubtitleWord = {
  id: string;
  text: string;
  startFrame: number;
  endFrame: number;
  confidence: number | null;
};

export type RenderSubtitleCue = {
  id: string;
  text: string;
  startFrame: number;
  durationInFrames: number;
  words: RenderSubtitleWord[];
};

export type RenderBackgroundSegment = {
  id: string;
  name: string;
  color: string;
  visualType: BackgroundSegment['visualType'];
  src: string | null;
  startFrame: number;
  durationInFrames: number;
  trimBefore: number;
  transition: TransitionConfig;
  motion: MotionConfig;
};

export type RenderManifest = {
  compositionId: typeof RENDER_COMPOSITION_ID;
  width: number;
  height: number;
  fps: number;
  durationInFrames: number;
  music: RenderAudioTrack | null;
  subtitleStyle: SubtitleStyle;
  subtitleCues: RenderSubtitleCue[];
  backgroundSegments: RenderBackgroundSegment[];
};

const clamp = (value: number, min: number, max: number) => Math.min(Math.max(value, min), max);

export const secondsToFrames = (seconds: number, fps = RENDER_FPS) => (
  Math.max(MIN_RENDER_FRAMES, Math.round(Math.max(0, seconds) * fps))
);

const maybeSecondsToFrames = (seconds: number, fps = RENDER_FPS) => (
  Math.max(0, Math.round(Math.max(0, seconds) * fps))
);

export const getReferencedRenderAssetIds = (project: EditorProject) => {
  const ids = new Set<string>();

  if (project.music.clip?.assetId) {
    ids.add(project.music.clip.assetId);
  }

  project.background.segments.forEach((segment) => {
    if (segment.assetId) {
      ids.add(segment.assetId);
    }
  });

  return [...ids];
};

const toVisibleCue = (
  cue: SubtitleCue,
  music: MusicClip | null,
  fps: number,
): RenderSubtitleCue | null => {
  if (!music) {
    return {
      id: cue.id,
      text: cue.text,
      startFrame: maybeSecondsToFrames(cue.start, fps),
      durationInFrames: secondsToFrames(cue.duration, fps),
      words: cue.words.map((word) => ({
        id: word.id,
        text: word.text,
        startFrame: maybeSecondsToFrames(word.startMs / 1000, fps),
        endFrame: maybeSecondsToFrames(word.endMs / 1000, fps),
        confidence: word.confidence,
      })),
    };
  }

  const trimStart = music.trimStart ?? 0;
  const visibleWindowEnd = trimStart + music.duration;
  const cueStart = cue.start;
  const cueEnd = cue.start + cue.duration;
  const visibleStart = Math.max(cueStart, trimStart);
  const visibleEnd = Math.min(cueEnd, visibleWindowEnd);

  if (visibleEnd <= visibleStart) {
    return null;
  }

  const visibleWords = cue.words
    .map((word) => toVisibleWord(word, trimStart, visibleWindowEnd, fps))
    .filter((word): word is RenderSubtitleWord => word !== null);

  return {
    id: cue.id,
    text: cue.text,
    startFrame: maybeSecondsToFrames(visibleStart - trimStart, fps),
    durationInFrames: secondsToFrames(visibleEnd - visibleStart, fps),
    words: visibleWords,
  };
};

const toVisibleWord = (
  word: SubtitleWord,
  trimStart: number,
  visibleWindowEnd: number,
  fps: number,
): RenderSubtitleWord | null => {
  const startSec = word.startMs / 1000;
  const endSec = word.endMs / 1000;
  const visibleStart = clamp(startSec, trimStart, visibleWindowEnd);
  const visibleEnd = clamp(endSec, trimStart, visibleWindowEnd);

  if (visibleEnd <= visibleStart) {
    return null;
  }

  return {
    id: word.id,
    text: word.text,
    startFrame: maybeSecondsToFrames(visibleStart - trimStart, fps),
    endFrame: Math.max(
      maybeSecondsToFrames(visibleStart - trimStart, fps) + MIN_RENDER_FRAMES,
      maybeSecondsToFrames(visibleEnd - trimStart, fps),
    ),
    confidence: word.confidence,
  };
};

const toRenderBackgroundSegment = (
  segment: BackgroundSegment,
  src: string | null,
  fps: number,
  globalTransition: TransitionConfig,
  globalMotion: MotionConfig,
): RenderBackgroundSegment => ({
  id: segment.id,
  name: segment.name,
  color: segment.color,
  visualType: segment.visualType,
  src,
  startFrame: maybeSecondsToFrames(segment.start, fps),
  durationInFrames: secondsToFrames(segment.duration, fps),
  trimBefore: maybeSecondsToFrames(segment.trimStart ?? 0, fps),
  transition: globalTransition,
  motion: globalMotion,
});

export const createPlaceholderRenderManifest = (): RenderManifest => ({
  compositionId: RENDER_COMPOSITION_ID,
  width: 1080,
  height: 1920,
  fps: RENDER_FPS,
  durationInFrames: 360,
  music: null,
  subtitleStyle: { ...DEFAULT_SUBTITLE_STYLE },
  subtitleCues: [],
  backgroundSegments: [],
});

export const sanitizeOutputName = (projectName: string) => {
  const baseName = projectName.trim().toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '');
  return baseName.length > 0 ? baseName : 'music-video';
};

export const createRenderManifest = (
  project: EditorProject,
  assetSources: Record<string, string>,
  fps = RENDER_FPS,
  options?: CreateRenderManifestOptions,
): RenderManifest => {
  const music = project.music.clip;
  const musicSrc = music?.assetId ? assetSources[music.assetId] : undefined;

  if (music?.assetId && !musicSrc) {
    throw new Error(`Missing staged music asset for "${music.name}".`);
  }

  const subtitleCues = project.subtitles.cues
    .map((cue) => toVisibleCue(cue, music, fps))
    .filter((cue): cue is RenderSubtitleCue => cue !== null)
    .sort((left, right) => left.startFrame - right.startFrame);

  const backgroundSegments = project.background.segments
    .map((segment) => {
      const src = segment.assetId ? assetSources[segment.assetId] : null;
      if (segment.assetId && !src) {
        throw new Error(`Missing staged background asset for "${segment.name}".`);
      }

      return toRenderBackgroundSegment(
        segment,
        src,
        fps,
        project.background.globalTransition,
        project.background.globalMotion,
      );
    })
    .sort((left, right) => left.startFrame - right.startFrame);

  const fadeInSec = music?.fadeInDuration ?? 0;
  const fadeOutSec = music?.fadeOutDuration ?? 0;
  const musicTrack = music && musicSrc ? {
    src: musicSrc,
    durationInFrames: secondsToFrames(music.duration, fps),
    trimBefore: options?.audioAlreadyTrimmed ? 0 : maybeSecondsToFrames(music.trimStart ?? 0, fps),
    trimAfter: options?.audioAlreadyTrimmed
      ? secondsToFrames(music.duration, fps)
      : maybeSecondsToFrames((music.trimStart ?? 0) + music.duration, fps),
    bpm: music.bpm ?? null,
    fadeInFrames: maybeSecondsToFrames(fadeInSec, fps),
    fadeOutFrames: maybeSecondsToFrames(fadeOutSec, fps),
  } satisfies RenderAudioTrack : null;

  const durationInFrames = Math.max(
    musicTrack?.durationInFrames ?? 0,
    ...backgroundSegments.map((segment) => segment.startFrame + segment.durationInFrames),
    ...subtitleCues.map((cue) => cue.startFrame + cue.durationInFrames),
    createPlaceholderRenderManifest().durationInFrames,
  );

  const subtitleStyle: SubtitleStyle = {
    ...DEFAULT_SUBTITLE_STYLE,
    ...(project.subtitles.subtitleStyle ?? {}),
  };

  return {
    compositionId: RENDER_COMPOSITION_ID,
    width: project.format.width,
    height: project.format.height,
    fps,
    durationInFrames,
    music: musicTrack,
    subtitleStyle,
    subtitleCues,
    backgroundSegments,
  };
};
