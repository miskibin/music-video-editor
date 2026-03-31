'use client';

import { useEffect, useMemo, useState } from 'react';
import { AlertCircle, LoaderCircle, WandSparkles, X } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { SubtitleAlignmentInput, SubtitleAlignmentState, SubtitleCue, SubtitleWord } from '@/lib/types';

interface Props {
  musicDuration: number | null;
  alignmentState: SubtitleAlignmentState;
  initialInput: SubtitleAlignmentInput;
  onClose: () => void;
  onRun: (input: SubtitleAlignmentInput) => void;
  onApply: (cues: SubtitleCue[]) => void;
}

const clamp = (value: number, min: number, max: number) => Math.min(Math.max(value, min), max);

const formatWordTiming = (startMs: number, endMs: number) => `${(startMs / 1000).toFixed(2)}s – ${(endMs / 1000).toFixed(2)}s`;

type GroupingMode = 'backend' | 'single' | 'short' | 'medium';

const GROUPING_PRESETS: Record<GroupingMode, { label: string; maxWords: number }> = {
  backend: { label: 'Your line breaks (verses)', maxWords: 0 },
  single: { label: '1 word', maxWords: 1 },
  short: { label: 'Tight timing · max 4 words', maxWords: 4 },
  medium: { label: 'Tight timing · max 7 words', maxWords: 7 },
};

const gapBetween = (left: SubtitleWord, right: SubtitleWord) => Math.max(0, right.startMs - left.endMs);

/** Larger gaps between words → new cue; threshold adapts to the song’s typical spacing. */
const adaptiveBreakThresholdMs = (gaps: number[]): number => {
  if (gaps.length === 0) {
    return 400;
  }
  const sorted = [...gaps].sort((a, b) => a - b);
  const median = sorted[Math.floor(sorted.length / 2)];
  const p75 = sorted[Math.floor((sorted.length - 1) * 0.75)];
  return Math.min(1200, Math.max(100, median * 2.2 + (p75 - median)));
};

const createCue = (words: SubtitleWord[], index: number): SubtitleCue => {
  const first = words[0];
  const last = words[words.length - 1];
  const start = first.startMs / 1000;
  const end = last.endMs / 1000;

  return {
    id: `cue-${index + 1}`,
    start,
    duration: Math.max(0.05, end - start),
    text: words.map((word) => word.text).join(' '),
    words,
  };
};

const getPreferredCueLength = (maxWords: number) => {
  if (maxWords <= 1) {
    return 1;
  }

  if (maxWords <= 4) {
    return 3;
  }

  return 5;
};

const getSegmentCost = (
  words: SubtitleWord[],
  gaps: number[],
  thresholdMs: number,
  startIndex: number,
  endIndex: number,
  maxWords: number,
) => {
  const length = endIndex - startIndex + 1;
  const preferredLength = getPreferredCueLength(maxWords);
  const leftGap = startIndex === 0 ? thresholdMs : gaps[startIndex - 1];
  const rightGap = endIndex === words.length - 1 ? thresholdMs : gaps[endIndex];

  let internalGapPenalty = 0;
  let maxInternalGapRatio = 0;
  for (let index = startIndex; index < endIndex; index += 1) {
    const gapRatio = gaps[index] / thresholdMs;
    internalGapPenalty += gapRatio ** 2.4;
    maxInternalGapRatio = Math.max(maxInternalGapRatio, gapRatio);
  }

  const sizePenalty = length >= preferredLength
    ? 0
    : ((preferredLength - length) / preferredLength) * 0.2;

  const isolationRatio = Math.max(leftGap, rightGap) / thresholdMs;
  const singletonPenalty = length === 1 && maxWords > 1
    ? Math.max(0, 0.85 - (isolationRatio * 0.65))
    : 0;

  const durationMs = Math.max(1, words[endIndex].endMs - words[startIndex].startMs);
  const durationPenalty = maxWords > 1
    ? Math.max(0, (durationMs - 2600) / 1400) * 0.18
    : 0;

  return internalGapPenalty + (maxInternalGapRatio * 0.35) + sizePenalty + singletonPenalty + durationPenalty;
};

/**
 * Groups words with dynamic programming so each split can look ahead.
 * This lets a borderline word stay with the current cue or move to the next one
 * depending on which global segmentation has the lower timing cost.
 */
