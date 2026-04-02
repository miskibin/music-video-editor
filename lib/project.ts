import { z } from 'zod';
import {
  AlignmentLanguage,
  AssetRecord,
  BackgroundLayer,
  BackgroundSegment,
  Clip,
  EditorProject,
  LyricSyncState,
  MotionConfig,
  MusicClip,
  ProjectSetupState,
  SplitPartRangePreset,
  SplitPlanningState,
  SubtitleAlignmentInput,
  SubtitleAlignmentResult,
  SubtitleAlignmentState,
  SubtitleCue,
  DEFAULT_SUBTITLE_STYLE,
  SubtitleStyle,
  TimelineSplitMarker,
  Track,
  TransitionConfig,
} from './types';
import type { AudioStructureState } from './audio-analysis-types';
import type { AudioAnalysisResult } from './audio-analysis-types';
import { colorForBackgroundSegment } from './visual-clip-colors';

export const PROJECT_VERSION = 4 as const;
export const ACTIVE_PROJECT_ID = 'active-project';
export const BACKGROUND_TRACK_ID = 'v1' as const;
export const SUBTITLE_TRACK_ID = 't1' as const;
export const MUSIC_TRACK_ID = 'a1' as const;
export const MIN_CLIP_DURATION = 1;

export const TIMELINE_TRACKS: Track[] = [
  { id: BACKGROUND_TRACK_ID, name: 'V1 - Background', type: 'video' },
  { id: SUBTITLE_TRACK_ID, name: 'T1 - Subtitles', type: 'text' },
  { id: MUSIC_TRACK_ID, name: 'A1 - Music', type: 'audio' },
];

const assetKindSchema = z.enum(['audio', 'image', 'video']);
const assetSourceSchema = z.enum(['upload', 'sample', 'ai-generated', 'ai-selected']);
const visualTypeSchema = z.enum(['gradient', 'image', 'video']);

const transitionKindSchema = z.enum([
  'none',
  'fade',
  'slide',
  'crossfade',
  'slide-left',
  'slide-right',
  'zoom',
  'flash',
]);
const transitionEaseSchema = z.enum(['linear', 'easeIn', 'easeOut', 'easeInOut']);
const transitionSchema = z.object({
  kind: transitionKindSchema,
  duration: z.number().min(0),
  ease: transitionEaseSchema.optional().default('easeInOut'),
});

const motionSchema = z.object({
  mode: z.enum([
    'none',
    'beat-pulse',
    'kick-zoom',
    'slow-zoom-in',
    'slow-zoom-out',
    'slow-breathe',
  ]),
  strength: z.number().min(0),
  sensitivity: z.number().min(0).max(1).default(0.65),
  smoothness: z.number().min(0).max(1).default(0.5),
  frequencyMultiplier: z.number().min(0.25).max(4).default(1),
  decay: z.number().min(0).max(1).default(0.55),
});

const subtitleStyleSchema = z.object({
  preset: z.enum([
    'glass',
    'tiktok-bold',
    'minimal',
    'outline',
    'captions-cc',
    'neon',
    'soft-rose',
    'lyric-film',
    'podcast',
    'hype',
  ]),
  fontSize: z.number().min(12).max(120),
  textColor: z.string(),
  backgroundOpacity: z.number().min(0).max(1),
  backgroundColor: z.string(),
  textOpacity: z.number().min(0).max(1),
  fontWeight: z.number().min(100).max(900),
  letterSpacing: z.number().min(-0.2).max(0.5),
  bottomOffsetPx: z.number().min(0).max(600),
  horizontalOffsetPx: z.number().min(-800).max(800).default(0),
  horizontalPaddingPx: z.number().min(0).max(200),
  maxWidthPercent: z.number().min(40).max(100),
  borderRadiusPx: z.number().min(0).max(80),
  backdropBlurPx: z.number().min(0).max(40),
  textTransform: z.enum(['none', 'uppercase', 'lowercase']),
  wordHighlightMode: z.enum(['none', 'karaoke']),
  subtitleEntrance: z.enum(['none', 'fade', 'spring']).default('none'),
  entranceFadeDurationSec: z.number().min(0.04).max(0.9).default(0.12),
  entranceSpringStiffness: z.number().min(80).max(600).default(420),
});

const assetRecordSchema = z.object({
  id: z.string(),
  kind: assetKindSchema,
  name: z.string(),
  mimeType: z.string(),
  size: z.number().min(0),
  duration: z.number().min(0).optional(),
  width: z.number().min(0).optional(),
  height: z.number().min(0).optional(),
  createdAt: z.string(),
  updatedAt: z.string(),
  source: assetSourceSchema,
});

const musicClipSchema = z.object({
  id: z.string(),
  assetId: z.string().nullable(),
  name: z.string(),
  color: z.string(),
  start: z.number().min(0),
  duration: z.number().min(MIN_CLIP_DURATION),
  sourceDuration: z.number().min(MIN_CLIP_DURATION).optional(),
  trimStart: z.number().min(0).optional(),
  waveform: z.array(z.number()).optional(),
  bpm: z.number().min(40).max(240).nullable().optional(),
  fadeInDuration: z.number().min(0).max(60).optional(),
  fadeOutDuration: z.number().min(0).max(60).optional(),
});

