import React from 'react';
import { Download, FilePlus, Save, Scissors, Settings, Subtitles, Undo, Redo } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Separator } from '@/components/ui/separator';
import { SplitPartRangePreset, SubtitleAlignmentStatus } from '@/lib/types';

type SaveState = 'loading' | 'saving' | 'saved' | 'error';

interface Props {
  projectName: string;
  musicBpm: number | null;
  saveState: SaveState;
  renderState: 'idle' | 'rendering' | 'success' | 'error';
  renderProgress: number;
  renderMessage: string | null;
  splitPartRangePreset: SplitPartRangePreset;
  onSplitPartRangePresetChange: (preset: SplitPartRangePreset) => void;
  onGenerateSplitMarkers: () => void;
  splitMarkerGenerationDisabled: boolean;
  isGeneratingSplitMarkers: boolean;
  onSave: () => void;
  onNewProject: () => void;
  onExport: () => void;
  onOpenSubtitleAlignment: () => void;
  subtitleAlignmentStatus: SubtitleAlignmentStatus;
  subtitleAlignmentDisabled: boolean;
  exportDisabled: boolean;
}

function TopBar({
  projectName,
  musicBpm,
  saveState,
  renderState,
  renderProgress,
  renderMessage,
  splitPartRangePreset,
  onSplitPartRangePresetChange,
  onGenerateSplitMarkers,
  splitMarkerGenerationDisabled,
  isGeneratingSplitMarkers,
  onSave,
  onNewProject,
  onExport,
  onOpenSubtitleAlignment,
  subtitleAlignmentStatus,
  subtitleAlignmentDisabled,
  exportDisabled,
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
  const exportTone = renderState === 'error' ? 'text-rose-300' : 'text-zinc-400';
  const progressPercent = Math.max(0, Math.min(100, Math.round(renderProgress * 100)));
  const exportLabel = renderState === 'rendering' ? `Rendering ${progressPercent}%` : 'Export MP4';
  const splitButtonLabel = isGeneratingSplitMarkers ? 'Planning Splits' : 'Create Split Markers';

  return (
    <header className="relative h-14 border-b border-zinc-800 bg-zinc-950 flex items-center justify-between px-4 shrink-0">
      {renderState === 'rendering' ? (
        <div className="pointer-events-none absolute inset-x-0 bottom-0 h-[2px] bg-zinc-800">
          <div
            className="h-full bg-white transition-[width] duration-300 ease-out"
            style={{ width: `${progressPercent}%` }}
          />
        </div>
      ) : null}
      <div className="flex items-center gap-4">
        <div className="font-semibold text-sm">{projectName}</div>
        {musicBpm != null ? (
          <>
            <Separator orientation="vertical" className="h-6 bg-zinc-800" />
            <span className="text-xs font-mono text-zinc-400 tabular-nums">{musicBpm} BPM</span>
          </>
        ) : null}
        <Separator orientation="vertical" className="h-6 bg-zinc-800" />
        <Button
          variant="ghost"
          size="sm"
          onClick={onNewProject}
          className="text-zinc-300 hover:bg-zinc-800 hover:text-white"
        >
          <FilePlus className="w-4 h-4 mr-2" />
          New project
        </Button>
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
        {renderMessage ? (
          <span className={`hidden text-xs md:inline ${exportTone}`}>
            {renderState === 'rendering' ? `${progressPercent}% - ${renderMessage}` : renderMessage}
          </span>
        ) : null}
        <label className="hidden items-center gap-2 rounded-md border border-zinc-800 bg-zinc-900 px-2 py-1 text-xs text-zinc-400 md:flex">
          <span>Parts</span>
          <select
            value={splitPartRangePreset}
            onChange={(event) => onSplitPartRangePresetChange(event.target.value as SplitPartRangePreset)}
            className="border-0 bg-transparent font-mono text-zinc-200 outline-none"
          >
            <option value="4-7">4-7</option>
            <option value="6-10">6-10</option>
            <option value="9-15">9-15</option>
            <option value="15-25">15-25</option>
          </select>
        </label>
        <Button
          variant="ghost"
          size="sm"
          onClick={onGenerateSplitMarkers}
          disabled={splitMarkerGenerationDisabled}
          className="text-zinc-300 hover:bg-zinc-800 hover:text-white disabled:opacity-60"
        >
          <Scissors className="w-4 h-4 mr-2" />
          {splitButtonLabel}
        </Button>
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
        <Button
          size="sm"
          onClick={onExport}
          disabled={exportDisabled}
          className="bg-white text-black hover:bg-zinc-200 disabled:opacity-60 disabled:cursor-not-allowed"
        >
          <Download className="w-4 h-4 mr-2" />
          {exportLabel}
        </Button>
      </div>
    </header>
  );
}

export default React.memo(TopBar);