const groupWordsByTimeProximity = (words: SubtitleWord[], maxWords: number): SubtitleCue[] => {
  if (words.length === 0) {
    return [];
  }
  if (maxWords <= 1) {
    return words.map((word, index) => createCue([word], index));
  }

  const sorted = [...words].sort((a, b) => a.startMs - b.startMs);
  const gaps: number[] = [];
  for (let i = 0; i < sorted.length - 1; i += 1) {
    gaps.push(gapBetween(sorted[i], sorted[i + 1]));
  }
  const thresholdMs = adaptiveBreakThresholdMs(gaps);
  const bestCostFrom = new Array<number>(sorted.length + 1).fill(Number.POSITIVE_INFINITY);
  const nextBreakAt = new Array<number>(sorted.length).fill(-1);
  bestCostFrom[sorted.length] = 0;

  for (let startIndex = sorted.length - 1; startIndex >= 0; startIndex -= 1) {
    for (
      let endIndex = startIndex;
      endIndex < Math.min(sorted.length, startIndex + maxWords);
      endIndex += 1
    ) {
      const segmentCost = getSegmentCost(sorted, gaps, thresholdMs, startIndex, endIndex, maxWords);
      const totalCost = segmentCost + bestCostFrom[endIndex + 1];

      if (totalCost < bestCostFrom[startIndex]) {
        bestCostFrom[startIndex] = totalCost;
        nextBreakAt[startIndex] = endIndex + 1;
      }
    }
  }

  const cues: SubtitleCue[] = [];
  let cursor = 0;
  while (cursor < sorted.length) {
    const nextCursor = nextBreakAt[cursor];
    if (nextCursor <= cursor) {
      break;
    }

    cues.push(createCue(sorted.slice(cursor, nextCursor), cues.length));
    cursor = nextCursor;
  }

  if (cursor < sorted.length) {
    cues.push(createCue(sorted.slice(cursor), cues.length));
  }

  return cues;
};