const subtitleWordSchema = z.object({
  id: z.string(),
  text: z.string(),
  startMs: z.number().min(0),
  endMs: z.number().min(0),
  confidence: z.number().nullable(),
});

const subtitleCueSchema = z.object({
  id: z.string(),
  start: z.number().min(0),
  duration: z.number().min(MIN_CLIP_DURATION),
  text: z.string(),
  words: z.array(subtitleWordSchema),
});

const subtitleAlignmentInputSchema = z.object({
  language: z.enum(['en', 'pl']),
  excerptStart: z.number().min(0),
  excerptEnd: z.number().min(0),
  sourceText: z.string(),
});

const subtitleAlignmentResultSchema = z.object({
  provider: z.string(),
  generatedAt: z.string(),
  warnings: z.array(z.string()),
  lowConfidenceWordIds: z.array(z.string()),
  cues: z.array(subtitleCueSchema),
});

const subtitleAlignmentStateSchema = z.object({
  status: z.enum(['idle', 'running', 'review', 'applied', 'error']),
  input: subtitleAlignmentInputSchema.nullable(),
  result: subtitleAlignmentResultSchema.nullable(),
  approvedAt: z.string().nullable(),
  errorMessage: z.string().nullable(),
});

const splitPartRangeSchema = z.enum(['4-7', '6-10', '9-15', '15-25']);

const timelineSplitMarkerSchema = z.object({
  time: z.number().min(0),
  score: z.number().min(0),
  reasons: z.array(z.string()),
});

const splitPlanningStateSchema = z.object({
  preset: splitPartRangeSchema.default('6-10'),
  markers: z.array(timelineSplitMarkerSchema).default([]),
  generatedAt: z.string().nullable().default(null),
});

const audioAnalysisResultSchema = z.any();

const audioStructureStateSchema: z.ZodType<AudioStructureState> = z.object({
  analysis: audioAnalysisResultSchema.nullable(),
  boundaryOverrides: z.array(z.number()).nullable(),
  sectionLabels: z.array(z.string()).nullable(),
  analysisAssetId: z.string().nullable(),
  generatedAt: z.string().nullable(),
});

const projectSetupStateSchema = z.object({
  status: z.enum(['incomplete', 'complete']),
  completedAt: z.string().optional(),
});

const lyricSyncStateSchema = z.object({
  subtitleAlignment: subtitleAlignmentStateSchema,
});

const subtitleLayerSchema = z.object({
  trackId: z.literal(SUBTITLE_TRACK_ID),
  sourceText: z.string(),
  cues: z.array(subtitleCueSchema),
  subtitleStyle: subtitleStyleSchema.default(() => ({ ...DEFAULT_SUBTITLE_STYLE })),
});

const backgroundSegmentSchema = z.object({
  id: z.string(),
  assetId: z.string().nullable(),
  name: z.string(),
  color: z.string(),
  start: z.number().min(0),
  duration: z.number().min(MIN_CLIP_DURATION),
  sourceDuration: z.number().min(MIN_CLIP_DURATION).optional(),
  trimStart: z.number().min(0).optional(),
  visualType: visualTypeSchema,
  transition: transitionSchema,
  motion: motionSchema,
});

const backgroundLayerSchema = z.object({
  trackId: z.literal(BACKGROUND_TRACK_ID),
  segments: z.array(backgroundSegmentSchema),
  globalTransition: transitionSchema.optional(),
  globalMotion: motionSchema.optional(),
});

const editorProjectSchema = z.object({
  version: z.literal(PROJECT_VERSION),
  id: z.string(),
  name: z.string(),
  createdAt: z.string(),
  updatedAt: z.string(),
  format: z.object({
    aspectRatio: z.literal('9:16'),
    width: z.number().min(1),
    height: z.number().min(1),
  }),
  music: z.object({
    trackId: z.literal(MUSIC_TRACK_ID),
    clip: musicClipSchema.nullable(),
  }),
  subtitles: subtitleLayerSchema,
  background: backgroundLayerSchema,
  assets: z.record(z.string(), assetRecordSchema),
  splitPlanning: splitPlanningStateSchema,
  mediaLibraryAssetIds: z.array(z.string()).default([]),
  lyricSync: lyricSyncStateSchema,
  projectSetup: projectSetupStateSchema,
  audioStructure: audioStructureStateSchema,
});

const nowIso = () => new Date().toISOString();

const clamp = (value: number, min: number, max: number) => Math.min(Math.max(value, min), max);

const getProjectDurationHint = (project: {
  music: { clip: MusicClip | null };
  subtitles: { cues: SubtitleCue[] };
  background: { segments: BackgroundSegment[] };
}) => {
  const cueEnd = project.subtitles.cues.reduce((max, cue) => Math.max(max, cue.start + cue.duration), 0);
  const backgroundEnd = project.background.segments.reduce((max, segment) => Math.max(max, segment.start + segment.duration), 0);

  return Math.max(
    project.music.clip?.duration ?? 0,
    cueEnd,
    backgroundEnd,
    12,
  );
};

