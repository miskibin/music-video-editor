/** Shared types for POST /api/audio/analysis — no imports from ./types to avoid cycles. */

export interface AudioAnalysisPoint {
  time: number;
  value: number;
}

export interface AudioAnalysisSection {
  index?: number;
  start: number;
  end: number;
  duration: number;
}

export interface AudioAnalysisSectionDiagnostics {
  sectionIndex: number;
  start: number;
  end: number;
  duration: number;
  meanEnergy: number;
  energyStd: number;
  meanOnsetStrength: number;
  meanNovelty: number;
  meanSpectralCentroid: number;
  meanSpectralRolloff: number;
  meanZeroCrossingRate: number;
  meanVoiceActivity: number;
  meanHarmonicRatio: number;
  meanPercussiveRatio: number;
  instrumentalDrive: number;
  soloLikelihood: number;
}

export interface AudioAnalysisSoloWindow {
  sectionIndex: number;
  start: number;
  end: number;
  duration: number;
  confidence: number;
  type: 'instrumental' | 'vocal';
}

export interface AudioAnalysisSummary {
  meanEnergy: number;
  energyDynamicRange: number;
  onsetDensityPerSecond: number;
  meanVoiceActivity: number;
  meanInstrumentalDrive: number;
  soloSectionCount: number;
}

export interface AudioAnalysisResult {
  provider: string;
  generatedAt: string;
  duration: number;
  sampleRate: number;
  bpm: number;
  tempoStability?: number;
  beatGrid: number[];
  onsetStrength: AudioAnalysisPoint[];
  energyStrength: AudioAnalysisPoint[];
  spectralCentroid?: AudioAnalysisPoint[];
  spectralRolloff?: AudioAnalysisPoint[];
  zeroCrossingRate?: AudioAnalysisPoint[];
  noveltyStrength?: AudioAnalysisPoint[];
  voiceActivity?: AudioAnalysisPoint[];
  harmonicEnergyRatio?: AudioAnalysisPoint[];
  percussiveEnergyRatio?: AudioAnalysisPoint[];
  sectionBoundaries: number[];
  sections: AudioAnalysisSection[];
  sectionDiagnostics?: AudioAnalysisSectionDiagnostics[];
  soloWindows?: AudioAnalysisSoloWindow[];
  summary?: AudioAnalysisSummary;
}

/** Persisted audio analysis + user-edited section boundaries (onboarding step 2). */
export interface AudioStructureState {
  analysis: AudioAnalysisResult | null;
  boundaryOverrides: number[] | null;
  sectionLabels: string[] | null;
  analysisAssetId: string | null;
  generatedAt: string | null;
}