export default function SubtitleAlignmentModal({
  musicDuration,
  alignmentState,
  initialInput,
  onClose,
  onRun,
  onApply,
}: Props) {
  const [draftInput, setDraftInput] = useState(initialInput);
  const [groupingMode, setGroupingMode] = useState<GroupingMode>('backend');
  const [draftWords, setDraftWords] = useState<SubtitleWord[]>(
    alignmentState.result?.cues.flatMap((cue) => cue.words) ?? [],
  );

  useEffect(() => {
    if (alignmentState.result?.cues?.length) {
      setDraftWords(alignmentState.result.cues.flatMap((cue) => cue.words));
    }
  }, [alignmentState.result?.generatedAt]);

  const maxExcerptEnd = useMemo(() => {
    if (musicDuration === null) {
      return 30;
    }

    return Math.max(1, Number(musicDuration.toFixed(1)));
  }, [musicDuration]);

  const groupedCues = useMemo(() => {
    const result = alignmentState.result;
    if (groupingMode === 'backend' && result?.cues.length) {
      const expected = result.cues.reduce((sum, c) => sum + c.words.length, 0);
      if (draftWords.length === expected) {
        let i = 0;
        return result.cues.map((cue) => {
          const n = cue.words.length;
          const words = draftWords.slice(i, i + n);
          i += n;
          return {
            ...cue,
            words,
            text: words.map((w) => w.text).join(' '),
          };
        });
      }
    }
    const preset = GROUPING_PRESETS[groupingMode];
    if (groupingMode === 'backend') {
      return groupWordsByTimeProximity(draftWords, 4);
    }
    return groupWordsByTimeProximity(draftWords, preset.maxWords);
  }, [alignmentState.result, draftWords, groupingMode]);

  const lowConfidenceWordIds = useMemo(
    () => new Set(alignmentState.result?.lowConfidenceWordIds ?? []),
    [alignmentState.result?.lowConfidenceWordIds],
  );
  const isRunning = alignmentState.status === 'running';
  const hasResult = draftWords.length > 0;
  const canRun = musicDuration !== null
    && draftInput.sourceText.trim().length > 0
    && maxExcerptEnd > 0;

  const handleInputChange = <K extends keyof SubtitleAlignmentInput>(key: K, value: SubtitleAlignmentInput[K]) => {
    setDraftInput((currentInput) => ({
      ...currentInput,
      [key]: value,
    }));
  };

  const handleWordChange = (wordId: string, nextText: string) => {
    setDraftWords((currentWords) => currentWords.map((word) => (
      word.id === wordId ? { ...word, text: nextText } : word
    )));
  };

  const handleRun = () => {
    if (!canRun) {
      return;
    }

    onRun({
      ...draftInput,
      excerptStart: 0,
      excerptEnd: clamp(Number(maxExcerptEnd.toFixed(1)), 0, maxExcerptEnd),
      sourceText: draftInput.sourceText.trim(),
    });
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-4 backdrop-blur-sm">
      <div className="flex h-[min(90vh,860px)] w-[min(1040px,100%)] flex-col overflow-hidden rounded-3xl border border-zinc-800 bg-zinc-950 shadow-2xl">
        <div className="flex items-center justify-between border-b border-zinc-800 px-4 py-3">
          <p className="text-sm font-medium text-zinc-200">Lyric Sync</p>
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

              <p className="text-xs text-zinc-500">
                {musicDuration === null
                  ? 'Upload music first.'
                  : `${musicDuration.toFixed(1)}s`}
              </p>

              <div className="space-y-2">
                <Label htmlFor="alignment-lyrics" className="text-xs font-medium text-zinc-400">Lyrics</Label>
                <Textarea
                  id="alignment-lyrics"
                  value={draftInput.sourceText}
                  onChange={(event) => handleInputChange('sourceText', event.target.value)}
                  disabled={isRunning}
                  placeholder="Paste the raw lyrics block for the whole song."
                  className="min-h-64 max-h-[55vh] resize-y overflow-y-auto"
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

          <div className="flex min-h-0 flex-col overflow-hidden px-4 py-3">
            {!hasResult ? (
              <div className="flex min-h-48 flex-1 items-center justify-center text-center text-sm text-zinc-500">
                {isRunning
                  ? (
                    <div className="flex items-center gap-2 text-zinc-300">
                      <LoaderCircle className="h-5 w-5 animate-spin" />
                      <span>Syncing…</span>
                    </div>
                  )
                  : 'Run Lyric Sync to preview.'}
              </div>
            ) : (
              <>
                <div className="mb-3 flex flex-wrap items-center gap-2">
                  <Label htmlFor="grouping-mode" className="text-xs text-zinc-500">Group</Label>
                  <select
                    id="grouping-mode"
                    value={groupingMode}
                    onChange={(event) => setGroupingMode(event.target.value as GroupingMode)}
                    className="h-8 min-w-[12rem] rounded border border-zinc-800 bg-zinc-950 px-2 text-sm text-zinc-100 focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-zinc-600"
                    disabled={isRunning}
                  >
                    {Object.entries(GROUPING_PRESETS).map(([key, preset]) => (
                      <option key={key} value={key}>{preset.label}</option>
                    ))}
                  </select>
                  {alignmentState.result ? (
                    <span className="text-xs text-zinc-600">{alignmentState.result.provider}</span>
                  ) : null}
                </div>

                <div className="min-h-0 flex-1 space-y-0 overflow-y-auto border-t border-zinc-800/80">
                  {groupedCues.map((cue) => (
                    <div key={cue.id} className="border-b border-zinc-800/60 py-3">
                      <p className="mb-2 text-[11px] text-zinc-500">{formatWordTiming(cue.words[0].startMs, cue.words[cue.words.length - 1].endMs)}</p>
                      <div className="flex flex-wrap gap-1.5">
                        {cue.words.map((word) => {
                          const isLowConfidence = lowConfidenceWordIds.has(word.id);

                          return (
                            <label
                              key={word.id}
                              className={`inline-flex rounded-md border px-2 py-1 ${isLowConfidence ? 'border-amber-400/40 bg-amber-400/10' : 'border-zinc-800/90 bg-zinc-950/40'}`}
                            >
                              <input
                                value={word.text}
                                onChange={(event) => handleWordChange(word.id, event.target.value)}
                                className="min-w-[2ch] max-w-[40ch] bg-transparent text-sm text-zinc-100 outline-none"
                              />
                            </label>
                          );
                        })}
                      </div>
                    </div>
                  ))}
                </div>

                <div className="mt-3 flex justify-end border-t border-zinc-800 pt-3">
                  <Button onClick={() => onApply(groupedCues)} className="bg-white text-black hover:bg-zinc-200">
                    Apply to Project
                  </Button>
                </div>
              </>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}