const createDefaultSubtitleAlignmentInput = (project: {
  music: { clip: MusicClip | null };
  subtitles: { sourceText: string; cues: SubtitleCue[] };
  background: { segments: BackgroundSegment[] };
}, language: AlignmentLanguage = 'en'): SubtitleAlignmentInput => ({
  language,
  excerptStart: 0,
  excerptEnd: Math.max(
    MIN_CLIP_DURATION,
    Math.min(getProjectDurationHint(project), project.music.clip?.duration ?? getProjectDurationHint(project), 30),
  ),
  sourceText: project.subtitles.sourceText,
});

const createDefaultSubtitleAlignmentState = (input: SubtitleAlignmentInput | null): SubtitleAlignmentState => ({
  status: 'idle',
  input,
  result: null,
  approvedAt: null,
  errorMessage: null,
});

const createDefaultLyricSyncState = (project: {
  music: { clip: MusicClip | null };
  subtitles: { sourceText: string; cues: SubtitleCue[] };
  background: { segments: BackgroundSegment[] };
}): LyricSyncState => ({
  subtitleAlignment: createDefaultSubtitleAlignmentState(createDefaultSubtitleAlignmentInput(project)),
});

const createDefaultSplitPlanningState = (
  preset: SplitPartRangePreset = '6-10',
): SplitPlanningState => ({
  preset,
  markers: [],
  generatedAt: null,
});

export const createDefaultProjectSetupState = (): ProjectSetupState => ({
  status: 'incomplete',
});

export const createDefaultAudioStructureState = (): AudioStructureState => ({
  analysis: null,
  boundaryOverrides: null,
  sectionLabels: null,
  analysisAssetId: null,
  generatedAt: null,
});

export const createId = () => Math.random().toString(36).substring(2, 9);

export const createDefaultSubtitleStyle = (): SubtitleStyle => ({ ...DEFAULT_SUBTITLE_STYLE });

export const createDefaultTransitionConfig = (): TransitionConfig => ({
  kind: 'none',
  duration: 0,
  ease: 'easeInOut',
});

export const createDefaultMotionConfig = (): MotionConfig => ({
  mode: 'beat-pulse',
  strength: 0.2,
  sensitivity: 0.65,
  smoothness: 0.5,
  frequencyMultiplier: 1,
  decay: 0.55,
});

const normalizeTransitionConfig = (transition: TransitionConfig): TransitionConfig => {
  const defaults = createDefaultTransitionConfig();
  return {
    ...defaults,
    ...transition,
    ease: transition.ease ?? defaults.ease,
  };
};

const normalizeMotionConfig = (motion: MotionConfig): MotionConfig => {
  const defaults = createDefaultMotionConfig();
  return {
    ...defaults,
    ...motion,
    sensitivity: motion.sensitivity ?? defaults.sensitivity,
    smoothness: motion.smoothness ?? defaults.smoothness,
    frequencyMultiplier: motion.frequencyMultiplier ?? defaults.frequencyMultiplier,
    decay: motion.decay ?? defaults.decay,
  };
};

const normalizeMusicClip = (clip: MusicClip): MusicClip => ({
  ...clip,
  fadeInDuration: clip.fadeInDuration ?? 0,
  fadeOutDuration: clip.fadeOutDuration ?? 0,
});

/** Ensures new fields exist on loaded/migrated projects (idempotent). */
export const normalizeEditorProject = (project: EditorProject): EditorProject => {
  const bg = project.background as BackgroundLayer & {
    globalTransition?: TransitionConfig;
    globalMotion?: MotionConfig;
  };
  const firstSeg = bg.segments[0];
  const globalTransition = bg.globalTransition
    ? normalizeTransitionConfig(bg.globalTransition)
    : normalizeTransitionConfig(firstSeg?.transition ?? createDefaultTransitionConfig());
  const globalMotion = bg.globalMotion
    ? normalizeMotionConfig(bg.globalMotion)
    : normalizeMotionConfig(firstSeg?.motion ?? createDefaultMotionConfig());

  return {
    ...project,
    projectSetup: project.projectSetup ?? createDefaultProjectSetupState(),
    audioStructure: project.audioStructure ?? createDefaultAudioStructureState(),
    subtitles: {
      ...project.subtitles,
      subtitleStyle: {
        ...DEFAULT_SUBTITLE_STYLE,
        ...(project.subtitles.subtitleStyle ?? {}),
      },
    },
    background: {
      ...bg,
      globalTransition,
      globalMotion,
      segments: bg.segments.map((segment) => ({
        ...segment,
        transition: normalizeTransitionConfig(segment.transition),
        motion: normalizeMotionConfig(segment.motion),
      })),
    },
    music: {
      ...project.music,
      clip: project.music.clip ? normalizeMusicClip(project.music.clip) : null,
    },
    splitPlanning: {
      preset: project.splitPlanning?.preset ?? '6-10',
      generatedAt: project.splitPlanning?.generatedAt ?? null,
      markers: [...(project.splitPlanning?.markers ?? [])]
        .filter((marker) => Number.isFinite(marker.time) && marker.time >= 0)
        .map((marker) => ({
          time: Math.round(marker.time * 1000) / 1000,
          score: Math.max(0, marker.score),
          reasons: marker.reasons,
        }))
        .sort((left, right) => left.time - right.time),
    },
  };
};

