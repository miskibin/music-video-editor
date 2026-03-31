'use client';

import { useMemo, useState } from 'react';
import { AlertCircle, LoaderCircle, Sparkles, WandSparkles, X } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { SubtitleAlignmentInput, SubtitleAlignmentState, SubtitleCue } from '@/lib/types';

interface Props {
  musicDuration: number | null;
  alignmentState: SubtitleAlignmentState;
  initialInput: SubtitleAlignmentInput;
  onClose: () => void;
  onRun: (input: SubtitleAlignmentInput) => void;
  onApply: (cues: SubtitleCue[]) => void;
}

const clamp = (value: number, min: number, max: number) => Math.min(Math.max(value, min), max);

const formatWordTiming = (startMs: number, endMs: number) => `${(startMs / 1000).toFixed(2)}s - ${(endMs / 1000).toFixed(2)}s`;

export default function SubtitleAlignmentModal({
  musicDuration,
  alignmentState,
  initialInput,
  onClose,
  onRun,
  onApply,
}: Props) {
  const [draftInput, setDraftInput] = useState(initialInput);
  const [draftCues, setDraftCues] = useState<SubtitleCue[]>(alignmentState.result?.cues ?? []);

  const maxExcerptEnd = useMemo(() => {
    if (musicDuration === null) {
      return 30;
    }

    return Math.max(1, Number(musicDuration.toFixed(1)));
  }, [musicDuration]);

  const lowConfidenceWordIds = useMemo(
    () => new Set(alignmentState.result?.lowConfidenceWordIds ?? []),
    [alignmentState.result?.lowConfidenceWordIds],
  );
  const isRunning = alignmentState.status === 'running';
  const hasResult = draftCues.length > 0;
  const canRun = musicDuration !== null
    && draftInput.sourceText.trim().length > 0
    && draftInput.excerptEnd > draftInput.excerptStart;

  const handleInputChange = <K extends keyof SubtitleAlignmentInput>(key: K, value: SubtitleAlignmentInput[K]) => {
    setDraftInput((currentInput) => ({
      ...currentInput,
      [key]: value,
    }));
  };

  const handleCueChange = (cueId: string, updates: Partial<SubtitleCue>) => {
    setDraftCues((currentCues) => currentCues.map((cue) => {
      if (cue.id !== cueId) {
        return cue;
      }

      return {
        ...cue,
        ...updates,
      };
    }));
  };

  const handleWordChange = (cueId: string, wordId: string, nextText: string) => {
    setDraftCues((currentCues) => currentCues.map((cue) => {
      if (cue.id !== cueId) {
        return cue;
      }

      const nextWords = cue.words.map((word) => word.id === wordId ? { ...word, text: nextText } : word);

      return {
        ...cue,
        words: nextWords,
        text: nextWords.map((word) => word.text).join(' '),
      };
    }));
  };

  const handleRun = () => {
    if (!canRun) {
      return;
    }

    onRun({
      ...draftInput,
      excerptStart: clamp(Number(draftInput.excerptStart.toFixed(1)), 0, maxExcerptEnd),
      excerptEnd: clamp(Number(draftInput.excerptEnd.toFixed(1)), 0, maxExcerptEnd),
      sourceText: draftInput.sourceText.trim(),
    });
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-4 backdrop-blur-sm">
      <div className="flex h-[min(90vh,860px)] w-[min(1040px,100%)] flex-col overflow-hidden rounded-3xl border border-zinc-800 bg-zinc-950 shadow-2xl">
        <div className="flex items-center justify-between border-b border-zinc-800 px-6 py-4">
          <div>
            <p className="text-[11px] font-medium uppercase tracking-[0.24em] text-zinc-500">Lyric Sync</p>
            <h2 className="mt-1 text-lg font-semibold text-zinc-100">Lyrics Timing Review</h2>
            <p className="mt-1 text-sm text-zinc-400">Generate draft lyric timings for the selected excerpt, review the cues, then apply them to the project.</p>
          </div>
          <Button
            variant="ghost"
            size="icon"
            onClick={onClose}
            disabled={isRunning}
            className="h-9 w-9 text-zinc-400 hover:bg-zinc-800 hover:text-zinc-100 disabled:opacity-40"
          >
            <X className="h-4 w-4" />
          </Button>
        </div>

        <div className="grid min-h-0 flex-1 gap-0 md:grid-cols-[340px_1fr]">
          <div className="flex min-h-0 flex-col gap-5 border-r border-zinc-800 px-6 py-5">
            <section className="space-y-3">
              <div>
                <p className="text-sm font-medium text-zinc-100">Inputs</p>
                <p className="mt-1 text-xs text-zinc-500">This first Lyric Sync backend iteration uses excerpt timing plus provided lyrics. It does not analyze the audio waveform yet.</p>
              </div>

              <div className="space-y-2">
                <Label htmlFor="alignment-language" className="text-xs font-medium text-zinc-400">Language</Label>
                <select
                  id="alignment-language"
                  value={draftInput.language}
                  onChange={(event) => handleInputChange('language', event.target.value as SubtitleAlignmentInput['language'])}
                  className="flex h-9 w-full rounded-md border border-zinc-800/80 bg-zinc-950/80 px-3 text-sm text-zinc-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-zinc-600"
                  disabled={isRunning}
                >
                  <option value="en">English</option>
                  <option value="pl">Polish</option>
                </select>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-2">
                  <Label htmlFor="excerpt-start" className="text-xs font-medium text-zinc-400">Excerpt Start</Label>
                  <Input
                    id="excerpt-start"
                    type="number"
                    min={0}
                    max={maxExcerptEnd}
                    step={0.1}
                    value={draftInput.excerptStart}
                    disabled={isRunning || musicDuration === null}
                    onChange={(event) => handleInputChange('excerptStart', Math.max(0, Number(event.target.value) || 0))}
                    className="h-9 border-zinc-800/80 bg-zinc-950/80 text-zinc-100 focus-visible:ring-zinc-600"
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="excerpt-end" className="text-xs font-medium text-zinc-400">Excerpt End</Label>
                  <Input
                    id="excerpt-end"
                    type="number"
                    min={0}
                    max={maxExcerptEnd}
                    step={0.1}
                    value={draftInput.excerptEnd}
                    disabled={isRunning || musicDuration === null}
                    onChange={(event) => handleInputChange('excerptEnd', Math.max(0, Number(event.target.value) || 0))}
                    className="h-9 border-zinc-800/80 bg-zinc-950/80 text-zinc-100 focus-visible:ring-zinc-600"
                  />
                </div>
              </div>

              <div className="rounded-xl border border-zinc-800 bg-zinc-900/40 px-3 py-2 text-xs text-zinc-400">
                {musicDuration === null
                  ? 'Upload music first to set the alignment excerpt against the song duration.'
                  : `Music duration available: ${musicDuration.toFixed(1)}s`}
              </div>

              <div className="space-y-2">
                <Label htmlFor="alignment-lyrics" className="text-xs font-medium text-zinc-400">Lyrics</Label>
                <Textarea
                  id="alignment-lyrics"
                  value={draftInput.sourceText}
                  onChange={(event) => handleInputChange('sourceText', event.target.value)}
                  disabled={isRunning}
                  placeholder="Paste the raw lyrics block for the selected excerpt."
                />
              </div>
            </section>

            {(alignmentState.errorMessage || alignmentState.result?.warnings.length) ? (
              <section className="space-y-2 rounded-2xl border border-amber-500/20 bg-amber-500/10 px-4 py-3">
                <div className="flex items-start gap-2 text-amber-100">
                  <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" />
                  <div className="space-y-1 text-sm">
                    {alignmentState.errorMessage ? <p>{alignmentState.errorMessage}</p> : null}
                    {alignmentState.result?.warnings.map((warning) => (
                      <p key={warning}>{warning}</p>
                    ))}
                  </div>
                </div>
              </section>
            ) : null}

            <div className="mt-auto flex gap-2 pt-2">
              <Button variant="ghost" onClick={onClose} disabled={isRunning} className="flex-1 text-zinc-300 hover:bg-zinc-800 hover:text-white">
                Close
              </Button>
              <Button onClick={handleRun} disabled={!canRun || isRunning} className="flex-1 bg-white text-black hover:bg-zinc-200 disabled:opacity-60">
                {isRunning ? <LoaderCircle className="mr-2 h-4 w-4 animate-spin" /> : <WandSparkles className="mr-2 h-4 w-4" />}
                {isRunning ? 'Syncing Lyrics' : hasResult ? 'Run Again' : 'Run Lyric Sync'}
              </Button>
            </div>
          </div>

          <div className="min-h-0 overflow-y-auto px-6 py-5">
            <div className="mb-4 flex items-center justify-between gap-4">
              <div>
                <p className="text-sm font-medium text-zinc-100">Review</p>
                <p className="mt-1 text-xs text-zinc-500">Low-confidence words are highlighted for review before the cues are applied to the timeline.</p>
              </div>
              {alignmentState.result ? (
                <div className="rounded-full border border-zinc-800 bg-zinc-900/70 px-3 py-1 text-[11px] uppercase tracking-[0.18em] text-zinc-400">
                  {alignmentState.result.provider}
                </div>
              ) : null}
            </div>

            {!hasResult ? (
              <div className="flex h-full min-h-64 items-center justify-center rounded-3xl border border-dashed border-zinc-800 bg-zinc-900/20 px-6 text-center text-sm text-zinc-500">
                {isRunning
                  ? (
                    <div className="flex items-center gap-3 text-zinc-300">
                      <LoaderCircle className="h-5 w-5 animate-spin" />
                      <span>Generating cue timings from the selected excerpt.</span>
                    </div>
                  )
                  : 'Run alignment to review generated subtitle cues and word timings.'}
              </div>
            ) : (
              <div className="space-y-4 pb-2">
                {draftCues.map((cue, cueIndex) => (
                  <section key={cue.id} className="rounded-3xl border border-zinc-800 bg-zinc-900/30 p-4">
                    <div className="mb-3 flex items-center justify-between gap-3">
                      <div>
                        <p className="text-[11px] font-medium uppercase tracking-[0.24em] text-zinc-600">Cue {cueIndex + 1}</p>
                        <p className="mt-1 text-sm text-zinc-400">{cue.words.length} words</p>
                      </div>
                      <Sparkles className="h-4 w-4 text-zinc-500" />
                    </div>

                    <div className="grid gap-3 md:grid-cols-[1fr_110px_110px]">
                      <div className="space-y-2">
                        <Label htmlFor={`cue-text-${cue.id}`} className="text-xs font-medium text-zinc-400">Cue Text</Label>
                        <Input
                          id={`cue-text-${cue.id}`}
                          value={cue.text}
                          onChange={(event) => handleCueChange(cue.id, { text: event.target.value })}
                          className="h-9 border-zinc-800/80 bg-zinc-950/80 text-zinc-100 focus-visible:ring-zinc-600"
                        />
                      </div>
                      <div className="space-y-2">
                        <Label htmlFor={`cue-start-${cue.id}`} className="text-xs font-medium text-zinc-400">Start</Label>
                        <Input
                          id={`cue-start-${cue.id}`}
                          type="number"
                          min={0}
                          step={0.1}
                          value={cue.start}
                          onChange={(event) => handleCueChange(cue.id, { start: Math.max(0, Number(event.target.value) || 0) })}
                          className="h-9 border-zinc-800/80 bg-zinc-950/80 text-zinc-100 focus-visible:ring-zinc-600"
                        />
                      </div>
                      <div className="space-y-2">
                        <Label htmlFor={`cue-duration-${cue.id}`} className="text-xs font-medium text-zinc-400">Duration</Label>
                        <Input
                          id={`cue-duration-${cue.id}`}
                          type="number"
                          min={1}
                          step={0.1}
                          value={cue.duration}
                          onChange={(event) => handleCueChange(cue.id, { duration: Math.max(1, Number(event.target.value) || 1) })}
                          className="h-9 border-zinc-800/80 bg-zinc-950/80 text-zinc-100 focus-visible:ring-zinc-600"
                        />
                      </div>
                    </div>

                    <div className="mt-4 flex flex-wrap gap-2">
                      {cue.words.map((word) => {
                        const isLowConfidence = lowConfidenceWordIds.has(word.id);

                        return (
                          <label
                            key={word.id}
                            className={`flex min-w-28 flex-col gap-1 rounded-2xl border px-3 py-2 ${isLowConfidence ? 'border-amber-400/40 bg-amber-400/10' : 'border-zinc-800 bg-zinc-950/70'}`}
                          >
                            <span className="text-[10px] uppercase tracking-[0.18em] text-zinc-500">{formatWordTiming(word.startMs, word.endMs)}</span>
                            <input
                              value={word.text}
                              onChange={(event) => handleWordChange(cue.id, word.id, event.target.value)}
                              className="border-none bg-transparent p-0 text-sm font-medium text-zinc-100 outline-none"
                            />
                            <span className={`text-[10px] ${isLowConfidence ? 'text-amber-200' : 'text-zinc-500'}`}>
                              {word.confidence === null ? 'Confidence unavailable' : `Confidence ${Math.round(word.confidence * 100)}%`}
                            </span>
                          </label>
                        );
                      })}
                    </div>
                  </section>
                ))}

                <div className="sticky bottom-0 pt-2">
                  <div className="flex justify-end rounded-2xl border border-zinc-800 bg-zinc-950/90 px-4 py-3 backdrop-blur-sm">
                    <Button onClick={() => onApply(draftCues)} className="bg-white text-black hover:bg-zinc-200">
                      Apply to Project
                    </Button>
                  </div>
                </div>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}