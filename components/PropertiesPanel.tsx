'use client';
import React from 'react';
import { Clip } from '@/lib/types';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Slider } from '@/components/ui/slider';
import { Separator } from '@/components/ui/separator';

interface Props {
  clip: Clip | null;
  onChange: (id: string, updates: Partial<Clip>) => void;
}

function PropertiesPanel({ clip, onChange }: Props) {
  if (!clip) {
    return (
      <aside className="w-72 border-l border-zinc-800 bg-zinc-950 flex flex-col shrink-0 items-center justify-center text-zinc-500 text-sm">
        Select a clip to edit properties
      </aside>
    );
  }

  const formatTime = (seconds: number) => {
    const m = Math.floor(seconds / 60);
    const s = Math.floor(seconds % 60);
    return `00:${m.toString().padStart(2, '0')}:${s.toString().padStart(2, '0')}`;
  };

  return (
    <aside className="w-72 border-l border-zinc-800 bg-zinc-950 flex flex-col shrink-0 overflow-y-auto">
      <div className="h-14 border-b border-zinc-800 flex items-center px-4 shrink-0">
        <h2 className="text-sm font-semibold">Clip Properties</h2>
      </div>

      <div className="p-4 flex flex-col gap-6">
        {/* Basic Info */}
        <div className="flex flex-col gap-3">
          <div className="flex flex-col gap-2">
            <Label htmlFor="clip-name" className="text-xs text-zinc-400 font-medium">Name</Label>
            <Input 
              id="clip-name"
              type="text" 
              value={clip.name}
              onChange={(e) => onChange(clip.id, { name: e.target.value })}
              className="bg-zinc-900 border-zinc-800 text-zinc-100 focus-visible:ring-zinc-500 h-8 text-sm"
            />
          </div>
        </div>

        <Separator className="bg-zinc-800" />

        {/* Timing */}
        <div className="flex flex-col gap-4">
          <h3 className="text-xs font-semibold text-zinc-100 uppercase tracking-wider">Timing</h3>
          <div className="grid grid-cols-2 gap-3">
            <div className="flex flex-col gap-2">
              <Label className="text-xs text-zinc-400 font-medium">Start</Label>
              <Input 
                type="text" 
                value={formatTime(clip.start)} 
                disabled
                className="bg-zinc-900/50 border-zinc-800/50 text-zinc-500 font-mono cursor-not-allowed h-8 text-sm"
              />
            </div>
            <div className="flex flex-col gap-2">
              <Label className="text-xs text-zinc-400 font-medium">End</Label>
              <Input 
                type="text" 
                value={formatTime(clip.start + clip.duration)} 
                disabled
                className="bg-zinc-900/50 border-zinc-800/50 text-zinc-500 font-mono cursor-not-allowed h-8 text-sm"
              />
            </div>
          </div>
          <div className="flex flex-col gap-2">
            <Label htmlFor="clip-duration" className="text-xs text-zinc-400 font-medium">Duration (s)</Label>
            <Input 
              id="clip-duration"
              type="number" 
              value={Math.round(clip.duration)} 
              onChange={(e) => onChange(clip.id, { duration: Math.max(1, Number(e.target.value)) })}
              className="bg-zinc-900 border-zinc-800 text-zinc-100 font-mono focus-visible:ring-zinc-500 h-8 text-sm"
            />
          </div>
        </div>

        <Separator className="bg-zinc-800" />

        {/* Visual */}
        <div className="flex flex-col gap-4">
          <h3 className="text-xs font-semibold text-zinc-100 uppercase tracking-wider">Visual</h3>
          <div className="flex flex-col gap-3">
            <div className="flex items-center justify-between">
              <Label className="text-xs text-zinc-400 font-medium">Opacity</Label>
              <span className="text-xs text-zinc-500 font-mono">100%</span>
            </div>
            <Slider defaultValue={[100]} max={100} step={1} className="w-full" />
          </div>
          
          <div className="flex flex-col gap-3 mt-2">
            <div className="flex items-center justify-between">
              <Label className="text-xs text-zinc-400 font-medium">Scale</Label>
              <span className="text-xs text-zinc-500 font-mono">1.0x</span>
            </div>
            <Slider defaultValue={[100]} max={200} step={1} className="w-full" />
          </div>
        </div>
      </div>
    </aside>
  );
}

export default React.memo(PropertiesPanel);
