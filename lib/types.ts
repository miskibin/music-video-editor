export type TrackType = 'video' | 'text' | 'audio';

export type VisualType = 'gradient' | 'image';

export interface Clip {
  id: string;
  trackId: string;
  name: string;
  color: string;
  start: number; // in seconds
  duration: number; // in seconds
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
