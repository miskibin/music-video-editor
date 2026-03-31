'use client';

import React, { useCallback, useEffect, useRef, useState } from 'react';
import Image from 'next/image';
import { ImageIcon, Loader2, Music, Search, Trash2, Video } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip';
import type { AssetRecord } from '@/lib/types';
import { setMediaGalleryDragData } from '@/lib/media-drag';
import {
  type StockSearchItem,
  fetchStockImageBlob,
  searchPexelsStock,
  searchPixabayStock,
} from '@/lib/stock-client';

const PEXELS_KEY_STORAGE = 'mve_pexels_api_key';
const PIXABAY_KEY_STORAGE = 'mve_pixabay_api_key';

interface Props {
  assets: AssetRecord[];
  assetUrls: Record<string, string>;
  referencedIds: Set<string>;
  onAddFiles: (files: FileList | null) => void;
  onRemoveAsset: (assetId: string) => void;
  onImportStockImage: (file: File) => void | Promise<void>;
}

function StockSearchPanel({
  source,
  apiKeyStorageKey,
  docsLabel,
  docsUrl,
  searchFn,
  onImportStockImage,
  onImported,
}: {
  source: 'pexels' | 'pixabay';
  apiKeyStorageKey: string;
  docsLabel: string;
  docsUrl: string;
  searchFn: (apiKey: string, query: string, page: number) => Promise<StockSearchItem[]>;
  onImportStockImage: (file: File) => void | Promise<void>;
  onImported: () => void;
}) {
  const [apiKey, setApiKey] = useState('');
  const [query, setQuery] = useState('');
  const [results, setResults] = useState<StockSearchItem[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [importingId, setImportingId] = useState<string | null>(null);

  useEffect(() => {
    if (typeof window === 'undefined') {
      return;
    }
    const stored = window.localStorage.getItem(apiKeyStorageKey);
    if (stored) {
      setApiKey(stored);
    }
  }, [apiKeyStorageKey]);

  const persistKey = useCallback(() => {
    if (typeof window === 'undefined') {
      return;
    }
    if (apiKey.trim()) {
      window.localStorage.setItem(apiKeyStorageKey, apiKey.trim());
    } else {
      window.localStorage.removeItem(apiKeyStorageKey);
    }
  }, [apiKey, apiKeyStorageKey]);

  const handleSearch = useCallback(async () => {
    setError(null);
    if (!apiKey.trim()) {
      setError('Add your API key above to search.');
      return;
    }
    if (!query.trim()) {
      setError('Enter a search term.');
      return;
    }
    setLoading(true);
    try {
      const items = await searchFn(apiKey, query, 1);
      setResults(items);
    } catch (e) {
      setResults([]);
      setError(e instanceof Error ? e.message : 'Search failed');
    } finally {
      setLoading(false);
    }
  }, [apiKey, query, searchFn]);

  const handleImport = useCallback(
    async (item: StockSearchItem) => {
      if (!item.downloadUrl) {
        setError('No download URL for this item.');
        return;
      }
      setImportingId(item.id);
      setError(null);
      try {
        const blob = await fetchStockImageBlob(item.downloadUrl);
        const ext = blob.type.includes('png') ? 'png' : 'jpg';
        const safeName = `${source}-${item.id.replace(/[^a-zA-Z0-9_-]/g, '')}.${ext}`;
        const file = new File([blob], safeName, { type: blob.type || 'image/jpeg' });
        await Promise.resolve(onImportStockImage(file));
        onImported();
      } catch (e) {
        setError(e instanceof Error ? e.message : 'Import failed');
      } finally {
        setImportingId(null);
      }
    },
    [onImportStockImage, onImported, source],
  );

  const hasKey = Boolean(apiKey.trim());

  return (
    <div className="flex min-h-0 flex-1 flex-col gap-2 p-2">
      <p className="px-0.5 text-[10px] leading-relaxed text-zinc-500">
        {source === 'pexels' ? (
          <>
            Search photos from Pexels. Get a free key at{' '}
            <a href={docsUrl} target="_blank" rel="noreferrer" className="text-emerald-500/90 underline">
              {docsLabel}
            </a>
            .
          </>
        ) : (
          <>
            Search photos from Pixabay. Get a key at{' '}
            <a href={docsUrl} target="_blank" rel="noreferrer" className="text-emerald-500/90 underline">
              {docsLabel}
            </a>
            .
          </>
        )}
      </p>
      <div className="space-y-1.5">
        <label className="text-[10px] font-medium uppercase tracking-wide text-zinc-500">API key</label>
        <Input
          type="password"
          autoComplete="off"
          placeholder={source === 'pexels' ? 'Pexels API key' : 'Pixabay API key'}
          value={apiKey}
          onChange={(e) => setApiKey(e.target.value)}
          onBlur={persistKey}
          className="h-8 border-zinc-700 bg-zinc-900/80 font-mono text-xs text-zinc-100"
        />
      </div>
      <div className="flex gap-1.5">
        <Input
          placeholder="Search photos…"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter') {
              void handleSearch();
            }
          }}
          disabled={!hasKey}
          className="h-8 flex-1 border-zinc-700 bg-zinc-900/80 text-xs text-zinc-100"
        />
        <Button
          type="button"
          size="sm"
          variant="secondary"
          className="h-8 shrink-0 px-2"
          disabled={!hasKey || loading}
          onClick={() => void handleSearch()}
        >
          {loading ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Search className="h-3.5 w-3.5" />}
        </Button>
      </div>
      {error ? <p className="text-[11px] text-rose-400">{error}</p> : null}
      <div className="panel-scrollbar grid min-h-0 flex-1 auto-rows-min grid-cols-2 gap-2 overflow-y-auto pb-1">
        {!hasKey ? (
          <p className="col-span-2 py-6 text-center text-[11px] text-zinc-500">
            Paste your {source === 'pexels' ? 'Pexels' : 'Pixabay'} API key to search.
          </p>
        ) : loading && results.length === 0 ? (
          <p className="col-span-2 flex items-center justify-center gap-2 py-8 text-[11px] text-zinc-500">
            <Loader2 className="h-4 w-4 animate-spin" /> Searching…
          </p>
        ) : results.length === 0 ? (
          <p className="col-span-2 py-6 text-center text-[11px] text-zinc-500">
            {query.trim() ? 'No results. Try another term.' : 'Search to see photos.'}
          </p>
        ) : (
          results.map((item) => (
            <div
              key={item.id}
              className="flex flex-col overflow-hidden rounded-lg border border-zinc-800/80 bg-zinc-900/40"
            >
              <div className="relative aspect-video w-full bg-black">
                {item.previewUrl ? (
                  // eslint-disable-next-line @next/next/no-img-element -- remote stock thumbnails
                  <img src={item.previewUrl} alt="" className="absolute inset-0 h-full w-full object-cover" />
                ) : null}
              </div>
              <div className="space-y-1 border-t border-zinc-800/60 p-1.5">
                <p className="line-clamp-2 text-[9px] text-zinc-500" title={item.attribution}>
                  {item.attribution}
                </p>
                <Button
                  type="button"
                  size="sm"
                  variant="secondary"
                  className="h-7 w-full text-[10px]"
                  disabled={importingId !== null}
                  onClick={() => void handleImport(item)}
                >
                  {importingId === item.id ? (
                    <Loader2 className="h-3 w-3 animate-spin" />
                  ) : (
                    'Add to library'
                  )}
                </Button>
              </div>
            </div>
          ))
        )}
      </div>
    </div>
  );
}