export const createDefaultBackgroundSegment = (): BackgroundSegment => {
  const id = createId();
  return {
    id,
    assetId: null,
    name: 'Background',
    color: colorForBackgroundSegment(id),
    start: 0,
    duration: 12,
    visualType: 'gradient',
    transition: createDefaultTransitionConfig(),
    motion: createDefaultMotionConfig(),
  };
};

export const createDefaultSubtitleCue = (): SubtitleCue => ({
  id: createId(),
  start: 0,
  duration: 6,
  text: 'Your subtitles here',
  words: [],
});

export const createDefaultProject = (): EditorProject => {
  const timestamp = nowIso();

  const defaultProject = {
    version: PROJECT_VERSION,
    id: ACTIVE_PROJECT_ID,
    name: 'Untitled Project',
    createdAt: timestamp,
    updatedAt: timestamp,
    format: {
      aspectRatio: '9:16' as const,
      width: 1080,
      height: 1920,
    },
    music: {
      trackId: MUSIC_TRACK_ID,
      clip: null,
    },
    subtitles: {
      trackId: SUBTITLE_TRACK_ID,
      sourceText: 'Your subtitles here',
      cues: [createDefaultSubtitleCue()],
      subtitleStyle: createDefaultSubtitleStyle(),
    },
    background: {
      trackId: BACKGROUND_TRACK_ID,
      segments: [createDefaultBackgroundSegment()],
      globalTransition: createDefaultTransitionConfig(),
      globalMotion: createDefaultMotionConfig(),
    },
    assets: {},
    splitPlanning: createDefaultSplitPlanningState(),
    mediaLibraryAssetIds: [],
    projectSetup: createDefaultProjectSetupState(),
    audioStructure: createDefaultAudioStructureState(),
  };

  return {
    ...defaultProject,
    lyricSync: createDefaultLyricSyncState(defaultProject),
  };
};

const normalizeTrimmedRange = (duration: number, sourceDuration?: number, trimStart?: number) => {
  const nextSourceDuration = Math.max(sourceDuration ?? duration, MIN_CLIP_DURATION);
  const nextTrimStart = clamp(trimStart ?? 0, 0, Math.max(nextSourceDuration - MIN_CLIP_DURATION, 0));
  const nextDuration = clamp(
    duration,
    MIN_CLIP_DURATION,
    Math.max(nextSourceDuration - nextTrimStart, MIN_CLIP_DURATION),
  );

  return {
    sourceDuration: nextSourceDuration,
    trimStart: nextTrimStart,
    duration: nextDuration,
  };
};

/** Subtitle cue `start` / `duration` are seconds on the music asset timeline (same as WhisperX). */
export const subtitleCueToTimelineClipProps = (
  cue: SubtitleCue,
  music: MusicClip,
): { start: number; duration: number } | null => {
  const trimStart = music.trimStart ?? 0;
  const windowEnd = trimStart + music.duration;
  const s0 = cue.start;
  const s1 = cue.start + cue.duration;
  const vis0 = Math.max(s0, trimStart);
  const vis1 = Math.min(s1, windowEnd);
  if (vis1 - vis0 < MIN_CLIP_DURATION) {
    return null;
  }

  return {
    start: music.start + (vis0 - trimStart),
    duration: Math.max(MIN_CLIP_DURATION, vis1 - vis0),
  };
};

/** Timeline seconds (after trim) → source seconds on the file. */
export const timelineSubtitleEditToSource = (
  timelineStart: number,
  timelineDuration: number,
  music: MusicClip,
): { start: number; duration: number } => ({
  start: Math.max(0, timelineStart - music.start + (music.trimStart ?? 0)),
  duration: Math.max(MIN_CLIP_DURATION, timelineDuration),
});

const markProjectUpdated = (project: EditorProject): EditorProject => ({
  ...project,
  updatedAt: nowIso(),
});

export const getReferencedAssetIds = (project: EditorProject) => {
  const ids = new Set<string>();

  if (project.music.clip?.assetId) {
    ids.add(project.music.clip.assetId);
  }

  project.background.segments.forEach((segment) => {
    if (segment.assetId) {
      ids.add(segment.assetId);
    }
  });

  return ids;
};

/** Timeline references plus media gallery pins — these asset rows (and blobs) are retained. */
export const getRetainedAssetIds = (project: EditorProject): Set<string> => {
  const ids = new Set(getReferencedAssetIds(project));
  project.mediaLibraryAssetIds.forEach((id) => ids.add(id));
  return ids;
};

