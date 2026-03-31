export type TrackType = 'video' | 'text' | 'audio';

export type VisualType = 'gradient' | 'image' | 'video';

export type AssetKind = 'audio' | 'image' | 'video';

export type AssetSource = 'upload' | 'sample' | 'ai-generated' | 'ai-selected';

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

export interface SubtitleLayer {
  trackId: 't1';
  sourceText: string;
  cues: SubtitleCue[];
}

export interface TransitionConfig {
  kind: 'none' | 'fade' | 'slide';
  duration: number;
}

export interface MotionConfig {
  mode: 'none' | 'beat-pulse' | 'kick-zoom';
  strength: number;
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
}

export interface ProjectFormat {
  aspectRatio: '9:16';
  width: number;
  height: number;
}

export interface EditorProject {
  version: 2;
  id: string;
  name: string;
  createdAt: string;
  updatedAt: string;
  format: ProjectFormat;
  music: MusicLayer;
  subtitles: SubtitleLayer;
  background: BackgroundLayer;
  assets: Record<string, AssetRecord>;
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
}

export interface Track {
  id: string;
  name: string;
  type: TrackType;
}