function MediaGalleryPanel({
  assets,
  assetUrls,
  referencedIds,
  onAddFiles,
  onRemoveAsset,
  onImportStockImage,
}: Props) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [activeTab, setActiveTab] = useState('library');

  const handleFileChange = useCallback(
    (event: React.ChangeEvent<HTMLInputElement>) => {
      onAddFiles(event.target.files);
      event.target.value = '';
    },
    [onAddFiles],
  );

  return (
    <aside className="flex h-full min-h-0 w-full min-w-0 flex-col overflow-hidden border-r border-zinc-800/80 bg-zinc-950/90">
      <Tabs value={activeTab} onValueChange={setActiveTab} className="flex min-h-0 flex-1 flex-col gap-0">
        <div className="flex shrink-0 flex-col gap-2 border-b border-zinc-800/80 px-2 py-2">
          <div className="flex items-center justify-between gap-2">
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
          <TabsList variant="line" className="h-auto w-full justify-start gap-0 bg-transparent p-0">
            <TabsTrigger value="library" className="flex-1 rounded-md text-[11px]">
              Library
            </TabsTrigger>
            <TabsTrigger value="pexels" className="flex-1 rounded-md text-[11px]">
              Pexels
            </TabsTrigger>
            <TabsTrigger value="pixabay" className="flex-1 rounded-md text-[11px]">
              Pixabay
            </TabsTrigger>
          </TabsList>
        </div>

        <TabsContent value="library" className="mt-0 min-h-0 flex-1 overflow-hidden data-[state=inactive]:hidden">
          <div className="panel-scrollbar grid h-full min-h-0 auto-rows-min grid-cols-2 gap-2 overflow-y-auto p-2">
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
        </TabsContent>

        <TabsContent value="pexels" className="mt-0 min-h-0 flex-1 overflow-hidden data-[state=inactive]:hidden">
          <StockSearchPanel
            source="pexels"
            apiKeyStorageKey={PEXELS_KEY_STORAGE}
            docsLabel="pexels.com/api"
            docsUrl="https://www.pexels.com/api/"
            searchFn={searchPexelsStock}
            onImportStockImage={onImportStockImage}
            onImported={() => setActiveTab('library')}
          />
        </TabsContent>

        <TabsContent value="pixabay" className="mt-0 min-h-0 flex-1 overflow-hidden data-[state=inactive]:hidden">
          <StockSearchPanel
            source="pixabay"
            apiKeyStorageKey={PIXABAY_KEY_STORAGE}
            docsLabel="pixabay.com/api/docs"
            docsUrl="https://pixabay.com/api/docs/"
            searchFn={searchPixabayStock}
            onImportStockImage={onImportStockImage}
            onImported={() => setActiveTab('library')}
          />
        </TabsContent>
      </Tabs>
    </aside>
  );
}

export default React.memo(MediaGalleryPanel);
