'use client';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import TopBar from '@/components/TopBar';
import Sidebar from '@/components/Sidebar';
import SubtitleAlignmentModal from '@/components/SubtitleAlignmentModal';
import VideoPreview from '@/components/VideoPreview';
import MediaGalleryPanel from '@/components/MediaGalleryPanel';
import Timeline from '@/components/Timeline';
import PropertiesPanel from '@/components/PropertiesPanel';
import { ResizableHandle, ResizablePanel, ResizablePanelGroup } from '@/components/ui/resizable';
import { AssetRecord, BackgroundSegment, Clip, MusicClip, SubtitleAlignmentInput, SubtitleCue } from '@/lib/types';
import {
  ACTIVE_PROJECT_ID,
  MIN_CLIP_DURATION,
  MUSIC_TRACK_ID,
  SUBTITLE_TRACK_ID,
  TIMELINE_TRACKS,
  addLibraryMediaToProject,
  applySubtitleAlignmentResult,
  BACKGROUND_TRACK_ID,
  appendSubtitleCue,
  buildTimelineClips,
  createDefaultBackgroundSegment,
  createDefaultProject,
  createId,
  deleteTimelineClipFromProject,
  getReferencedAssetIds,
  getRetainedAssetIds,
  normalizeTrackAfterDrag,
  removeLibraryAsset,
  parseProjectDocument,
  replaceMusicClip,
  sanitizeProjectAgainstMissingAssets,
  startSubtitleAlignment,
  storeSubtitleAlignmentError,
  storeSubtitleAlignmentResult,
  updateTimelineClipInProject,
  upsertBackgroundSegment,
} from '@/lib/project';
import {
  deletePersistedAssets,
  loadPersistedAssetBlobs,
  loadPersistedProject,
  persistAssetBlob,
  persistProject,
} from '@/lib/project-storage';
import {
  estimateBpmFromAudioUrl,
  extractWaveformPeaks,
  getAudioDuration,
  getImageMetadata,
  getVideoMetadata,
  waitForAudioMetadata,
  waitForAudioReady,
} from '@/lib/media-utils';
import { alignSubtitles } from '@/lib/lyric-sync';
import { createRenderManifest, sanitizeOutputName, type RenderManifest } from '@/lib/render';

type AssetBlobMap = Record<string, Blob>;
type SaveState = 'loading' | 'saving' | 'saved' | 'error';
type RenderState = 'idle' | 'rendering' | 'success' | 'error';
type RenderStatusResponse = {
  jobId: string;
  state: 'queued' | 'staging' | 'bundling' | 'rendering' | 'completed' | 'error';
  progress: number;
  message: string;
  errorMessage: string | null;
  downloadUrl: string | null;
};
type ActiveRenderJob = {
  statusUrl: string;
  downloadUrl: string;
  fileName: string;
};

const AUDIO_TRACK_ID = 'a1';
const TEXT_TRACK_ID = 't1';

const clamp = (value: number, min: number, max: number) => Math.min(Math.max(value, min), max);

const sortClipsByStart = (clips: Clip[]) => [...clips].sort((left, right) => left.start - right.start);

const getClipSourceDuration = (clip: Clip) => clip.sourceDuration ?? clip.duration;

const getClipTrimStart = (clip: Clip) => clip.trimStart ?? 0;

const getClipTrimEnd = (clip: Clip) => Math.min(getClipTrimStart(clip) + clip.duration, getClipSourceDuration(clip));

const findClipAtTime = (clips: Clip[], time: number) => clips.find(
  (clip) => time >= clip.start && time < clip.start + clip.duration,
) ?? null;

const getTrackMaxEnd = <T extends { start: number; duration: number }>(items: T[]) => items.reduce(
  (max, item) => Math.max(max, item.start + item.duration),
  0,
);

const nowIso = () => new Date().toISOString();
const sleep = (ms: number) => new Promise((resolve) => window.setTimeout(resolve, ms));
const ACTIVE_RENDER_JOB_STORAGE_KEY = 'active-render-job';
const RENDER_STATUS_POLL_MS = 1200;

const downloadBlob = (blob: Blob, fileName: string) => {
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement('a');
  anchor.href = url;
  anchor.download = fileName;
  anchor.click();
  URL.revokeObjectURL(url);
};

const storeActiveRenderJob = (job: ActiveRenderJob | null) => {
  if (typeof window === 'undefined') {
    return;
  }

  if (!job) {
    window.sessionStorage.removeItem(ACTIVE_RENDER_JOB_STORAGE_KEY);
    return;
  }

  window.sessionStorage.setItem(ACTIVE_RENDER_JOB_STORAGE_KEY, JSON.stringify(job));
};

const loadActiveRenderJob = (): ActiveRenderJob | null => {
  if (typeof window === 'undefined') {
    return null;
  }

  const raw = window.sessionStorage.getItem(ACTIVE_RENDER_JOB_STORAGE_KEY);
  if (!raw) {
    return null;
  }

  try {
    return JSON.parse(raw) as ActiveRenderJob;
  } catch {
    window.sessionStorage.removeItem(ACTIVE_RENDER_JOB_STORAGE_KEY);
    return null;
  }
};

