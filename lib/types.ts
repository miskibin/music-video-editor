export type TrackType = 'video' | 'text' | 'audio';

export type VisualType = 'gradient' | 'image' | 'video';

export type AssetKind = 'audio' | 'image' | 'video';

export type AssetSource = 'upload' | 'sample' | 'ai-generated' | 'ai-selected';

export type AlignmentLanguage = 'en' | 'pl';

export type SubtitleAlignmentStatus = 'idle' | 'running' | 'review' | 'applied' | 'error';

/** Visual preset id for subtitle appearance (sidebar + Remotion). */
export type SubtitleStylePreset =
  | 'glass'
  | 'tiktok-bold'
  | 'minimal'
  | 'outline'
  | 'captions-cc'
  | 'neon'
  | 'soft-rose'
  | 'lyric-film'
  | 'podcast'
  | 'hype';

export type SubtitleTextTransform = 'none' | 'uppercase' | 'lowercase';

/** Highlight active word when word timings exist. */
export type SubtitleWordHighlightMode = 'none' | 'karaoke';

/** Per-cue appearance when a subtitle starts (independent of clip transitions). */
export type SubtitleEntranceMode = 'none' | 'fade' | 'spring';

export interface SubtitleStyle {
  preset: SubtitleStylePreset;
  fontSize: number;
  textColor: string;
  /** 0–1 opacity of caption card background */
  backgroundOpacity: number;
  backgroundColor: string;
  /** 0–1 opacity of text fill */
  textOpacity: number;
  fontWeight: number;
  /** em-ish tracking; applied as letterSpacing in px via fontSize scale */
  letterSpacing: number;
  bottomOffsetPx: number;
  /** Horizontal shift from center in composition pixels (e.g. 1080-wide frame). */
  horizontalOffsetPx: number;
  horizontalPaddingPx: number;
  maxWidthPercent: number;
  borderRadiusPx: number;
  backdropBlurPx: number;
  textTransform: SubtitleTextTransform;
  wordHighlightMode: SubtitleWordHighlightMode;
  /** Instant, short fade, or springy pop-in. */
  subtitleEntrance: SubtitleEntranceMode;
  /** Linear fade length when `subtitleEntrance` is `fade`. */
  entranceFadeDurationSec: number;
  /** Spring stiffness when `subtitleEntrance` is `spring` (higher = snappier). */
  entranceSpringStiffness: number;
}

/** Default “glass card” look (matches original hardcoded Remotion subtitle). */
export const DEFAULT_SUBTITLE_STYLE: SubtitleStyle = {
  preset: 'glass',
  fontSize: 52,
  textColor: '#ffffff',
  backgroundOpacity: 0.58,
  backgroundColor: '#000000',
  textOpacity: 1,
  fontWeight: 700,
  letterSpacing: -0.03,
  bottomOffsetPx: 180,
  horizontalOffsetPx: 0,
  horizontalPaddingPx: 64,
  maxWidthPercent: 82,
  borderRadiusPx: 28,
  backdropBlurPx: 18,
  textTransform: 'none',
  wordHighlightMode: 'none',
  subtitleEntrance: 'none',
  entranceFadeDurationSec: 0.12,
  entranceSpringStiffness: 420,
};

export type TransitionKind =
  | 'none'
  | 'fade'
  | 'slide'
  | 'crossfade'
  | 'slide-left'
  | 'slide-right'
  | 'zoom'
  | 'flash';

export type TransitionEase = 'linear' | 'easeIn' | 'easeOut' | 'easeInOut';

export interface TransitionConfig {
  kind: TransitionKind;
  /** Seconds (in/out segment animation length). */
  duration: number;
  ease?: TransitionEase;
}

export type MotionMode = 'none' | 'beat-pulse' | 'kick-zoom';

