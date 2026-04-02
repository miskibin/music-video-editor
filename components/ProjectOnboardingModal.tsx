'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import { LoaderCircle, Music, Upload } from 'lucide-react';
import { Button } from '@/components/ui/button';
import LyricSyncStep from '@/components/LyricSyncStep';
import AudioAnalysisReview from '@/components/AudioAnalysisReview';
import type { SubtitleAlignmentInput, SubtitleCue } from '@/lib/types';
import type { SubtitleAlignmentState } from '@/lib/types';
import type { AudioAnalysisResult } from '@/lib/audio-analysis-types';
import { getEffectiveSectionBoundaries } from '@/lib/audio-analysis';
import type { MelSpectrogramResult } from '@/lib/mel-spectrogram';
import { defaultHeuristicSectionLabels } from '@/lib/section-labels';

export type WizardStep = 0 | 1 | 2;

type Props = {
  wizardStep: WizardStep;
  setWizardStep: (s: WizardStep) => void;
  musicDuration: number | null;
  musicFileName: string | null;
  alignmentState: SubtitleAlignmentState;
  subtitleAlignmentInput: SubtitleAlignmentInput;
  analysis: AudioAnalysisResult | null;
  mel: MelSpectrogramResult | null;
  analysisLoading: boolean;
  melLoading: boolean;
  boundaryInternals: number[];
  sectionLabels: string[];
  onUploadMusicFile: (file: File) => void | Promise<void>;
  onRunSubtitleAlignment: (input: SubtitleAlignmentInput) => void | Promise<void>;
  onApplyLyrics: (cues: SubtitleCue[]) => void;
  onFinishSetup: (payload: {
    analysis: AudioAnalysisResult;
    boundaryOverrides: number[] | null;
    sectionLabels: string[] | null;
  }) => void;
};

export function internalCutsFromAnalysis(a: AudioAnalysisResult, overrides: number[] | null): number[] {
  const full = getEffectiveSectionBoundaries(a, overrides);
  return full.slice(1, -1);
}

