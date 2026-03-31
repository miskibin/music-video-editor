'use client';

import React, { useCallback, useRef } from 'react';
import Image from 'next/image';
import { ImageIcon, Music, Trash2, Video } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip';
import type { AssetRecord } from '@/lib/types';
import { setMediaGalleryDragData } from '@/lib/media-drag';

interface Props {
  assets: AssetRecord[];
  assetUrls: Record<string, string>;
  referencedIds: Set<string>;
  onAddFiles: (files: FileList | null) => void;
  onRemoveAsset: (assetId: string) => void;
}

function MediaGalleryPanel({ assets, assetUrls, referencedIds, onAddFiles, onRemoveAsset }: Props) {
  const inputRef = useRef<HTMLInputElement>(null);

  const handleFileChange = useCallback(
    (event: React.ChangeEvent<HTMLInputElement>) => {
      onAddFiles(event.target.files);
      event.target.value = '';
    },
    [onAddFiles],
  );

  return (
    <aside className="flex w-64 shrink-0 flex-col overflow-hidden border-r border-zinc-800/80 bg-zinc-950/90">
      <div className="flex shrink-0 items-center justify-between gap-2 border-b border-zinc-800/80 px-3 py-2.5">
        <p className="text-[11px] font-medium uppercase tracking-[0.24em] text-zinc-600">Media</p>
        <div>
          <input
            ref={inputRef}
            type="file"
            accept="image/*,video/*,audio/*"
            multiple
            className="hidden"
            onChange={handleFileChange}
          />
          <Button
            type="button"
            variant="secondary"
            size="sm"
            className="h-7 text-xs"
            onClick={() => inputRef.current?.click()}
          >
            Add
          </Button>
        </div>
      </div>

      <div className="panel-scrollbar grid min-h-0 flex-1 auto-rows-min grid-cols-2 gap-2 overflow-y-auto p-2">
        {assets.length === 0 ? (
          <p className="col-span-2 px-1 py-4 text-center text-xs text-zinc-500">
            No files yet. Add images, video, or audio — they stay here until you use them on the timeline.
          </p>
        ) : (
          assets.map((asset) => {
            const url = assetUrls[asset.id];
            const inUse = referencedIds.has(asset.id);

            return (
              <div
                key={asset.id}
                draggable
                onDragStart={(event) => setMediaGalleryDragData(event.dataTransfer, asset.id)}
                className="group relative flex cursor-grab flex-col overflow-hidden rounded-lg border border-zinc-800/80 bg-zinc-900/40 active:cursor-grabbing"
              >
                <div className="relative aspect-video w-full bg-black">
                  {asset.kind === 'image' && url ? (
                    <Image
                      src={url}
                      alt={asset.name}
                      fill
                      unoptimized
                      className="object-cover"
                    />
                  ) : null}
                  {asset.kind === 'video' && url ? (
                    <video src={url} muted playsInline className="absolute inset-0 h-full w-full object-cover" />
                  ) : null}
                  {asset.kind === 'audio' ? (
                    <div className="flex h-full w-full items-center justify-center bg-zinc-900">
                      <Music className="h-8 w-8 text-zinc-500" />
                    </div>
                  ) : null}
                  {inUse ? (
                    <span className="absolute left-1 top-1 rounded bg-emerald-950/90 px-1.5 py-0.5 text-[9px] font-medium uppercase tracking-wide text-emerald-300">
                      In use
                    </span>
                  ) : null}
                </div>
                <div className="flex min-w-0 items-start gap-1 border-t border-zinc-800/60 p-1.5">
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-[10px] font-medium text-zinc-200" title={asset.name}>
                      {asset.name}
                    </p>
                    <p className="mt-0.5 flex items-center gap-1 text-[9px] uppercase tracking-wider text-zinc-500">
                      {asset.kind === 'image' ? <ImageIcon className="h-3 w-3" /> : null}
                      {asset.kind === 'video' ? <Video className="h-3 w-3" /> : null}
                      {asset.kind === 'audio' ? <Music className="h-3 w-3" /> : null}
                      {asset.kind}
                    </p>
                  </div>
                  <Tooltip>
                    <TooltipTrigger asChild>
                      <span className="inline-flex">
                        <Button
                          type="button"
                          variant="ghost"
                          size="icon"
                          className="h-7 w-7 shrink-0 text-zinc-500 hover:text-rose-400"
                          disabled={inUse}
                          draggable={false}
                          onMouseDown={(e) => e.stopPropagation()}
                          onClick={() => onRemoveAsset(asset.id)}
                          aria-label="Remove from project"
                        >
                          <Trash2 className="h-3.5 w-3.5" />
                        </Button>
                      </span>
                    </TooltipTrigger>
                    <TooltipContent side="left" className="max-w-[200px] border-zinc-700 bg-zinc-800 text-zinc-200">
                      {inUse
                        ? 'Used on the timeline — remove it there first.'
                        : 'Remove from project'}
                    </TooltipContent>
                  </Tooltip>
                </div>
              </div>
            );
          })
        )}
      </div>
    </aside>
  );
}

export default React.memo(MediaGalleryPanel);
