'use client';

import { Button } from '@/components/ui/button';
import { X } from 'lucide-react';
import LyricSyncStep from '@/components/LyricSyncStep';
import { SubtitleAlignmentInput, SubtitleAlignmentState, SubtitleCue } from '@/lib/types';

interface Props {
  musicDuration: number | null;
  alignmentState: SubtitleAlignmentState;
  initialInput: SubtitleAlignmentInput;
  onClose: () => void;
  onRun: (input: SubtitleAlignmentInput) => void;
  onApply: (cues: SubtitleCue[]) => void;
}

export default function SubtitleAlignmentModal({
  musicDuration,
  alignmentState,
  initialInput,
  onClose,
  onRun,
  onApply,
}: Props) {
  const isRunning = alignmentState.status === 'running';

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

        <div className="flex min-h-0 flex-1 flex-col">
          <LyricSyncStep
            musicDuration={musicDuration}
            alignmentState={alignmentState}
            initialInput={initialInput}
            onRun={onRun}
            onApply={onApply}
          />
        </div>
      </div>
    </div>
  );
}