export interface MotionConfig {
  mode: MotionMode;
  /** Base intensity 0–1 */
  strength: number;
  /** How responsive to beat phase (0 = dull, 1 = snappy) */
  sensitivity: number;
  /** Smoothing / inertia 0–1 */
  smoothness: number;
  /** Multiplier on beat frequency (1 = normal) */
  frequencyMultiplier: number;
  /** Decay for kick envelope 0–1 */
  decay: number;
}

export interface AssetRecord {
  id: string;
  kind: AssetKind;
  name: string;
  mimeType: string;
  size: number;
  duration?: number;
  width?: number;
  height?: number;
  createdAt: string;
  updatedAt: string;
  source: AssetSource;
}

export interface MusicClip {
  id: string;
  assetId: string | null;
  name: string;
  color: string;
  start: number;
  duration: number;
  sourceDuration?: number;
  trimStart?: number;
  waveform?: number[];
  /** Estimated from audio when uploaded; used for beat grid and motion preview. */
  bpm?: number | null;
  /** Seconds of fade-in at the start of the trimmed region */
  fadeInDuration?: number;
  /** Seconds of fade-out at the end of the trimmed region */
  fadeOutDuration?: number;
}

export interface SubtitleWord {
  id: string;
  text: string;
  startMs: number;
  endMs: number;
  confidence: number | null;
}

export interface SubtitleCue {
  id: string;
  start: number;
  duration: number;
  text: string;
  words: SubtitleWord[];
}

export interface SubtitleAlignmentInput {
  language: AlignmentLanguage;
  excerptStart: number;
  excerptEnd: number;
  sourceText: string;
}

export interface SubtitleAlignmentResult {
  provider: string;
  generatedAt: string;
  warnings: string[];
  lowConfidenceWordIds: string[];
  cues: SubtitleCue[];
}

export interface SubtitleAlignmentState {
  status: SubtitleAlignmentStatus;
  input: SubtitleAlignmentInput | null;
  result: SubtitleAlignmentResult | null;
  approvedAt: string | null;
  errorMessage: string | null;
}

export interface LyricSyncState {
  subtitleAlignment: SubtitleAlignmentState;
}

export interface SubtitleLayer {
  trackId: 't1';
  sourceText: string;
  cues: SubtitleCue[];
  subtitleStyle: SubtitleStyle;
}

export interface BackgroundSegment {
  id: string;
  assetId: string | null;
  name: string;
  color: string;
  start: number;
  duration: number;
  sourceDuration?: number;
  trimStart?: number;
  visualType: VisualType;
  transition: TransitionConfig;
  motion: MotionConfig;
}

export interface MusicLayer {
  trackId: 'a1';
  clip: MusicClip | null;
}

export interface BackgroundLayer {
  trackId: 'v1';
  segments: BackgroundSegment[];
  /** Applied to every background segment in preview and export. */
  globalTransition: TransitionConfig;
  globalMotion: MotionConfig;
}

export interface ProjectFormat {
  aspectRatio: '9:16';
  width: number;
  height: number;
}

export interface EditorProject {
  version: 3;
  id: string;
  name: string;
  createdAt: string;
  updatedAt: string;
  format: ProjectFormat;
  music: MusicLayer;
  subtitles: SubtitleLayer;
  background: BackgroundLayer;
  assets: Record<string, AssetRecord>;
  lyricSync: LyricSyncState;
  mediaLibraryAssetIds: string[];
}

export interface Clip {
  id: string;
  trackId: string;
  name: string;
  color: string;
  start: number; // in seconds
  duration: number; // in seconds
  sourceDuration?: number;
  trimStart?: number;
  assetId?: string;
  assetKind?: AssetKind;
  assetUrl?: string;
  visualType?: VisualType;
  overlayText?: string;
  waveform?: number[];
  bpm?: number | null;
  /** Music clip only */
  fadeInDuration?: number;
  fadeOutDuration?: number;
}

export interface Track {
  id: string;
  name: string;
  type: TrackType;
}