const appendMediaLibraryAssetId = (project: EditorProject, assetId: string): string[] => (
  project.mediaLibraryAssetIds.includes(assetId)
    ? project.mediaLibraryAssetIds
    : [...project.mediaLibraryAssetIds, assetId]
);

export const addLibraryMediaToProject = (
  project: EditorProject,
  entries: { asset: AssetRecord }[],
): EditorProject => {
  let nextAssets = { ...project.assets };
  let nextIds = [...project.mediaLibraryAssetIds];
  for (const { asset } of entries) {
    nextAssets[asset.id] = asset;
    if (!nextIds.includes(asset.id)) {
      nextIds = [...nextIds, asset.id];
    }
  }

  return markProjectUpdated({
    ...project,
    assets: nextAssets,
    mediaLibraryAssetIds: nextIds,
  });
};

export const removeLibraryAsset = (
  project: EditorProject,
  assetId: string,
): { project: EditorProject } | { error: 'in_use' } => {
  if (getReferencedAssetIds(project).has(assetId)) {
    return { error: 'in_use' };
  }

  const nextLibraryIds = project.mediaLibraryAssetIds.filter((id) => id !== assetId);

  if (!project.assets[assetId]) {
    if (nextLibraryIds.length === project.mediaLibraryAssetIds.length) {
      return { project };
    }

    return {
      project: markProjectUpdated({
        ...project,
        mediaLibraryAssetIds: nextLibraryIds,
      }),
    };
  }

  const { [assetId]: _removed, ...restAssets } = project.assets;

  return {
    project: markProjectUpdated({
      ...project,
      mediaLibraryAssetIds: nextLibraryIds,
      assets: restAssets,
    }),
  };
};

export const pruneUnusedAssets = (project: EditorProject): EditorProject => {
  const retainedIds = getRetainedAssetIds(project);
  const nextAssets = Object.fromEntries(
    Object.entries(project.assets).filter(([assetId]) => retainedIds.has(assetId)),
  );
  const nextLibraryIds = project.mediaLibraryAssetIds.filter((id) => nextAssets[id]);

  const assetsChanged = Object.keys(nextAssets).length !== Object.keys(project.assets).length
    || Object.keys(project.assets).some((id) => !nextAssets[id]);
  const libraryChanged = nextLibraryIds.length !== project.mediaLibraryAssetIds.length
    || nextLibraryIds.some((id, i) => id !== project.mediaLibraryAssetIds[i]);

  if (!assetsChanged && !libraryChanged) {
    return project;
  }

  return {
    ...project,
    assets: nextAssets,
    mediaLibraryAssetIds: nextLibraryIds,
  };
};

export const parseProjectDocument = (candidate: unknown): EditorProject => {
  const parsed = editorProjectSchema.safeParse(candidate);
  if (!parsed.success) {
    return createDefaultProject();
  }

  return normalizeEditorProject(pruneUnusedAssets(parsed.data as EditorProject));
};

export const sanitizeProjectAgainstMissingAssets = (
  project: EditorProject,
  availableAssetIds: Set<string>,
): EditorProject => {
  const nextMusicClip = project.music.clip?.assetId && !availableAssetIds.has(project.music.clip.assetId)
    ? null
    : project.music.clip;
  const nextSegments = project.background.segments.filter(
    (segment) => !segment.assetId || availableAssetIds.has(segment.assetId),
  );
  const nextAssets = Object.fromEntries(
    Object.entries(project.assets).filter(([assetId]) => availableAssetIds.has(assetId)),
  );
  const nextLibraryIds = project.mediaLibraryAssetIds.filter((id) => availableAssetIds.has(id));

  const clearedAudio = !nextMusicClip
    ? createDefaultAudioStructureState()
    : project.audioStructure;

  return pruneUnusedAssets({
    ...project,
    music: {
      ...project.music,
      clip: nextMusicClip,
    },
    background: {
      ...project.background,
      segments: nextSegments,
    },
    assets: nextAssets,
    mediaLibraryAssetIds: nextLibraryIds,
    audioStructure: clearedAudio,
    projectSetup: !nextMusicClip ? createDefaultProjectSetupState() : project.projectSetup,
  });
};