export default function ProjectOnboardingModal({
  wizardStep,
  setWizardStep,
  musicDuration,
  musicFileName,
  alignmentState,
  subtitleAlignmentInput,
  analysis,
  mel,
  analysisLoading,
  melLoading,
  boundaryInternals,
  sectionLabels,
  onUploadMusicFile,
  onRunSubtitleAlignment,
  onApplyLyrics,
  onFinishSetup,
}: Props) {
  const [locals, setLocals] = useState<number[]>([]);
  const [labels, setLabels] = useState<string[]>([]);
  const structureInitRef = useRef(false);

  useEffect(() => {
    if (musicDuration != null && wizardStep === 0) {
      setWizardStep(1);
    }
  }, [musicDuration, setWizardStep, wizardStep]);

  useEffect(() => {
    if (wizardStep !== 2) {
      structureInitRef.current = false;
    }
  }, [wizardStep]);

  useEffect(() => {
    if (wizardStep !== 2 || !analysis || structureInitRef.current) {
      return;
    }
    structureInitRef.current = true;
    const cuts = internalCutsFromAnalysis(
      analysis,
      boundaryInternals.length ? boundaryInternals : null,
    );
    setLocals(cuts);
    setLabels(
      sectionLabels.length >= cuts.length + 1
        ? sectionLabels
        : defaultHeuristicSectionLabels(cuts.length + 1),
    );
  }, [wizardStep, analysis, boundaryInternals, sectionLabels]);

  const stepTitle = useMemo(() => {
    if (wizardStep === 0) {
      return 'Upload your track';
    }
    if (wizardStep === 1) {
      return 'Lyrics & timing';
    }
    return 'Audio structure';
  }, [wizardStep]);

  const internalsForReview = useMemo(() => {
    if (locals.length) {
      return locals;
    }
    if (analysis) {
      return internalCutsFromAnalysis(analysis, null);
    }
    return [];
  }, [locals, analysis]);

  const labelsForReview = useMemo(() => {
    if (labels.length) {
      return labels;
    }
    const n = internalsForReview.length + 1;
    return defaultHeuristicSectionLabels(n);
  }, [labels, internalsForReview.length]);

  return (
    <div className="fixed inset-0 z-[60] flex items-center justify-center bg-black/80 p-4 backdrop-blur-md">
      <div className="flex max-h-[min(92vh,920px)] w-[min(1100px,100%)] flex-col overflow-hidden rounded-3xl border border-zinc-700 bg-zinc-950 shadow-2xl">
        <header className="border-b border-zinc-800 px-6 py-4">
          <p className="text-xs font-medium uppercase tracking-widest text-zinc-500">Project setup</p>
          <h2 className="mt-1 text-lg font-semibold text-zinc-100">{stepTitle}</h2>
          <div className="mt-3 flex gap-2">
            {([0, 1, 2] as const).map((s) => (
              <div
                key={s}
                className={`h-1 flex-1 rounded-full ${wizardStep >= s ? 'bg-white' : 'bg-zinc-800'}`}
              />
            ))}
          </div>
        </header>

        <div className="flex min-h-0 flex-1 flex-col overflow-hidden">
          {wizardStep === 0 ? (
            <div className="flex flex-1 flex-col items-center justify-center gap-6 px-8 py-12">
              <div className="rounded-full border border-zinc-700 bg-zinc-900/80 p-6">
                <Music className="h-14 w-14 text-zinc-300" />
              </div>
              <p className="max-w-md text-center text-sm text-zinc-400">
                Start by uploading the song file. The editor opens after you finish lyrics sync and audio review.
              </p>
              <label className="flex cursor-pointer items-center gap-2 rounded-full bg-white px-6 py-3 text-sm font-medium text-black hover:bg-zinc-200">
                <Upload className="h-4 w-4" />
                Choose audio file
                <input
                  type="file"
                  accept="audio/*"
                  className="hidden"
                  onChange={(e) => {
                    const f = e.target.files?.[0];
                    if (f) {
                      void onUploadMusicFile(f);
                    }
                  }}
                />
              </label>
            </div>
          ) : null}

          {wizardStep === 1 && musicDuration != null ? (
            <div className="flex min-h-0 flex-1 flex-col">
              <LyricSyncStep
                musicDuration={musicDuration}
                alignmentState={alignmentState}
                initialInput={subtitleAlignmentInput}
                onRun={onRunSubtitleAlignment}
                onApply={onApplyLyrics}
                showRunButton
                showApplyButton={false}
                onContinueWithGroupedCues={(cues) => {
                  onApplyLyrics(cues);
                  setWizardStep(2);
                }}
                continueDisabled={alignmentState.status === 'running'}
              />
            </div>
          ) : null}

          {wizardStep === 2 ? (
            <div className="flex min-h-0 flex-1 flex-col overflow-hidden">
              <div className="min-h-0 flex-1 overflow-y-auto px-6 py-4">
                {analysisLoading || !analysis ? (
                  <div className="flex flex-col items-center justify-center gap-3 py-20 text-zinc-400">
                    <LoaderCircle className="h-8 w-8 animate-spin" />
                    <p className="text-sm">Running audio analysis…</p>
                  </div>
                ) : (
                  <AudioAnalysisReview
                    analysis={analysis}
                    mel={mel}
                    melLoading={melLoading}
                    internalBoundaries={internalsForReview}
                    sectionLabels={labelsForReview}
                    onInternalBoundariesChange={(next) => {
                      setLocals(next);
                    }}
                    onSectionLabelsChange={setLabels}
                  />
                )}
              </div>
              <footer className="flex justify-end gap-2 border-t border-zinc-800 px-6 py-4">
                <Button
                  variant="ghost"
                  className="text-zinc-300"
                  onClick={() => setWizardStep(1)}
                >
                  Back
                </Button>
                <Button
                  disabled={!analysis || analysisLoading}
                  className="bg-white text-black hover:bg-zinc-200"
                  onClick={() => {
                    if (!analysis) {
                      return;
                    }
                    onFinishSetup({
                      analysis,
                      boundaryOverrides: locals.length ? locals : null,
                      sectionLabels: labels.length ? labels : null,
                    });
                  }}
                >
                  Open editor
                </Button>
              </footer>
            </div>
          ) : null}
        </div>

        {musicFileName ? (
          <p className="border-t border-zinc-800 px-6 py-2 text-center text-[11px] text-zinc-600">
            {musicFileName}
          </p>
        ) : null}
      </div>
    </div>
  );
}
