import React from 'react';
import { Download, Save, Settings, Subtitles, Undo, Redo } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Separator } from '@/components/ui/separator';
import { SubtitleAlignmentStatus } from '@/lib/types';

type SaveState = 'loading' | 'saving' | 'saved' | 'error';

interface Props {
  projectName: string;
  musicBpm: number | null;
  saveState: SaveState;
  onSave: () => void;
  onOpenSubtitleAlignment: () => void;
  subtitleAlignmentStatus: SubtitleAlignmentStatus;
  subtitleAlignmentDisabled: boolean;
}

function TopBar({
  projectName,
  musicBpm,
  saveState,
  onSave,
  onOpenSubtitleAlignment,
  subtitleAlignmentStatus,
  subtitleAlignmentDisabled,
}: Props) {
  const saveLabel = saveState === 'loading'
    ? 'Loading'
    : saveState === 'saving'
      ? 'Saving'
      : saveState === 'saved'
        ? 'Saved'
        : 'Retry Save';
  const alignmentLabel = subtitleAlignmentStatus === 'running'
    ? 'Syncing Lyrics'
    : subtitleAlignmentStatus === 'review'
      ? 'Review Lyric Sync'
      : subtitleAlignmentStatus === 'applied'
        ? 'Re-run Lyric Sync'
        : 'Run Lyric Sync';

  return (
    <header className="h-14 border-b border-zinc-800 bg-zinc-950 flex items-center justify-between px-4 shrink-0">
      <div className="flex items-center gap-4">
        <div className="font-semibold text-sm">{projectName}</div>
        {musicBpm != null ? (
          <>
            <Separator orientation="vertical" className="h-6 bg-zinc-800" />
            <span className="text-xs font-mono text-zinc-400 tabular-nums">{musicBpm} BPM</span>
          </>
        ) : null}
        <Separator orientation="vertical" className="h-6 bg-zinc-800" />
        <div className="flex items-center gap-1">
          <Button variant="ghost" size="icon" disabled className="h-8 w-8 text-zinc-400 hover:text-zinc-100 hover:bg-zinc-800 disabled:opacity-40">
            <Undo className="w-4 h-4" />
          </Button>
          <Button variant="ghost" size="icon" disabled className="h-8 w-8 text-zinc-400 hover:text-zinc-100 hover:bg-zinc-800 disabled:opacity-40">
            <Redo className="w-4 h-4" />
          </Button>
        </div>
      </div>
      <div className="flex items-center gap-2">
        <Button
          variant="ghost"
          size="sm"
          onClick={onOpenSubtitleAlignment}
          disabled={subtitleAlignmentDisabled}
          className="text-zinc-300 hover:bg-zinc-800 hover:text-white disabled:opacity-60"
        >
          <Subtitles className="w-4 h-4 mr-2" />
          {alignmentLabel}
        </Button>
        <Button variant="ghost" size="icon" className="h-8 w-8 text-zinc-400 hover:text-zinc-100 hover:bg-zinc-800">
          <Settings className="w-4 h-4" />
        </Button>
        <Button
          variant="ghost"
          size="sm"
          onClick={onSave}
          disabled={saveState === 'loading' || saveState === 'saving'}
          className="text-zinc-300 hover:text-white hover:bg-zinc-800 disabled:opacity-60"
        >
          <Save className="w-4 h-4 mr-2" />
          {saveLabel}
        </Button>
        <Button size="sm" disabled className="bg-white text-black hover:bg-zinc-200 disabled:opacity-60 disabled:cursor-not-allowed">
          <Download className="w-4 h-4 mr-2" />
          Export
        </Button>
      </div>
    </header>
  );
}

export default React.memo(TopBar);
