'use client';

import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import Image from 'next/image';
import { ImageIcon, KeyRound, Loader2, Music, Search, Trash2, Video } from 'lucide-react';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip';
import type { AssetRecord } from '@/lib/types';
import { setMediaGalleryDragData } from '@/lib/media-drag';
import {
  type StockSearchItem,
  fetchStockMediaBlob,
  searchPexelsStock,
  searchPixabayStock,
} from '@/lib/stock-client';

type MediaKindFilter = 'all' | 'photo' | 'video';

const PEXELS_KEY_STORAGE = 'mve_pexels_api_key';
const PIXABAY_KEY_STORAGE = 'mve_pixabay_api_key';

/** Official pages to obtain API keys */
const PEXELS_GET_API_KEY_URL = 'https://www.pexels.com/api/';
const PIXABAY_API_DOCS_URL = 'https://pixabay.com/api/docs/';
const PIXABAY_ACCOUNT_URL = 'https://pixabay.com/accounts/edit/';

const MAX_SEARCH_RESULTS = 10;

/** Muted hover preview: shows a decoded frame on load, plays while pointer is over the tile. */
function GalleryVideoPreview({
  src,
  poster,
  className,
}: {
  src: string;
  poster?: string | null;
  className?: string;
}) {
  const videoRef = useRef<HTMLVideoElement>(null);

  return (
    <video
      ref={videoRef}
      src={src}
      poster={poster ?? undefined}
      muted
      playsInline
      loop
      preload="metadata"
      controls={false}
      disablePictureInPicture
      className={className}
      aria-label="Video preview"
      onMouseEnter={() => {
        void videoRef.current?.play().catch(() => {});
      }}
      onMouseLeave={() => {
        const el = videoRef.current;
        if (!el) {
          return;
        }
        el.pause();
        try {
          if (el.duration > 0 && !Number.isNaN(el.duration)) {
            el.currentTime = Math.min(0.04, el.duration * 0.002);
          } else {
            el.currentTime = 0;
          }
        } catch {
          el.currentTime = 0;
        }
      }}
      onLoadedMetadata={(e) => {
        const el = e.currentTarget;
        try {
          if (el.duration > 0 && !Number.isNaN(el.duration)) {
            el.currentTime = Math.min(0.04, el.duration * 0.002);
          }
        } catch {
          /* ignore seek errors */
        }
      }}
    />
  );
}

function readStockKeys(): { pexels: string | null; pixabay: string | null } {
  if (typeof window === 'undefined') {
    return { pexels: null, pixabay: null };
  }
  return {
    pexels: window.localStorage.getItem(PEXELS_KEY_STORAGE),
    pixabay: window.localStorage.getItem(PIXABAY_KEY_STORAGE),
  };
}

function localMatchRank(name: string, ql: string): number {
  const n = name.toLowerCase();
  if (n === ql) {
    return 4;
  }
  if (n.startsWith(ql)) {
    return 3;
  }
  return 2;
}

function matchesMediaFilter(asset: AssetRecord, filter: MediaKindFilter): boolean {
  if (filter === 'all') {
    return true;
  }
  if (filter === 'photo') {
    return asset.kind === 'image';
  }
  return asset.kind === 'video';
}

function filterLocalAssets(assets: AssetRecord[], q: string, filter: MediaKindFilter): AssetRecord[] {
  const ql = q.trim().toLowerCase();
  if (!ql) {
    return [];
  }
  return assets
    .filter((a) => a.name.toLowerCase().includes(ql) && matchesMediaFilter(a, filter))
    .sort((a, b) => localMatchRank(b.name, ql) - localMatchRank(a.name, ql))
    .slice(0, MAX_SEARCH_RESULTS);
}

interface Props {
  assets: AssetRecord[];
  assetUrls: Record<string, string>;
  referencedIds: Set<string>;
  onAddFiles: (files: FileList | null) => void;
  onRemoveAsset: (assetId: string) => void;
  onImportStockImage: (file: File) => void | Promise<void>;
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
  const [searchInput, setSearchInput] = useState('');
  const [debouncedQuery, setDebouncedQuery] = useState('');
  const [mediaFilter, setMediaFilter] = useState<MediaKindFilter>('all');
  const [keysTick, setKeysTick] = useState(0);
  const [apiDialogOpen, setApiDialogOpen] = useState(false);
  const [pexelsDraft, setPexelsDraft] = useState('');
  const [pixabayDraft, setPixabayDraft] = useState('');
  const [hasPexelsSaved, setHasPexelsSaved] = useState(false);
  const [hasPixabaySaved, setHasPixabaySaved] = useState(false);

