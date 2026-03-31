import { z } from 'zod';
import {
  AlignmentLanguage,
  AssetRecord,
  BackgroundSegment,
  Clip,
  EditorProject,
  LyricSyncState,
  MusicClip,
  SubtitleAlignmentInput,
  SubtitleAlignmentResult,
  SubtitleAlignmentState,
  SubtitleCue,
  Track,
} from '@/lib/types';

export const PROJECT_VERSION = 3 as const;
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
const transitionSchema = z.object({
  kind: z.enum(['none', 'fade', 'slide']),
  duration: z.number().min(0),
});
const motionSchema = z.object({
  mode: z.enum(['none', 'beat-pulse', 'kick-zoom']),
  strength: z.number().min(0),
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

const lyricSyncStateSchema = z.object({
  subtitleAlignment: subtitleAlignmentStateSchema,
});

const subtitleLayerSchema = z.object({
  trackId: z.literal(SUBTITLE_TRACK_ID),
  sourceText: z.string(),
  cues: z.array(subtitleCueSchema),
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
  background: z.object({
    trackId: z.literal(BACKGROUND_TRACK_ID),
    segments: z.array(backgroundSegmentSchema),
  }),
  assets: z.record(z.string(), assetRecordSchema),
  lyricSync: lyricSyncStateSchema,
});

const legacyPhase3ProjectSchema = z.object({
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
  background: z.object({
    trackId: z.literal(BACKGROUND_TRACK_ID),
    segments: z.array(backgroundSegmentSchema),
  }),
  assets: z.record(z.string(), assetRecordSchema),
  phase3: lyricSyncStateSchema,
});

const legacyEditorProjectSchema = z.object({
  version: z.literal(2),
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
  background: z.object({
    trackId: z.literal(BACKGROUND_TRACK_ID),
    segments: z.array(backgroundSegmentSchema),
  }),
  assets: z.record(z.string(), assetRecordSchema),
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

const migrateLegacyProject = (legacyProject: z.infer<typeof legacyEditorProjectSchema>): EditorProject => ({
  ...legacyProject,
  version: PROJECT_VERSION,
  lyricSync: createDefaultLyricSyncState(legacyProject),
});

const migrateLegacyPhase3Project = (legacyProject: z.infer<typeof legacyPhase3ProjectSchema>): EditorProject => {
  const { phase3, ...project } = legacyProject;

  return {
    ...project,
    lyricSync: phase3,
  };
};

export const createId = () => Math.random().toString(36).substring(2, 9);

export const createDefaultBackgroundSegment = (): BackgroundSegment => ({
  id: createId(),
  assetId: null,
  name: 'Background',
  color: '#2563eb',
  start: 0,
  duration: 12,
  visualType: 'gradient',
  transition: { kind: 'none', duration: 0 },
  motion: { mode: 'beat-pulse', strength: 0.2 },
});

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
    },
    background: {
      trackId: BACKGROUND_TRACK_ID,
      segments: [createDefaultBackgroundSegment()],
    },
    assets: {},
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

export const pruneUnusedAssets = (project: EditorProject): EditorProject => {
  const referencedIds = getReferencedAssetIds(project);
  let didChange = false;
  const nextAssets = Object.fromEntries(
    Object.entries(project.assets).filter(([assetId]) => {
      const keep = referencedIds.has(assetId);
      if (!keep) {
        didChange = true;
      }
      return keep;
    }),
  );

  if (!didChange) {
    return project;
  }

  return {
    ...project,
    assets: nextAssets,
  };
};

export const parseProjectDocument = (candidate: unknown): EditorProject => {
  const parsed = editorProjectSchema.safeParse(candidate);

  if (!parsed.success) {
    const legacyPhase3Parsed = legacyPhase3ProjectSchema.safeParse(candidate);
    if (legacyPhase3Parsed.success) {
      return pruneUnusedAssets(migrateLegacyPhase3Project(legacyPhase3Parsed.data));
    }

    const legacyParsed = legacyEditorProjectSchema.safeParse(candidate);
    if (legacyParsed.success) {
      return pruneUnusedAssets(migrateLegacyProject(legacyParsed.data));
    }

    return createDefaultProject();
  }

  return pruneUnusedAssets(parsed.data);
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
  music: {
    ...project.music,
    clip,
  },
  assets: {
    ...project.assets,
    [asset.id]: asset,
  },
}));

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
        },
      },
    });
  }

  const subtitleCue = project.subtitles.cues.find((cue) => cue.id === clipId);
  if (subtitleCue) {
    const nextCues = project.subtitles.cues.map((cue) => {
      if (cue.id !== clipId) {
        return cue;
      }

      return {
        ...cue,
        start: Math.max(0, updates.start ?? cue.start),
        duration: Math.max(MIN_CLIP_DURATION, updates.duration ?? cue.duration),
        text: updates.overlayText ?? updates.name ?? cue.text,
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