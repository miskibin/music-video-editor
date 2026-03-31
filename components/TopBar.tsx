import React from 'react';
import { Download, Save, Settings, Undo, Redo } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Separator } from '@/components/ui/separator';

function TopBar() {
  return (
    <header className="h-14 border-b border-zinc-800 bg-zinc-950 flex items-center justify-between px-4 shrink-0">
      <div className="flex items-center gap-4">
        <div className="font-semibold text-sm">Untitled Project</div>
        <Separator orientation="vertical" className="h-6 bg-zinc-800" />
        <div className="flex items-center gap-1">
          <Button variant="ghost" size="icon" className="h-8 w-8 text-zinc-400 hover:text-zinc-100 hover:bg-zinc-800">
            <Undo className="w-4 h-4" />
          </Button>
          <Button variant="ghost" size="icon" className="h-8 w-8 text-zinc-400 hover:text-zinc-100 hover:bg-zinc-800">
            <Redo className="w-4 h-4" />
          </Button>
        </div>
      </div>
      <div className="flex items-center gap-2">
        <Button variant="ghost" size="icon" className="h-8 w-8 text-zinc-400 hover:text-zinc-100 hover:bg-zinc-800">
          <Settings className="w-4 h-4" />
        </Button>
        <Button variant="ghost" size="sm" className="text-zinc-300 hover:text-white hover:bg-zinc-800">
          <Save className="w-4 h-4 mr-2" />
          Save
        </Button>
        <Button size="sm" className="bg-white text-black hover:bg-zinc-200">
          <Download className="w-4 h-4 mr-2" />
          Export
        </Button>
      </div>
    </header>
  );
}

export default React.memo(TopBar);