export const buildTimelineClips = (
  project: EditorProject,
  assetUrls: Record<string, string>,
): Clip[] => {
  const clips: Clip[] = [];

  if (project.music.clip) {
    const asset = project.music.clip.assetId ? project.assets[project.music.clip.assetId] : undefined;
    clips.push({
      ...project.music.clip,
      trackId: MUSIC_TRACK_ID,
      assetId: project.music.clip.assetId ?? undefined,
      assetKind: asset?.kind,
      assetUrl: project.music.clip.assetId ? assetUrls[project.music.clip.assetId] : undefined,
      fadeInDuration: project.music.clip.fadeInDuration,
      fadeOutDuration: project.music.clip.fadeOutDuration,
    });
  }

  project.background.segments.forEach((segment) => {
    const asset = segment.assetId ? project.assets[segment.assetId] : undefined;
    clips.push({
      id: segment.id,
      trackId: BACKGROUND_TRACK_ID,
      name: segment.name,
      color: segment.color,
      start: segment.start,
      duration: segment.duration,
      sourceDuration: segment.sourceDuration,
      trimStart: segment.trimStart,
      assetId: segment.assetId ?? undefined,
      assetKind: asset?.kind,
      assetUrl: segment.assetId ? assetUrls[segment.assetId] : undefined,
      visualType: segment.visualType,
    });
  });

  project.subtitles.cues.forEach((cue) => {
    if (project.music.clip) {
      const mapped = subtitleCueToTimelineClipProps(cue, project.music.clip);
      if (!mapped) {
        return;
      }

      clips.push({
        id: cue.id,
        trackId: SUBTITLE_TRACK_ID,
        name: cue.text || 'Subtitle Cue',
        color: '#d946ef',
        start: mapped.start,
        duration: mapped.duration,
        overlayText: cue.text,
      });
      return;
    }

    clips.push({
      id: cue.id,
      trackId: SUBTITLE_TRACK_ID,
      name: cue.text || 'Subtitle Cue',
      color: '#d946ef',
      start: cue.start,
      duration: cue.duration,
      overlayText: cue.text,
    });
  });

  return clips;
};

export const appendSubtitleCue = (
  project: EditorProject,
  cue: SubtitleCue,
): EditorProject => {
  const nextCues = [...project.subtitles.cues, cue];

  return markProjectUpdated({
    ...project,
    subtitles: {
      ...project.subtitles,
      cues: nextCues,
    },
  });
};

export const updateSubtitleStyle = (
  project: EditorProject,
  updates: Partial<SubtitleStyle>,
): EditorProject => markProjectUpdated({
  ...project,
  subtitles: {
    ...project.subtitles,
    subtitleStyle: {
      ...project.subtitles.subtitleStyle,
      ...updates,
    },
  },
});

export const updateGlobalBackgroundEffects = (
  project: EditorProject,
  updates: {
    transition?: Partial<TransitionConfig>;
    motion?: Partial<MotionConfig>;
  },
): EditorProject => markProjectUpdated({
  ...project,
  background: {
    ...project.background,
    globalTransition: updates.transition
      ? normalizeTransitionConfig({
        ...project.background.globalTransition,
        ...updates.transition,
      })
      : project.background.globalTransition,
    globalMotion: updates.motion
      ? normalizeMotionConfig({
        ...project.background.globalMotion,
        ...updates.motion,
      })
      : project.background.globalMotion,
  },
});

export const updateSubtitleAlignmentInput = (
  project: EditorProject,
  input: SubtitleAlignmentInput,
): EditorProject => markProjectUpdated({
  ...project,
  lyricSync: {
    ...project.lyricSync,
    subtitleAlignment: {
      ...project.lyricSync.subtitleAlignment,
      input,
      errorMessage: null,
    },
  },
});

export const storeSplitMarkers = (
  project: EditorProject,
  preset: SplitPartRangePreset,
  markers: TimelineSplitMarker[],
): EditorProject => markProjectUpdated({
  ...project,
  splitPlanning: {
    preset,
    generatedAt: nowIso(),
    markers: [...markers]
      .filter((marker) => Number.isFinite(marker.time) && marker.time >= 0)
      .map((marker) => ({
        time: Math.round(marker.time * 1000) / 1000,
        score: Math.max(0, marker.score),
        reasons: [...marker.reasons],
      }))
      .sort((left, right) => left.time - right.time),
  },
});

export const setSplitPlanningPreset = (
  project: EditorProject,
  preset: SplitPartRangePreset,
): EditorProject => {
  if (project.splitPlanning.preset === preset) {
    return project;
  }

  return markProjectUpdated({
    ...project,
    splitPlanning: {
      ...project.splitPlanning,
      preset,
    },
  });
};

export const clearSplitMarkers = (project: EditorProject): EditorProject => markProjectUpdated({
  ...project,
  splitPlanning: {
    preset: project.splitPlanning.preset,
    generatedAt: null,
    markers: [],
  },
});

export const startSubtitleAlignment = (
  project: EditorProject,
  input: SubtitleAlignmentInput,
): EditorProject => markProjectUpdated({
  ...project,
  lyricSync: {
    ...project.lyricSync,
    subtitleAlignment: {
      status: 'running',
      input,
      result: null,
      approvedAt: null,
      errorMessage: null,
    },
  },
});

export const storeSubtitleAlignmentResult = (
  project: EditorProject,
  input: SubtitleAlignmentInput,
  result: SubtitleAlignmentResult,
): EditorProject => markProjectUpdated({
  ...project,
  lyricSync: {
    ...project.lyricSync,
    subtitleAlignment: {
      status: 'review',
      input,
      result,
      approvedAt: null,
      errorMessage: null,
    },
  },
});