const createUploadedAssetRecord = (
  assetId: string,
  file: File,
  overrides: Partial<AssetRecord>,
): AssetRecord => {
  const timestamp = nowIso();

  return {
    id: assetId,
    kind: overrides.kind ?? 'image',
    name: file.name,
    mimeType: file.type || 'application/octet-stream',
    size: file.size,
    createdAt: timestamp,
    updatedAt: timestamp,
    source: 'upload',
    ...overrides,
  };
};

export default function Editor() {
  const [project, setProject] = useState(createDefaultProject);
  const [assetBlobs, setAssetBlobs] = useState<AssetBlobMap>({});
  const [assetUrls, setAssetUrls] = useState<Record<string, string>>({});
  const [selectedClipId, setSelectedClipId] = useState<string | null>(null);
  const [currentTime, setCurrentTime] = useState(0);
  const [isPlaying, setIsPlaying] = useState(false);
  const [isSubtitleAlignmentOpen, setIsSubtitleAlignmentOpen] = useState(false);
  const [saveState, setSaveState] = useState<SaveState>('loading');
  const [renderState, setRenderState] = useState<RenderState>('idle');
  const [renderProgress, setRenderProgress] = useState(0);
  const [renderMessage, setRenderMessage] = useState<string | null>(null);
  const [hasHydratedProject, setHasHydratedProject] = useState(false);
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const animationFrameRef = useRef<number | null>(null);
  const objectUrlsRef = useRef<Record<string, string>>({});
  const previousBlobMapRef = useRef<AssetBlobMap>({});
  const projectRef = useRef(project);
  const assetBlobsRef = useRef(assetBlobs);
  const persistedAssetIdsRef = useRef<Set<string>>(new Set());
  const autoSaveInitializedRef = useRef(false);
  const subtitleAlignmentRequestIdRef = useRef(0);

  useEffect(() => {
    projectRef.current = project;
  }, [project]);

  useEffect(() => {
    assetBlobsRef.current = assetBlobs;
  }, [assetBlobs]);

  const timelineClips = useMemo(
    () => buildTimelineClips(project, assetUrls),
    [assetUrls, project],
  );
  const selectedClip = useMemo(
    () => timelineClips.find((clip) => clip.id === selectedClipId) || null,
    [selectedClipId, timelineClips],
  );
  const musicClip = useMemo(
    () => timelineClips.find((clip) => clip.trackId === AUDIO_TRACK_ID) || null,
    [timelineClips],
  );
  const sortedTextClips = useMemo(
    () => sortClipsByStart(timelineClips.filter((clip) => clip.trackId === TEXT_TRACK_ID)),
    [timelineClips],
  );
  const activeTextClip = useMemo(
    () => findClipAtTime(sortedTextClips, currentTime),
    [currentTime, sortedTextClips],
  );
  const subtitleText = useMemo(
    () => activeTextClip?.overlayText ?? '',
    [activeTextClip],
  );
  const subtitleSnapTimes = useMemo(
    () => project.subtitles.cues.map((cue) => cue.start),
    [project.subtitles.cues],
  );
  const subtitleAlignmentInput = useMemo<SubtitleAlignmentInput>(() => {
    if (project.lyricSync.subtitleAlignment.input) {
      return project.lyricSync.subtitleAlignment.input;
    }

    const excerptEnd = Math.max(
      MIN_CLIP_DURATION,
      musicClip?.duration ?? project.background.segments[0]?.duration ?? 12,
    );

    return {
      language: 'en',
      excerptStart: 0,
      excerptEnd,
      sourceText: project.subtitles.sourceText,
    };
  }, [musicClip?.duration, project.background.segments, project.lyricSync.subtitleAlignment.input, project.subtitles.sourceText]);
  const subtitleAlignmentModalKey = useMemo(
    () => [
      project.lyricSync.subtitleAlignment.status,
      project.lyricSync.subtitleAlignment.result?.generatedAt ?? 'no-result',
    ].join(':'),
    [
      project.lyricSync.subtitleAlignment.result?.generatedAt,
      project.lyricSync.subtitleAlignment.status,
    ],
  );
  const exportDisabled = useMemo(() => {
    const musicAssetId = project.music.clip?.assetId;
    return renderState === 'rendering' || !musicAssetId || !assetBlobs[musicAssetId];
  }, [assetBlobs, project.music.clip?.assetId, renderState]);
  const renderPreviewManifest = useMemo<RenderManifest | null>(() => {
    try {
      return createRenderManifest(project, assetUrls);
    } catch {
      return null;
    }
  }, [assetUrls, project]);

  const referencedAssetIdsForGallery = useMemo(() => getReferencedAssetIds(project), [project]);
  const galleryAssets = useMemo(() => {
    const ids = new Set<string>([...referencedAssetIdsForGallery, ...project.mediaLibraryAssetIds]);
    return [...ids]
      .map((id) => project.assets[id])
      .filter((a): a is AssetRecord => Boolean(a))
      .sort((a, b) => a.name.localeCompare(b.name));
  }, [project, referencedAssetIdsForGallery]);

  const persistNow = useCallback(async (nextProject: typeof project, nextAssetBlobs: AssetBlobMap) => {
    try {
      setSaveState('saving');

      const retainedAssetIds = getRetainedAssetIds(nextProject);
      const nextBlobAssetIds = Object.keys(nextAssetBlobs).filter((assetId) => retainedAssetIds.has(assetId));

      await persistProject(nextProject);
      await Promise.all(nextBlobAssetIds.map((assetId) => persistAssetBlob(assetId, nextAssetBlobs[assetId])));

      const removedAssetIds = [...persistedAssetIdsRef.current].filter((assetId) => !nextBlobAssetIds.includes(assetId));
      await deletePersistedAssets(removedAssetIds);

      persistedAssetIdsRef.current = new Set(nextBlobAssetIds);
      setSaveState('saved');
    } catch {
      setSaveState('error');
    }
  }, []);

  const syncAudioTime = useCallback(async (time: number) => {
    const audio = audioRef.current;
    const clip = musicClip;
    if (!audio || !clip?.assetUrl) {
      return;
    }

    const nextOffset = clamp(time - clip.start, 0, Math.max(clip.duration - 0.05, 0));
    if (audio.src !== clip.assetUrl) {
      audio.src = clip.assetUrl;
      audio.load();
    }

    await waitForAudioMetadata(audio);
    await waitForAudioReady(audio);
    audio.currentTime = Math.min(
      getClipTrimStart(clip) + nextOffset,
      Math.max(audio.duration - 0.05, 0),
    );
  }, [musicClip]);

  const stopPlayback = useCallback((resetToStart = true) => {
    const audio = audioRef.current;
    if (animationFrameRef.current !== null) {
      cancelAnimationFrame(animationFrameRef.current);
      animationFrameRef.current = null;
    }

    if (audio) {
      audio.pause();
      if (resetToStart) {
        audio.currentTime = 0;
      }
    }

    setIsPlaying(false);
    if (resetToStart) {
      setCurrentTime(0);
    }
  }, []);

  const handleSave = useCallback(() => {
    void persistNow(projectRef.current, assetBlobsRef.current);
  }, [persistNow]);

  const pollRenderJob = useCallback(async (job: ActiveRenderJob) => {
    setRenderState('rendering');
    setRenderProgress((current) => Math.max(current, 0.05));
    setRenderMessage('Waiting for render worker...');

    while (true) {
      await sleep(RENDER_STATUS_POLL_MS);
      const statusResponse = await fetch(job.statusUrl, { cache: 'no-store' });
      if (!statusResponse.ok) {
        storeActiveRenderJob(null);
        throw new Error('Lost connection to render job status.');
      }

      const status = await statusResponse.json() as RenderStatusResponse;
      setRenderProgress(status.progress);
      setRenderMessage(status.message);

      if (status.state === 'error') {
        storeActiveRenderJob(null);
        throw new Error(status.errorMessage ?? status.message ?? 'Render failed.');
      }

      if (status.state === 'completed' && status.downloadUrl) {
        const downloadResponse = await fetch(status.downloadUrl, { cache: 'no-store' });
        if (!downloadResponse.ok) {
          storeActiveRenderJob(null);
          throw new Error('Render finished, but the download could not be retrieved.');
        }

        const videoBlob = await downloadResponse.blob();
        downloadBlob(videoBlob, job.fileName);
        setRenderState('success');
        setRenderProgress(1);
        setRenderMessage(`Downloaded ${job.fileName}.`);
        storeActiveRenderJob(null);
        return;
      }
    }
  }, []);

  const handleNewProject = useCallback(() => {
    if (!window.confirm('Start a new project? The current timeline will be cleared and replaced with a blank project.')) {
      return;
    }

    stopPlayback();
    subtitleAlignmentRequestIdRef.current += 1;
    const nextProject = createDefaultProject();
    setProject(nextProject);
    setAssetBlobs({});
    setSelectedClipId(null);
    setCurrentTime(0);
    setIsSubtitleAlignmentOpen(false);
    setRenderState('idle');
    setRenderProgress(0);
    setRenderMessage(null);
    storeActiveRenderJob(null);
    void persistNow(nextProject, {});
  }, [persistNow, stopPlayback]);

  const handleExport = useCallback(async () => {
    if (renderState === 'rendering') {
      return;
    }

    const currentProject = projectRef.current;
    const musicAssetId = currentProject.music.clip?.assetId;
    if (!musicAssetId) {
      setRenderState('error');
      setRenderMessage('Upload music before rendering.');
      return;
    }

    try {
      setRenderState('rendering');
      setRenderProgress(0.05);
      setRenderMessage('Preparing render request...');

      const formData = new FormData();
      formData.append('project', JSON.stringify(currentProject));

      for (const assetId of getReferencedAssetIds(currentProject)) {
        const assetBlob = assetBlobsRef.current[assetId];
        const asset = currentProject.assets[assetId];

        if (!assetBlob || !asset) {
          throw new Error(`Missing local asset data for "${assetId}".`);
        }

        const file = assetBlob instanceof File
          ? assetBlob
          : new File([assetBlob], asset.name, {
            type: asset.mimeType || assetBlob.type || 'application/octet-stream',
          });

        formData.append(`asset:${assetId}`, file, asset.name);
      }

      const startResponse = await fetch('/api/render', {
        method: 'POST',
        body: formData,
      });

      if (!startResponse.ok) {
        const contentType = startResponse.headers.get('content-type') ?? '';
        const responseBody = contentType.includes('application/json')
          ? await startResponse.json()
          : await startResponse.text();
        const errorMessage = typeof responseBody === 'object'
          && responseBody !== null
          && 'detail' in responseBody
          ? String((responseBody as { detail: unknown }).detail)
          : 'Render failed.';

        throw new Error(errorMessage);
      }

      const {
        statusUrl,
        downloadUrl,
      } = await startResponse.json() as {
        jobId: string;
        statusUrl: string;
        downloadUrl: string;
      };

      const fileName = `${sanitizeOutputName(currentProject.name)}.mp4`;
      const activeJob: ActiveRenderJob = { statusUrl, downloadUrl, fileName };
      storeActiveRenderJob(activeJob);
      await pollRenderJob(activeJob);
    } catch (error) {
      setRenderState('error');
      setRenderProgress(0);
      setRenderMessage(error instanceof Error ? error.message : 'Render failed.');
      storeActiveRenderJob(null);
    }
  }, [pollRenderJob, renderState]);

  const handleOpenSubtitleAlignment = useCallback(() => {
    setIsSubtitleAlignmentOpen(true);
  }, []);

  const handleCloseSubtitleAlignment = useCallback(() => {
    if (projectRef.current.lyricSync.subtitleAlignment.status === 'running') {
      return;
    }

    setIsSubtitleAlignmentOpen(false);
  }, []);

  const handleRunSubtitleAlignment = useCallback(async (input: SubtitleAlignmentInput) => {
    const requestId = subtitleAlignmentRequestIdRef.current + 1;
    subtitleAlignmentRequestIdRef.current = requestId;
    setProject((currentProject) => startSubtitleAlignment(currentProject, input));

    try {
      if (!musicClip?.assetUrl) {
        throw new Error('Upload music before running alignment.');
      }

      const audioResponse = await fetch(musicClip.assetUrl);
      const audioBlob = await audioResponse.blob();
      const result = await alignSubtitles(input, audioBlob);

      if (subtitleAlignmentRequestIdRef.current !== requestId) {
        return;
      }

      setProject((currentProject) => storeSubtitleAlignmentResult(currentProject, input, result));
    } catch (error) {
      if (subtitleAlignmentRequestIdRef.current !== requestId) {
        return;
      }

      const errorMessage = error instanceof Error ? error.message : 'Subtitle alignment failed.';
      setProject((currentProject) => storeSubtitleAlignmentError(currentProject, input, errorMessage));
    }
  }, [musicClip?.assetUrl]);

  const handleApplySubtitleAlignment = useCallback((cues: SubtitleCue[]) => {
    setProject((currentProject) => applySubtitleAlignmentResult(currentProject, cues));
    setSelectedClipId(cues[0]?.id ?? null);
    setIsSubtitleAlignmentOpen(false);
  }, []);

  const handleAddSubtitleCue = useCallback(() => {
    const subtitleCue: SubtitleCue = {
      id: createId(),
      start: getTrackMaxEnd(projectRef.current.subtitles.cues),
      duration: 6,
      text: 'New subtitle',
      words: [],
    };

    setProject((currentProject) => appendSubtitleCue(currentProject, subtitleCue));
    setSelectedClipId(subtitleCue.id);
  }, []);

  const handleAddBackgroundPlaceholder = useCallback(() => {
    const currentProject = projectRef.current;
    const hasSinglePlaceholder = currentProject.background.segments.length === 1
      && !currentProject.background.segments[0]?.assetId
      && currentProject.background.segments[0]?.visualType === 'gradient';

    if (hasSinglePlaceholder) {
      setSelectedClipId(currentProject.background.segments[0].id);
      return;
    }

    const segment: BackgroundSegment = {
      ...createDefaultBackgroundSegment(),
      name: `AI Background ${currentProject.background.segments.length + 1}`,
      start: getTrackMaxEnd(currentProject.background.segments),
    };

    setProject((nextProject) => upsertBackgroundSegment(nextProject, segment));
    setSelectedClipId(segment.id);
  }, []);

  const handleUploadMusic = useCallback(async (file: File) => {
    const previousMusicAssetId = projectRef.current.music.clip?.assetId ?? null;
    const temporaryUrl = URL.createObjectURL(file);

    try {
      const [duration, waveform, bpm] = await Promise.all([
        getAudioDuration(temporaryUrl),
        extractWaveformPeaks(temporaryUrl),
        estimateBpmFromAudioUrl(temporaryUrl),
      ]);
      const safeDuration = Math.max(duration, MIN_CLIP_DURATION);
      const assetId = createId();
      const clipId = createId();
      const asset = createUploadedAssetRecord(assetId, file, {
        kind: 'audio',
        mimeType: file.type || 'audio/mpeg',
        duration: safeDuration,
      });
      const clip: MusicClip = {
        id: clipId,
        assetId,
        name: file.name,
        color: '#22c55e',
        start: 0,
        duration: safeDuration,
        sourceDuration: safeDuration,
        trimStart: 0,
        waveform,
        bpm: bpm ?? null,
      };

      stopPlayback();
      setProject((currentProject) => replaceMusicClip(currentProject, clip, asset));
      setAssetBlobs((currentBlobs) => {
        const nextBlobs = {
          ...currentBlobs,
          [assetId]: file,
        };

        if (previousMusicAssetId) {
          delete nextBlobs[previousMusicAssetId];
        }

        return nextBlobs;
      });
      setSelectedClipId(clipId);
      setCurrentTime(0);
    } finally {
      URL.revokeObjectURL(temporaryUrl);
    }
  }, [stopPlayback]);

  const handleUploadBackgroundMedia = useCallback(async (file: File) => {
    const isVideo = file.type.startsWith('video/');
    const temporaryUrl = URL.createObjectURL(file);

    try {
      const metadata = isVideo
        ? await getVideoMetadata(temporaryUrl)
        : await getImageMetadata(temporaryUrl);
      const currentProject = projectRef.current;
      const hasSinglePlaceholder = currentProject.background.segments.length === 1
        && !currentProject.background.segments[0]?.assetId
        && currentProject.background.segments[0]?.visualType === 'gradient';
      const assetId = createId();
      const segmentId = createId();
      const safeSourceDuration = isVideo
        ? Math.max((metadata as { duration: number; width: number; height: number }).duration, MIN_CLIP_DURATION)
        : undefined;
      const segment: BackgroundSegment = {
        id: segmentId,
        assetId,
        name: file.name,
        color: isVideo ? '#38bdf8' : '#fb7185',
        start: hasSinglePlaceholder ? 0 : getTrackMaxEnd(currentProject.background.segments),
        duration: isVideo
          ? safeSourceDuration ?? 12
          : Math.max(currentProject.music.clip?.duration ?? currentProject.background.segments[0]?.duration ?? 12, MIN_CLIP_DURATION),
        sourceDuration: safeSourceDuration,
        trimStart: isVideo ? 0 : undefined,
        visualType: isVideo ? 'video' : 'image',
        transition: { kind: 'none', duration: 0 },
        motion: { mode: 'beat-pulse', strength: 0.2 },
      };
      const asset = createUploadedAssetRecord(assetId, file, {
        kind: isVideo ? 'video' : 'image',
        mimeType: file.type || (isVideo ? 'video/mp4' : 'image/jpeg'),
        duration: safeSourceDuration,
        width: metadata.width,
        height: metadata.height,
      });

      setProject((nextProject) => upsertBackgroundSegment(nextProject, segment, asset, { replacePlaceholder: hasSinglePlaceholder }));
      setAssetBlobs((currentBlobs) => ({
        ...currentBlobs,
        [assetId]: file,
      }));
      setSelectedClipId(segmentId);
    } finally {
      URL.revokeObjectURL(temporaryUrl);
    }
  }, []);

  const handleAddMediaLibraryFiles = useCallback(async (files: FileList | null) => {
    if (!files?.length) {
      return;
    }

    const entries: AssetRecord[] = [];
    const newBlobs: AssetBlobMap = {};

    for (const file of Array.from(files)) {
      const isVideo = file.type.startsWith('video/');
      const isAudio = file.type.startsWith('audio/');
      const isImage = file.type.startsWith('image/');
      if (!isVideo && !isAudio && !isImage) {
        continue;
      }

      const temporaryUrl = URL.createObjectURL(file);

      try {
        const assetId = createId();
        let overrides: Partial<AssetRecord> = {
          kind: isVideo ? 'video' : isAudio ? 'audio' : 'image',
        };

        if (isVideo) {
          const metadata = await getVideoMetadata(temporaryUrl);
          overrides = {
            ...overrides,
            duration: Math.max(metadata.duration, MIN_CLIP_DURATION),
            width: metadata.width,
            height: metadata.height,
          };
        } else if (isImage) {
          const metadata = await getImageMetadata(temporaryUrl);
          overrides = { ...overrides, width: metadata.width, height: metadata.height };
        } else {
          const duration = await getAudioDuration(temporaryUrl);
          overrides = { ...overrides, duration: Math.max(duration, MIN_CLIP_DURATION) };
        }

        const asset = createUploadedAssetRecord(assetId, file, overrides);
        entries.push(asset);
        newBlobs[assetId] = file;
      } finally {
        URL.revokeObjectURL(temporaryUrl);
      }
    }

    if (entries.length === 0) {
      return;
    }

    setProject((current) => addLibraryMediaToProject(current, entries.map((asset) => ({ asset }))));
    setAssetBlobs((previous) => ({ ...previous, ...newBlobs }));
  }, []);

  const handleRemoveMediaLibraryAsset = useCallback((assetId: string) => {
    setProject((current) => {
      const result = removeLibraryAsset(current, assetId);
      if ('error' in result) {
        return current;
      }

      return result.project;
    });
    setAssetBlobs((previous) => {
      if (!previous[assetId]) {
        return previous;
      }

      const next = { ...previous };
      delete next[assetId];
      return next;
    });
  }, []);

  const handleDropMediaOnTimeline = useCallback(async (payload: { trackId: string; timeSec: number; assetId: string }) => {
    const { trackId, timeSec, assetId } = payload;
    const currentProject = projectRef.current;
    const asset = currentProject.assets[assetId];
    const blob = assetBlobsRef.current[assetId];
    if (!asset || !blob) {
      return;
    }

    if (trackId === SUBTITLE_TRACK_ID) {
      return;
    }

    if (trackId === MUSIC_TRACK_ID) {
      if (asset.kind !== 'audio') {
        return;
      }

      const url = URL.createObjectURL(blob);

      try {
        const [duration, waveform, bpm] = await Promise.all([
          getAudioDuration(url),
          extractWaveformPeaks(url),
          estimateBpmFromAudioUrl(url),
        ]);
        const safeDuration = Math.max(duration, MIN_CLIP_DURATION);
        const previousMusicAssetId = currentProject.music.clip?.assetId ?? null;
        const clipId = createId();
        const clip: MusicClip = {
          id: clipId,
          assetId,
          name: asset.name,
          color: '#22c55e',
          start: 0,
          duration: safeDuration,
          sourceDuration: asset.duration ?? safeDuration,
          trimStart: 0,
          waveform,
          bpm: bpm ?? null,
        };

        stopPlayback();
        setProject((nextProject) => replaceMusicClip(nextProject, clip, asset));
        setAssetBlobs((currentBlobs) => {
          const next = { ...currentBlobs };
          if (previousMusicAssetId && previousMusicAssetId !== assetId) {
            delete next[previousMusicAssetId];
          }

          return next;
        });
        setSelectedClipId(clipId);
        setCurrentTime(0);
      } finally {
        URL.revokeObjectURL(url);
      }

      return;
    }

    if (trackId === BACKGROUND_TRACK_ID) {
      if (asset.kind !== 'image' && asset.kind !== 'video') {
        return;
      }

      const isVideo = asset.kind === 'video';
      const safeStart = Math.max(0, timeSec);
      const hasSinglePlaceholder = currentProject.background.segments.length === 1
        && !currentProject.background.segments[0]?.assetId
        && currentProject.background.segments[0]?.visualType === 'gradient';
      const safeSourceDuration = isVideo
        ? Math.max(asset.duration ?? MIN_CLIP_DURATION, MIN_CLIP_DURATION)
        : undefined;
      const segmentId = createId();
      const segment: BackgroundSegment = {
        id: segmentId,
        assetId,
        name: asset.name,
        color: isVideo ? '#38bdf8' : '#fb7185',
        start: safeStart,
        duration: isVideo
          ? safeSourceDuration ?? 12
          : Math.max(currentProject.music.clip?.duration ?? currentProject.background.segments[0]?.duration ?? 12, MIN_CLIP_DURATION),
        sourceDuration: safeSourceDuration,
        trimStart: isVideo ? 0 : undefined,
        visualType: isVideo ? 'video' : 'image',
        transition: { kind: 'none', duration: 0 },
        motion: { mode: 'beat-pulse', strength: 0.2 },
      };

      setProject((nextProject) => upsertBackgroundSegment(nextProject, segment, asset, { replacePlaceholder: hasSinglePlaceholder }));
      setSelectedClipId(segmentId);
    }
  }, [stopPlayback]);

  const handleUpdateClip = useCallback((id: string, updates: Partial<Clip>) => {
    setProject((currentProject) => updateTimelineClipInProject(currentProject, id, updates));
  }, []);

  const handleDragEnd = useCallback((clipId: string) => {
    setProject((currentProject) => normalizeTrackAfterDrag(currentProject, clipId));
  }, []);

  const handleDeleteClip = useCallback((id: string) => {
    const clipToDelete = timelineClips.find((clip) => clip.id === id);
    if (!clipToDelete) {
      return;
    }

    if (clipToDelete.trackId === AUDIO_TRACK_ID) {
      stopPlayback();
      setCurrentTime(0);
    }

    setProject((currentProject) => deleteTimelineClipFromProject(currentProject, id));
    if (clipToDelete.assetId) {
      setAssetBlobs((currentBlobs) => {
        const nextBlobs = { ...currentBlobs };
        delete nextBlobs[clipToDelete.assetId!];
        return nextBlobs;
      });
    }

    if (selectedClipId === id) {
      setSelectedClipId(null);
    }
  }, [selectedClipId, stopPlayback, timelineClips]);

  const handleTimeChange = useCallback((time: number) => {
    const nextTime = Math.max(0, time);
    setCurrentTime(nextTime);
    void syncAudioTime(nextTime);
  }, [syncAudioTime]);

  const handlePlay = useCallback(async () => {
    const audio = audioRef.current;
    const clip = musicClip;

    if (!audio || !clip?.assetUrl) {
      setIsPlaying(false);
      return;
    }

    const clipEnd = clip.start + clip.duration;
    const playhead = currentTime < clip.start || currentTime >= clipEnd ? clip.start : currentTime;

    if (audio.src !== clip.assetUrl) {
      audio.src = clip.assetUrl;
      audio.load();
    }

    await waitForAudioMetadata(audio);
    await waitForAudioReady(audio);
    audio.currentTime = Math.min(
      getClipTrimStart(clip) + clamp(playhead - clip.start, 0, Math.max(clip.duration - 0.05, 0)),
      Math.max(audio.duration - 0.05, 0),
    );
    setCurrentTime(playhead);

    try {
      audio.muted = false;
      audio.volume = 1;
      await audio.play();
      setIsPlaying(true);
    } catch {
      setIsPlaying(false);
    }
  }, [currentTime, musicClip]);

  const handlePause = useCallback(() => {
    const audio = audioRef.current;
    if (audio && musicClip) {
      audio.pause();
      setCurrentTime(
        musicClip.start + clamp(audio.currentTime - getClipTrimStart(musicClip), 0, musicClip.duration),
      );
    }
    setIsPlaying(false);
  }, [musicClip]);

  const handleStepTime = useCallback((delta: number) => {
    const clipEnd = musicClip ? musicClip.start + musicClip.duration : Number.POSITIVE_INFINITY;
    handleTimeChange(clamp(currentTime + delta, 0, clipEnd));
  }, [currentTime, handleTimeChange, musicClip]);

  useEffect(() => {
    audioRef.current = new Audio();
    audioRef.current.preload = 'auto';
    audioRef.current.muted = false;
    audioRef.current.volume = 1;

    return () => {
      if (animationFrameRef.current !== null) {
        cancelAnimationFrame(animationFrameRef.current);
      }

      if (audioRef.current) {
        audioRef.current.pause();
        audioRef.current.removeAttribute('src');
        audioRef.current.load();
      }

      Object.values(objectUrlsRef.current).forEach((url) => URL.revokeObjectURL(url));
      objectUrlsRef.current = {};
    };
  }, []);

  useEffect(() => {
    let cancelled = false;

    const hydrateProject = async () => {
      try {
        const storedProject = await loadPersistedProject(ACTIVE_PROJECT_ID);
        const parsedProject = parseProjectDocument(storedProject ?? createDefaultProject());
        const storedAssetBlobs = await loadPersistedAssetBlobs(Array.from(getRetainedAssetIds(parsedProject)));
        const sanitizedProject = sanitizeProjectAgainstMissingAssets(
          parsedProject,
          new Set(Object.keys(storedAssetBlobs)),
        );

        if (cancelled) {
          return;
        }

        persistedAssetIdsRef.current = new Set(Object.keys(storedAssetBlobs));
        setProject(sanitizedProject);
        setAssetBlobs(storedAssetBlobs);
        setSaveState('saved');
      } catch {
        if (cancelled) {
          return;
        }

        persistedAssetIdsRef.current = new Set();
        setProject(createDefaultProject());
        setAssetBlobs({});
        setSaveState('error');
      } finally {
        if (!cancelled) {
          setHasHydratedProject(true);
        }
      }
    };

    void hydrateProject();

    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    const nextAssetUrls: Record<string, string> = {};

    Object.entries(assetBlobs).forEach(([assetId, blob]) => {
      if (previousBlobMapRef.current[assetId] === blob && objectUrlsRef.current[assetId]) {
        nextAssetUrls[assetId] = objectUrlsRef.current[assetId];
        return;
      }

      nextAssetUrls[assetId] = URL.createObjectURL(blob);
    });

    Object.entries(objectUrlsRef.current).forEach(([assetId, url]) => {
      if (!nextAssetUrls[assetId] || nextAssetUrls[assetId] !== url) {
        URL.revokeObjectURL(url);
      }
    });

    objectUrlsRef.current = nextAssetUrls;
    previousBlobMapRef.current = assetBlobs;
    setAssetUrls(nextAssetUrls);
  }, [assetBlobs]);

  useEffect(() => {
    if (selectedClipId && !timelineClips.some((clip) => clip.id === selectedClipId)) {
      setSelectedClipId(null);
    }
  }, [selectedClipId, timelineClips]);

  useEffect(() => {
    const audio = audioRef.current;
    if (!audio) {
      return;
    }

    if (!musicClip?.assetUrl) {
      audio.pause();
      audio.removeAttribute('src');
      audio.load();
      return;
    }

    if (audio.src !== musicClip.assetUrl) {
      audio.src = musicClip.assetUrl;
      audio.load();
    }
  }, [musicClip]);

  useEffect(() => {
    const audio = audioRef.current;
    if (!audio || !musicClip) {
      return;
    }

    const handleEnded = () => {
      setIsPlaying(false);
      setCurrentTime(musicClip.start + musicClip.duration);
    };

    audio.addEventListener('ended', handleEnded);

    return () => {
      audio.removeEventListener('ended', handleEnded);
    };
  }, [musicClip]);

  useEffect(() => {
    if (!isPlaying || !musicClip) {
      if (animationFrameRef.current !== null) {
        cancelAnimationFrame(animationFrameRef.current);
        animationFrameRef.current = null;
      }
      return;
    }

    const audio = audioRef.current;
    if (!audio) {
      return;
    }

    const tick = () => {
      const trimStart = getClipTrimStart(musicClip);
      const trimEnd = getClipTrimEnd(musicClip);
      const clipTime = clamp(audio.currentTime - trimStart, 0, musicClip.duration);

      if (audio.currentTime >= trimEnd - 0.02 || clipTime >= musicClip.duration - 0.02) {
        audio.pause();
        audio.currentTime = trimEnd;
        setCurrentTime(musicClip.start + musicClip.duration);
        setIsPlaying(false);
        animationFrameRef.current = null;
        return;
      }

      setCurrentTime(musicClip.start + clipTime);

      if (!audio.paused && !audio.ended) {
        animationFrameRef.current = requestAnimationFrame(tick);
      }
    };

    animationFrameRef.current = requestAnimationFrame(tick);

    return () => {
      if (animationFrameRef.current !== null) {
        cancelAnimationFrame(animationFrameRef.current);
        animationFrameRef.current = null;
      }
    };
  }, [isPlaying, musicClip]);

  useEffect(() => {
    if (!hasHydratedProject) {
      return;
    }

    if (!autoSaveInitializedRef.current) {
      autoSaveInitializedRef.current = true;
      return;
    }

    setSaveState('saving');
    const timeoutId = window.setTimeout(() => {
      void persistNow(projectRef.current, assetBlobsRef.current);
    }, 300);

    return () => {
      window.clearTimeout(timeoutId);
    };
  }, [assetBlobs, hasHydratedProject, persistNow, project]);

  useEffect(() => {
    const activeRenderJob = loadActiveRenderJob();
    if (!activeRenderJob) {
      return;
    }

    void pollRenderJob(activeRenderJob).catch((error) => {
      setRenderState('error');
      setRenderProgress(0);
      setRenderMessage(error instanceof Error ? error.message : 'Render failed.');
    });
  }, [pollRenderJob]);

  return (
    <div className="flex h-screen flex-col overflow-hidden bg-zinc-950 font-sans text-zinc-50">
      <TopBar
        projectName={project.name}
        musicBpm={musicClip?.bpm ?? null}
        saveState={saveState}
        renderState={renderState}
        renderProgress={renderProgress}
        renderMessage={renderMessage}
        onSave={handleSave}
        onNewProject={handleNewProject}
        onExport={handleExport}
        onOpenSubtitleAlignment={handleOpenSubtitleAlignment}
        subtitleAlignmentStatus={project.lyricSync.subtitleAlignment.status}
        subtitleAlignmentDisabled={!musicClip?.assetUrl || project.lyricSync.subtitleAlignment.status === 'running'}
        exportDisabled={exportDisabled}
      />
      <div className="flex flex-1 overflow-hidden">
        <Sidebar
          onAddSubtitleCue={handleAddSubtitleCue}
          onAddBackgroundPlaceholder={handleAddBackgroundPlaceholder}
          onUploadMusic={handleUploadMusic}
          onUploadBackgroundMedia={handleUploadBackgroundMedia}
        />
        <div className="flex min-h-0 flex-1 flex-col overflow-hidden">
          <ResizablePanelGroup orientation="vertical" className="flex min-h-0 flex-1 flex-col">
            <ResizablePanel
              id="workspace"
              defaultSize="76%"
              minSize="35%"
              className="flex min-h-0 flex-col"
            >
              <div className="flex min-h-0 flex-1 overflow-hidden">
                <MediaGalleryPanel
                  assets={galleryAssets}
                  assetUrls={assetUrls}
                  referencedIds={referencedAssetIdsForGallery}
                  onAddFiles={handleAddMediaLibraryFiles}
                  onRemoveAsset={handleRemoveMediaLibraryAsset}
                />
                <div className="preview-stage flex min-h-0 min-w-0 flex-1 flex-col bg-zinc-900">
                  <div className="flex min-h-0 flex-1 items-center justify-center">
                    <VideoPreview
                      currentTime={currentTime}
                      manifest={renderPreviewManifest}
                    />
                  </div>
                </div>
                <PropertiesPanel clip={selectedClip} onChange={handleUpdateClip} />
              </div>
            </ResizablePanel>
            <ResizableHandle
              withHandle
              className="h-2 shrink-0 border-0 bg-zinc-800 hover:bg-zinc-700"
            />
            <ResizablePanel
              id="timeline-stack"
              defaultSize="24%"
              minSize="200px"
              maxSize="65%"
              className="flex min-h-0 flex-col border-t border-zinc-800 bg-zinc-950"
            >
              <Timeline
                tracks={TIMELINE_TRACKS}
                clips={timelineClips}
                selectedClipId={selectedClipId}
                onSelectClip={setSelectedClipId}
                onChangeClip={handleUpdateClip}
                onDeleteClip={handleDeleteClip}
                onDragEnd={handleDragEnd}
                currentTime={currentTime}
                onTimeChange={handleTimeChange}
                isPlaying={isPlaying}
                hasPlayableAudio={Boolean(musicClip?.assetUrl)}
                onPlay={handlePlay}
                onPause={handlePause}
                onStop={stopPlayback}
                onStepTime={handleStepTime}
                beatBpm={musicClip?.bpm ?? null}
                beatGridStartSec={musicClip?.start ?? 0}
                subtitleSnapTimes={subtitleSnapTimes}
                onDropMediaFromGallery={handleDropMediaOnTimeline}
              />
            </ResizablePanel>
          </ResizablePanelGroup>
        </div>
      </div>
      {isSubtitleAlignmentOpen ? (
        <SubtitleAlignmentModal
          key={subtitleAlignmentModalKey}
          musicDuration={musicClip?.duration ?? null}
          alignmentState={project.lyricSync.subtitleAlignment}
          initialInput={subtitleAlignmentInput}
          onClose={handleCloseSubtitleAlignment}
          onRun={handleRunSubtitleAlignment}
          onApply={handleApplySubtitleAlignment}
        />
      ) : null}
    </div>
  );
}