  const [searchLoading, setSearchLoading] = useState(false);
  const [searchError, setSearchError] = useState<string | null>(null);
  const [localHits, setLocalHits] = useState<AssetRecord[]>([]);
  const [stockHits, setStockHits] = useState<StockSearchItem[]>([]);
  const [importingStockId, setImportingStockId] = useState<string | null>(null);

  useEffect(() => {
    const t = window.setTimeout(() => setDebouncedQuery(searchInput.trim()), 380);
    return () => window.clearTimeout(t);
  }, [searchInput]);

  useEffect(() => {
    if (!apiDialogOpen) {
      return;
    }
    const { pexels, pixabay } = readStockKeys();
    setHasPexelsSaved(Boolean(pexels));
    setHasPixabaySaved(Boolean(pixabay));
    setPexelsDraft('');
    setPixabayDraft('');
  }, [apiDialogOpen]);

  useEffect(() => {
    if (!debouncedQuery) {
      setSearchLoading(false);
      setSearchError(null);
      setLocalHits([]);
      setStockHits([]);
      return;
    }

    let cancelled = false;
    setSearchError(null);
    setLocalHits([]);
    setStockHits([]);
    setSearchLoading(true);

    const local = filterLocalAssets(assets, debouncedQuery, mediaFilter);
    const need = MAX_SEARCH_RESULTS - local.length;
    const { pexels: pexelsKey, pixabay: pixabayKey } = readStockKeys();

    if (need === 0) {
      setLocalHits(local);
      setStockHits([]);
      setSearchLoading(false);
      return;
    }

    if (need > 0 && !pexelsKey && !pixabayKey) {
      setLocalHits(local);
      setStockHits([]);
      setSearchLoading(false);
      return;
    }

    const buildSplitTasks = (
      slotNeed: number,
      mode: 'photo' | 'video',
    ): Promise<StockSearchItem[]>[] => {
      const tasks: Promise<StockSearchItem[]>[] = [];
      if (slotNeed <= 0 || (!pexelsKey && !pixabayKey)) {
        return tasks;
      }
      if (pexelsKey) {
        const n = pixabayKey ? Math.ceil(slotNeed / 2) : slotNeed;
        tasks.push(
          searchPexelsStock(pexelsKey, debouncedQuery, 1, Math.max(3, n), mode).then((r) => r.slice(0, n)),
        );
      }
      if (pixabayKey) {
        const n = pexelsKey ? Math.floor(slotNeed / 2) : slotNeed;
        tasks.push(
          searchPixabayStock(pixabayKey, debouncedQuery, 1, Math.max(3, n), mode).then((r) => r.slice(0, n)),
        );
      }
      return tasks;
    };

    (async () => {
      let stock: StockSearchItem[] = [];
      try {
        if (mediaFilter === 'photo') {
          const tasks = buildSplitTasks(need, 'photo');
          if (tasks.length > 0) {
            stock = (await Promise.all(tasks)).flat().slice(0, need);
          }
        } else if (mediaFilter === 'video') {
          const tasks = buildSplitTasks(need, 'video');
          if (tasks.length > 0) {
            stock = (await Promise.all(tasks)).flat().slice(0, need);
          }
        } else {
          const photoNeed = Math.ceil(need / 2);
          const videoNeed = Math.floor(need / 2);
          const photoTasks = buildSplitTasks(photoNeed, 'photo');
          const videoTasks = buildSplitTasks(videoNeed, 'video');
          const [photoStock, videoStock] = await Promise.all([
            photoTasks.length ? Promise.all(photoTasks).then((parts) => parts.flat()) : Promise.resolve([]),
            videoTasks.length ? Promise.all(videoTasks).then((parts) => parts.flat()) : Promise.resolve([]),
          ]);
          stock = [...photoStock, ...videoStock].slice(0, need);
        }
      } catch (e) {
        if (!cancelled) {
          setSearchError(e instanceof Error ? e.message : 'Stock search failed');
          setSearchLoading(false);
          setLocalHits(local);
          setStockHits([]);
        }
        return;
      }

      if (!cancelled) {
        setLocalHits(local);
        setStockHits(stock);
        setSearchLoading(false);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [debouncedQuery, assets, keysTick, mediaFilter]);

  const browseMode = !debouncedQuery;
  const totalHits = localHits.length + stockHits.length;

  const browseAssets = useMemo(() => {
    if (mediaFilter === 'all') {
      return assets;
    }
    return assets.filter((a) => matchesMediaFilter(a, mediaFilter));
  }, [assets, mediaFilter]);

  const handleFileChange = useCallback(
    (event: React.ChangeEvent<HTMLInputElement>) => {
      onAddFiles(event.target.files);
      event.target.value = '';
    },
    [onAddFiles],
  );

  const handleSaveApiKeys = useCallback(() => {
    if (pexelsDraft.trim()) {
      window.localStorage.setItem(PEXELS_KEY_STORAGE, pexelsDraft.trim());
    }
    if (pixabayDraft.trim()) {
      window.localStorage.setItem(PIXABAY_KEY_STORAGE, pixabayDraft.trim());
    }
    setPexelsDraft('');
    setPixabayDraft('');
    setKeysTick((k) => k + 1);
    setApiDialogOpen(false);
  }, [pexelsDraft, pixabayDraft]);

  const handleRemovePexelsKey = useCallback(() => {
    window.localStorage.removeItem(PEXELS_KEY_STORAGE);
    setHasPexelsSaved(false);
    setKeysTick((k) => k + 1);
  }, []);

  const handleRemovePixabayKey = useCallback(() => {
    window.localStorage.removeItem(PIXABAY_KEY_STORAGE);
    setHasPixabaySaved(false);
    setKeysTick((k) => k + 1);
  }, []);

  const handleImportStock = useCallback(
    async (item: StockSearchItem) => {
      if (!item.downloadUrl) {
        setSearchError('No download URL for this item.');
        return;
      }
      setImportingStockId(item.id);
      setSearchError(null);
      try {
        const blob = await fetchStockMediaBlob(item.downloadUrl);
        const isVideo = item.kind === 'video';
        const ext = isVideo
          ? blob.type.includes('webm')
            ? 'webm'
            : 'mp4'
          : blob.type.includes('png')
            ? 'png'
            : 'jpg';
        const safeName = `${item.source}-${item.id.replace(/[^a-zA-Z0-9_-]/g, '')}.${ext}`;
        const mime = blob.type || (isVideo ? 'video/mp4' : 'image/jpeg');
        const file = new File([blob], safeName, { type: mime });
        await Promise.resolve(onImportStockImage(file));
        setSearchInput('');
        setDebouncedQuery('');
      } catch (e) {
        setSearchError(e instanceof Error ? e.message : 'Import failed');
      } finally {
        setImportingStockId(null);
      }
    },
    [onImportStockImage],
  );

  const stockConfigured = useMemo(() => {
    if (typeof window === 'undefined') {
      return false;
    }
    const { pexels, pixabay } = readStockKeys();
    return Boolean(pexels || pixabay);
  }, [keysTick]);

  const renderAssetCard = (asset: AssetRecord) => {
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
            <Image src={url} alt={asset.name} fill unoptimized className="object-cover" />
          ) : null}
          {asset.kind === 'video' && url ? (
            <GalleryVideoPreview src={url} className="absolute inset-0 h-full w-full object-cover" />
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
              {inUse ? 'Used on the timeline — remove it there first.' : 'Remove from project'}
            </TooltipContent>
          </Tooltip>
        </div>
      </div>
    );
  };

  return (
    <aside className="flex h-full min-h-0 w-full min-w-0 flex-col overflow-hidden border-r border-zinc-800/80 bg-zinc-950/90">
      <div className="flex shrink-0 flex-col gap-2 border-b border-zinc-800/80 px-2 py-2">
        <div className="flex items-center justify-between gap-2">
          <p className="shrink-0 text-[11px] font-medium uppercase tracking-[0.24em] text-zinc-600">Media</p>
          <div className="flex items-center gap-1">
            <Tooltip>
              <TooltipTrigger asChild>
                <Button
                  type="button"
                  variant="ghost"
                  size="icon"
                  className="h-7 w-7 text-zinc-500 hover:text-zinc-200"
                  onClick={() => setApiDialogOpen(true)}
                  aria-label="Stock API keys"
                >
                  <KeyRound className="h-3.5 w-3.5" />
                </Button>
              </TooltipTrigger>
              <TooltipContent side="bottom" className="border-zinc-700 bg-zinc-800 text-zinc-200">
                {stockConfigured ? 'Stock search keys (saved)' : 'Add Pexels / Pixabay keys for stock search'}
              </TooltipContent>
            </Tooltip>
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
        <div className="relative">
          <Search className="pointer-events-none absolute left-2 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-zinc-500" />
          <Input
            value={searchInput}
            onChange={(e) => setSearchInput(e.target.value)}
            placeholder="Search library & stock…"
            className="h-8 border-zinc-700 bg-zinc-900/80 pl-8 pr-2 text-xs text-zinc-100 placeholder:text-zinc-600"
            aria-label="Search media library and stock"
          />
        </div>
        <div className="flex gap-1" role="group" aria-label="Filter by media type">
          {(
            [
              { id: 'all' as const, label: 'All' },
              { id: 'photo' as const, label: 'Photos' },
              { id: 'video' as const, label: 'Videos' },
            ] as const
          ).map(({ id, label }) => (
            <Button
              key={id}
              type="button"
              variant={mediaFilter === id ? 'secondary' : 'ghost'}
              size="sm"
              className="h-7 min-w-0 flex-1 px-1.5 text-[10px] font-medium"
              onClick={() => setMediaFilter(id)}
            >
              {label}
            </Button>
          ))}
        </div>
      </div>

      <Dialog open={apiDialogOpen} onOpenChange={setApiDialogOpen}>
        <DialogContent className="border-zinc-700 bg-zinc-950 sm:max-w-md">
          <DialogHeader>
            <DialogTitle className="text-zinc-100">Stock media (Pexels & Pixabay)</DialogTitle>
            <DialogDescription className="text-zinc-500">
              Optional keys for Pexels and Pixabay. They are stored only in this browser. Paste a new key to replace an
              existing one; saved keys are never shown again after you close this dialog.
            </DialogDescription>
          </DialogHeader>
          <div className="grid gap-4 py-2">
            <div className="space-y-2">
              <div className="flex items-center justify-between gap-2">
                <Label className="text-zinc-400">Pexels</Label>
                {hasPexelsSaved ? (
                  <Button type="button" variant="ghost" size="sm" className="h-7 text-[11px] text-rose-400" onClick={handleRemovePexelsKey}>
                    Remove saved key
                  </Button>
                ) : null}
              </div>
              <p className="text-[11px] leading-relaxed text-zinc-500">
                Get a free API key:{' '}
                <a
                  href={PEXELS_GET_API_KEY_URL}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="font-medium text-emerald-500/95 underline underline-offset-2 hover:text-emerald-400"
                >
                  {PEXELS_GET_API_KEY_URL}
                </a>
              </p>
              <Input
                type="password"
                autoComplete="off"
                placeholder={hasPexelsSaved ? 'Paste only to replace saved key' : 'Paste API key once'}
                value={pexelsDraft}
                onChange={(e) => setPexelsDraft(e.target.value)}
                className="border-zinc-700 bg-zinc-900/80 font-mono text-xs text-zinc-100"
              />
              {hasPexelsSaved ? (
                <p className="text-[10px] text-emerald-600/90">Pexels key is saved on this device.</p>
              ) : null}
            </div>
            <div className="space-y-2">
              <div className="flex items-center justify-between gap-2">
                <Label className="text-zinc-400">Pixabay</Label>
                {hasPixabaySaved ? (
                  <Button type="button" variant="ghost" size="sm" className="h-7 text-[11px] text-rose-400" onClick={handleRemovePixabayKey}>
                    Remove saved key
                  </Button>
                ) : null}
              </div>
              <div className="space-y-1 text-[11px] leading-relaxed text-zinc-500">
                <p>
                  Docs:{' '}
                  <a
                    href={PIXABAY_API_DOCS_URL}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="font-medium text-emerald-500/95 underline underline-offset-2 hover:text-emerald-400"
                  >
                    {PIXABAY_API_DOCS_URL}
                  </a>
                </p>
                <p>
                  API key in account (after login):{' '}
                  <a
                    href={PIXABAY_ACCOUNT_URL}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="font-medium text-emerald-500/95 underline underline-offset-2 hover:text-emerald-400"
                  >
                    {PIXABAY_ACCOUNT_URL}
                  </a>
                </p>
              </div>
              <Input
                type="password"
                autoComplete="off"
                placeholder={hasPixabaySaved ? 'Paste only to replace saved key' : 'Paste API key once'}
                value={pixabayDraft}
                onChange={(e) => setPixabayDraft(e.target.value)}
                className="border-zinc-700 bg-zinc-900/80 font-mono text-xs text-zinc-100"
              />
              {hasPixabaySaved ? (
                <p className="text-[10px] text-emerald-600/90">Pixabay key is saved on this device.</p>
              ) : null}
            </div>
          </div>
          <DialogFooter className="gap-2 sm:gap-0">
            <Button type="button" variant="secondary" onClick={() => setApiDialogOpen(false)}>
              Cancel
            </Button>
            <Button type="button" onClick={handleSaveApiKeys}>
              Save
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <div className="panel-scrollbar grid min-h-0 flex-1 auto-rows-min grid-cols-2 gap-2 overflow-y-auto p-2">
        {browseMode ? (
          assets.length === 0 ? (
            <p className="col-span-2 px-1 py-4 text-center text-xs text-zinc-500">
              No files yet. Add images, video, or audio — they stay here until you use them on the timeline.
            </p>
          ) : browseAssets.length === 0 ? (
            <p className="col-span-2 px-1 py-4 text-center text-xs text-zinc-500">
              {mediaFilter === 'photo'
                ? 'No photos in the library. Change the filter or add images.'
                : mediaFilter === 'video'
                  ? 'No videos in the library. Change the filter or add video files.'
                  : 'Nothing matches this filter.'}
            </p>
          ) : (
            browseAssets.map((asset) => renderAssetCard(asset))
          )
        ) : searchLoading && totalHits === 0 ? (
          <p className="col-span-2 flex items-center justify-center gap-2 py-10 text-xs text-zinc-500">
            <Loader2 className="h-4 w-4 animate-spin" /> Searching…
          </p>
        ) : (
          <>
            {searchError ? (
              <p className="col-span-2 text-center text-[11px] text-rose-400">{searchError}</p>
            ) : null}
            {!searchLoading && totalHits === 0 && !searchError ? (
              <p className="col-span-2 py-8 text-center text-xs text-zinc-500">No matches. Try another term.</p>
            ) : null}
            {localHits.map((asset) => renderAssetCard(asset))}
            {stockHits.map((item) => (
              <div
                key={item.id}
                className="flex flex-col overflow-hidden rounded-lg border border-zinc-800/80 bg-zinc-900/40"
              >
                <div className="relative aspect-video w-full bg-black">
                  {item.kind === 'video' && item.downloadUrl ? (
                    <GalleryVideoPreview
                      src={item.downloadUrl}
                      poster={item.previewUrl || null}
                      className="absolute inset-0 h-full w-full object-cover"
                    />
                  ) : item.previewUrl ? (
                    // eslint-disable-next-line @next/next/no-img-element -- remote stock thumbnails
                    <img src={item.previewUrl} alt="" className="absolute inset-0 h-full w-full object-cover" />
                  ) : null}
                  <span className="pointer-events-none absolute right-1 top-1 rounded bg-zinc-950/90 px-1.5 py-0.5 text-[9px] font-medium uppercase text-zinc-300">
                    {item.source} · {item.kind}
                  </span>
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
                    disabled={importingStockId !== null}
                    onClick={() => void handleImportStock(item)}
                  >
                    {importingStockId === item.id ? (
                      <Loader2 className="h-3 w-3 animate-spin" />
                    ) : (
                      'Add to library'
                    )}
                  </Button>
                </div>
              </div>
            ))}
          </>
        )}
      </div>
    </aside>
  );
}

export default React.memo(MediaGalleryPanel);