export const storeSubtitleAlignmentError = (
  project: EditorProject,
  input: SubtitleAlignmentInput,
  errorMessage: string,
): EditorProject => markProjectUpdated({
  ...project,
  lyricSync: {
    ...project.lyricSync,
    subtitleAlignment: {
      ...project.lyricSync.subtitleAlignment,
      status: 'error',
      input,
      errorMessage,
    },
  },
});

export const applySubtitleAlignmentResult = (
  project: EditorProject,
  cues: SubtitleCue[],
): EditorProject => {
  const existingResult = project.lyricSync.subtitleAlignment.result;
  const sortedCues = [...cues].sort((left, right) => left.start - right.start);

  return markProjectUpdated({
    ...project,
    subtitles: {
      ...project.subtitles,
      sourceText: project.lyricSync.subtitleAlignment.input?.sourceText ?? project.subtitles.sourceText,
      cues: sortedCues,
    },
    lyricSync: {
      ...project.lyricSync,
      subtitleAlignment: {
        ...project.lyricSync.subtitleAlignment,
        status: 'applied',
        approvedAt: nowIso(),
        result: existingResult ? {
          ...existingResult,
          cues: sortedCues,
        } : existingResult,
        errorMessage: null,
      },
    },
  });
};

export const replaceMusicClip = (
  project: EditorProject,
  clip: MusicClip,
  asset: AssetRecord,
): EditorProject => pruneUnusedAssets(markProjectUpdated({
  ...project,
  mediaLibraryAssetIds: appendMediaLibraryAssetId(project, asset.id),
  music: {
    ...project.music,
    clip,
  },
  assets: {
    ...project.assets,
    [asset.id]: asset,
  },
  splitPlanning: {
    preset: project.splitPlanning.preset,
    generatedAt: null,
    markers: [],
  },
  projectSetup: createDefaultProjectSetupState(),
  audioStructure: createDefaultAudioStructureState(),
}));

export const storeAudioStructure = (
  project: EditorProject,
  payload: Partial<AudioStructureState> & {
    analysis?: AudioAnalysisResult | null;
  },
): EditorProject => {
  const nextAnalysis = payload.analysis !== undefined ? payload.analysis : project.audioStructure.analysis;
  const generatedAt = payload.generatedAt !== undefined
    ? payload.generatedAt
    : (payload.analysis !== undefined && payload.analysis !== null ? nowIso() : project.audioStructure.generatedAt);

  return markProjectUpdated({
    ...project,
    audioStructure: {
      ...project.audioStructure,
      ...payload,
      analysis: nextAnalysis,
      generatedAt,
    },
  });
};

export const completeProjectSetup = (project: EditorProject): EditorProject => markProjectUpdated({
  ...project,
  projectSetup: {
    status: 'complete',
    completedAt: nowIso(),
  },
});

export const appendBackgroundSegment = (
  project: EditorProject,
  segment: BackgroundSegment,
  asset?: AssetRecord,
): EditorProject => pruneUnusedAssets(markProjectUpdated({
  ...project,
  background: {
    ...project.background,
    segments: [...project.background.segments, segment],
  },
  assets: asset ? {
    ...project.assets,
    [asset.id]: asset,
  } : project.assets,
}));

export const upsertBackgroundSegment = (
  project: EditorProject,
  segment: BackgroundSegment,
  asset?: AssetRecord,
  options?: {
    replacePlaceholder?: boolean;
  },
): EditorProject => {
  const shouldReplacePlaceholder = Boolean(
    options?.replacePlaceholder
      && project.background.segments.length === 1
      && !project.background.segments[0]?.assetId,
  );

  return pruneUnusedAssets(markProjectUpdated({
    ...project,
    mediaLibraryAssetIds: asset ? appendMediaLibraryAssetId(project, asset.id) : project.mediaLibraryAssetIds,
    background: {
      ...project.background,
      segments: shouldReplacePlaceholder ? [segment] : [...project.background.segments, segment],
    },
    assets: asset ? {
      ...project.assets,
      [asset.id]: asset,
    } : project.assets,
  }));
};

