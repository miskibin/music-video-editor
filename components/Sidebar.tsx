'use client';
import React, { useRef } from 'react';
import { Film, Sparkles, Music, Subtitles, MousePointer2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip';

interface Props {
  onAddSubtitleCue: () => void;
  onAddBackgroundPlaceholder: () => void;
  onUploadMusic: (file: File) => void;
  onUploadBackgroundMedia: (file: File) => void;
}

function Sidebar({
  onAddSubtitleCue,
  onAddBackgroundPlaceholder,
  onUploadMusic,
  onUploadBackgroundMedia,
}: Props) {
  const musicInputRef = useRef<HTMLInputElement>(null);
  const backgroundInputRef = useRef<HTMLInputElement>(null);

  const tools = [
    { icon: MousePointer2, label: 'Select', action: 'select' as const },
    { icon: Film, label: 'Media', action: 'upload-background' as const },
    { icon: Sparkles, label: 'AI Art', action: 'add-background' as const },
    { icon: Music, label: 'Music', action: 'upload-audio' as const },
    { icon: Subtitles, label: 'Cue', action: 'add-subtitle' as const },
  ];

  const handleToolClick = (tool: typeof tools[number]) => {
    if (tool.action === 'upload-audio') {
      musicInputRef.current?.click();
      return;
    }

    if (tool.action === 'upload-background') {
      backgroundInputRef.current?.click();
      return;
    }

    if (tool.action === 'add-background') {
      onAddBackgroundPlaceholder();
      return;
    }

    if (tool.action === 'add-subtitle') {
      onAddSubtitleCue();
    }
  };

  const handleMusicChange = (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;
    onUploadMusic(file);
    event.target.value = '';
  };

  const handleBackgroundChange = (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;
    onUploadBackgroundMedia(file);
    event.target.value = '';
  };

  return (
    <aside className="w-16 border-r border-zinc-800 bg-zinc-950 flex flex-col items-center py-4 gap-2 shrink-0">
      <input
        ref={musicInputRef}
        type="file"
        accept="audio/*"
        className="hidden"
        onChange={handleMusicChange}
      />
      <input
        ref={backgroundInputRef}
        type="file"
        accept="image/*,video/*"
        className="hidden"
        onChange={handleBackgroundChange}
      />

      {tools.map((tool, i) => (
        <Tooltip key={i}>
          <TooltipTrigger asChild>
            <Button
              variant={tool.action === 'select' ? 'secondary' : 'ghost'}
              size="icon"
              onClick={() => handleToolClick(tool)}
              className={`h-14 w-14 rounded-xl flex flex-col items-center justify-center gap-1 ${
                tool.action === 'select'
                  ? 'bg-zinc-800 text-white hover:bg-zinc-700' 
                  : 'text-zinc-400 hover:text-zinc-100 hover:bg-zinc-800/50'
              }`}
            >
              <tool.icon className="w-5 h-5" />
              <span className="text-[10px] font-medium leading-none">{tool.label}</span>
            </Button>
          </TooltipTrigger>
          <TooltipContent side="right" className="bg-zinc-800 text-zinc-100 border-zinc-700">
            <p>
              {tool.action === 'upload-audio'
                ? 'Upload music'
                : tool.action === 'upload-background'
                  ? 'Upload background image or video'
                  : tool.action === 'add-background'
                    ? 'Add AI background placeholder'
                    : tool.action === 'add-subtitle'
                      ? 'Add subtitle cue'
                      : tool.label}
            </p>
          </TooltipContent>
        </Tooltip>
      ))}
    </aside>
  );
}

export default React.memo(Sidebar);
