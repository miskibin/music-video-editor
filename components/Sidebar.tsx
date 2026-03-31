'use client';
import React, { useRef } from 'react';
import { Type, Image as ImageIcon, Sparkles, Music, Subtitles, MousePointer2 } from 'lucide-react';
import { TrackType } from '@/lib/types';
import { Button } from '@/components/ui/button';
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip';

interface Props {
  onAddClip: (type: TrackType) => void;
  onUploadMusic: (file: File) => void;
  onUploadImage: (file: File) => void;
}

function Sidebar({ onAddClip, onUploadMusic, onUploadImage }: Props) {
  const musicInputRef = useRef<HTMLInputElement>(null);
  const imageInputRef = useRef<HTMLInputElement>(null);

  const tools = [
    { icon: MousePointer2, label: 'Select', type: null, action: 'select' as const },
    { icon: Type, label: 'Text', type: 'text' as TrackType, action: 'add' as const },
    { icon: ImageIcon, label: 'Image', type: 'video' as TrackType, action: 'upload-image' as const },
    { icon: Sparkles, label: 'AI Art', type: 'video' as TrackType, action: 'add' as const },
    { icon: Music, label: 'Music', type: 'audio' as TrackType, action: 'upload-audio' as const },
    { icon: Subtitles, label: 'Subtitles', type: 'text' as TrackType, action: 'add' as const },
  ];

  const handleToolClick = (tool: typeof tools[number]) => {
    if (tool.action === 'upload-audio') {
      musicInputRef.current?.click();
      return;
    }

    if (tool.action === 'upload-image') {
      imageInputRef.current?.click();
      return;
    }

    if (tool.type) {
      onAddClip(tool.type);
    }
  };

  const handleMusicChange = (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;
    onUploadMusic(file);
    event.target.value = '';
  };

  const handleImageChange = (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;
    onUploadImage(file);
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
        ref={imageInputRef}
        type="file"
        accept="image/*"
        className="hidden"
        onChange={handleImageChange}
      />

      {tools.map((tool, i) => (
        <Tooltip key={i}>
          <TooltipTrigger asChild>
            <Button
              variant={!tool.type ? "secondary" : "ghost"}
              size="icon"
              onClick={() => handleToolClick(tool)}
              className={`h-14 w-14 rounded-xl flex flex-col items-center justify-center gap-1 ${
                !tool.type 
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
                : tool.action === 'upload-image'
                  ? 'Upload image'
                  : tool.type
                    ? `Add ${tool.label}`
                    : tool.label}
            </p>
          </TooltipContent>
        </Tooltip>
      ))}
    </aside>
  );
}

export default React.memo(Sidebar);