export const updateTimelineClipInProject = (
  project: EditorProject,
  clipId: string,
  updates: Partial<Clip>,
): EditorProject => {
  if (project.music.clip?.id === clipId) {
    const clip = project.music.clip;
    const normalized = normalizeTrimmedRange(
      updates.duration ?? clip.duration,
      updates.sourceDuration ?? clip.sourceDuration,
      updates.trimStart ?? clip.trimStart,
    );
    const nextFadeIn = updates.fadeInDuration ?? clip.fadeInDuration ?? 0;
    const nextFadeOut = updates.fadeOutDuration ?? clip.fadeOutDuration ?? 0;
    const maxFade = Math.max(0, normalized.duration - 0.05);
    const fadeInDuration = clamp(nextFadeIn, 0, maxFade);
    const fadeOutDuration = clamp(nextFadeOut, 0, Math.max(0, maxFade - fadeInDuration));

    return markProjectUpdated({
      ...project,
      music: {
        ...project.music,
        clip: {
          ...clip,
          name: updates.name ?? clip.name,
          start: 0,
          duration: normalized.duration,
          sourceDuration: normalized.sourceDuration,
          trimStart: normalized.trimStart,
          waveform: updates.waveform ?? clip.waveform,
          fadeInDuration,
          fadeOutDuration,
        },
      },
    });
  }

  const subtitleCue = project.subtitles.cues.find((cue) => cue.id === clipId);
  if (subtitleCue) {
    const music = project.music.clip;
    const nextCues = project.subtitles.cues.map((cue) => {
      if (cue.id !== clipId) {
        return cue;
      }

      const nextText = updates.overlayText ?? updates.name ?? cue.text;

      if (!music) {
        return {
          ...cue,
          start: Math.max(0, updates.start ?? cue.start),
          duration: Math.max(MIN_CLIP_DURATION, updates.duration ?? cue.duration),
          text: nextText,
        };
      }

      const mapped = subtitleCueToTimelineClipProps(cue, music);
      const fallbackTimelineStart = music.start + Math.max(0, cue.start - (music.trimStart ?? 0));
      const timelineStart = updates.start ?? mapped?.start ?? fallbackTimelineStart;
      const timelineDuration = updates.duration ?? mapped?.duration ?? cue.duration;

      const { start: sourceStart, duration: sourceDuration } = timelineSubtitleEditToSource(
        timelineStart,
        timelineDuration,
        music,
      );

      return {
        ...cue,
        start: sourceStart,
        duration: sourceDuration,
        text: nextText,
      };
    });

    return markProjectUpdated({
      ...project,
      subtitles: {
        ...project.subtitles,
        cues: nextCues,
      },
    });
  }

  const backgroundSegment = project.background.segments.find((segment) => segment.id === clipId);
  if (!backgroundSegment) {
    return project;
  }

  const nextSegments = project.background.segments.map((segment) => {
    if (segment.id !== clipId) {
      return segment;
    }

    if (segment.visualType === 'video') {
      const normalized = normalizeTrimmedRange(
        updates.duration ?? segment.duration,
        updates.sourceDuration ?? segment.sourceDuration,
        updates.trimStart ?? segment.trimStart,
      );

      return {
        ...segment,
        name: updates.name ?? segment.name,
        start: Math.max(0, updates.start ?? segment.start),
        duration: normalized.duration,
        sourceDuration: normalized.sourceDuration,
        trimStart: normalized.trimStart,
      };
    }

    return {
      ...segment,
      name: updates.name ?? segment.name,
      start: Math.max(0, updates.start ?? segment.start),
      duration: Math.max(MIN_CLIP_DURATION, updates.duration ?? segment.duration),
    };
  });

  return markProjectUpdated({
    ...project,
    background: {
      ...project.background,
      segments: nextSegments,
    },
  });
};

export const deleteTimelineClipFromProject = (
  project: EditorProject,
  clipId: string,
): EditorProject => {
  if (project.music.clip?.id === clipId) {
    return pruneUnusedAssets(markProjectUpdated({
      ...project,
      music: {
        ...project.music,
        clip: null,
      },
      splitPlanning: {
        preset: project.splitPlanning.preset,
        generatedAt: null,
        markers: [],
      },
      projectSetup: createDefaultProjectSetupState(),
      audioStructure: createDefaultAudioStructureState(),
    }));
  }

  const hasSubtitleCue = project.subtitles.cues.some((cue) => cue.id === clipId);
  if (hasSubtitleCue) {
    const nextCues = project.subtitles.cues.filter((cue) => cue.id !== clipId);
    return markProjectUpdated({
      ...project,
      subtitles: {
        ...project.subtitles,
        cues: nextCues,
      },
    });
  }

  const nextSegments = project.background.segments.filter((segment) => segment.id !== clipId);
  if (nextSegments.length === project.background.segments.length) {
    return project;
  }

  return pruneUnusedAssets(markProjectUpdated({
    ...project,
    background: {
      ...project.background,
      segments: nextSegments,
    },
  }));
};

const normalizeSequentialStarts = <T extends { start: number; duration: number }>(items: T[]) => {
  const sorted = [...items].sort((left, right) => left.start - right.start);
  let currentStart = 0;

  return sorted.map((item) => {
    const nextStart = Math.max(currentStart, item.start);
    currentStart = nextStart + item.duration;

    if (nextStart === item.start) {
      return item;
    }

    return {
      ...item,
      start: nextStart,
    };
  });
};

export const normalizeTrackAfterDrag = (
  project: EditorProject,
  clipId: string,
): EditorProject => {
  if (project.subtitles.cues.some((cue) => cue.id === clipId)) {
    return markProjectUpdated({
      ...project,
      subtitles: {
        ...project.subtitles,
        cues: normalizeSequentialStarts(project.subtitles.cues),
      },
    });
  }

  if (project.background.segments.some((segment) => segment.id === clipId)) {
    return markProjectUpdated({
      ...project,
      background: {
        ...project.background,
        segments: normalizeSequentialStarts(project.background.segments),
      },
    });
  }

  return project;
};