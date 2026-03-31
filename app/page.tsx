'use client';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import TopBar from '@/components/TopBar';
import Sidebar from '@/components/Sidebar';
import SubtitleAlignmentModal from '@/components/SubtitleAlignmentModal';
import VideoPreview from '@/components/VideoPreview';
import PreviewWorkspacePanel from '@/components/PreviewWorkspacePanel';
import Timeline from '@/components/Timeline';
import PropertiesPanel from '@/components/PropertiesPanel';
import { ResizableHandle, ResizablePanel, ResizablePanelGroup } from '@/components/ui/resizable';
import { AssetRecord, BackgroundSegment, Clip, MusicClip, SubtitleAlignmentInput, SubtitleCue } from '@/lib/types';
import {
  ACTIVE_PROJECT_ID,
  MIN_CLIP_DURATION,
  TIMELINE_TRACKS,
  applySubtitleAlignmentResult,
  appendSubtitleCue,
  buildTimelineClips,
  createDefaultBackgroundSegment,
  createDefaultProject,
  createId,
  deleteTimelineClipFromProject,
  getReferencedAssetIds,
  normalizeTrackAfterDrag,
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
import { sanitizeOutputName } from '@/lib/render';

type AssetBlobMap = Record<string, Blob>;
type SaveState = 'loading' | 'saving' | 'saved' | 'error';
type RenderState = 'idle' | 'rendering' | 'success' | 'error';

const AUDIO_TRACK_ID = 'a1';
const VIDEO_TRACK_ID = 'v1';
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

const downloadBlob = (blob: Blob, fileName: string) => {
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement('a');
  anchor.href = url;
  anchor.download = fileName;
  anchor.click();
  URL.revokeObjectURL(url);
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
  const sortedVisualClips = useMemo(
    () => sortClipsByStart(timelineClips.filter((clip) => clip.trackId === VIDEO_TRACK_ID)),
    [timelineClips],
  );
  const sortedTextClips = useMemo(
    () => sortClipsByStart(timelineClips.filter((clip) => clip.trackId === TEXT_TRACK_ID)),
    [timelineClips],
  );
  const timelineDuration = useMemo(() => {
    const musicEnd = musicClip ? musicClip.start + musicClip.duration : 0;
    const visualsEnd = getTrackMaxEnd(sortedVisualClips);
    const textEnd = getTrackMaxEnd(sortedTextClips);
    const bgEnd = getTrackMaxEnd(project.background.segments);
    return Math.max(musicEnd, visualsEnd, textEnd, bgEnd, 1);
  }, [musicClip, project.background.segments, sortedTextClips, sortedVisualClips]);
  const activeVisualClip = useMemo(
    () => findClipAtTime(sortedVisualClips, currentTime),
    [currentTime, sortedVisualClips],
  );
  const activeTextClip = useMemo(
    () => findClipAtTime(sortedTextClips, currentTime),
    [currentTime, sortedTextClips],
  );
  const subtitleText = useMemo(
    () => activeTextClip?.overlayText ?? '',
    [activeTextClip, project.subtitles.sourceText],
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

  const persistNow = useCallback(async (nextProject: typeof project, nextAssetBlobs: AssetBlobMap) => {
    try {
      setSaveState('saving');

      const referencedAssetIds = getReferencedAssetIds(nextProject);
      const nextBlobAssetIds = Object.keys(nextAssetBlobs).filter((assetId) => referencedAssetIds.has(assetId));

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

      const response = await fetch('/api/render', {
        method: 'POST',
        body: formData,
      });

      if (!response.ok) {
        const contentType = response.headers.get('content-type') ?? '';
        const responseBody = contentType.includes('application/json')
          ? await response.json()
          : await response.text();
        const errorMessage = typeof responseBody === 'object'
          && responseBody !== null
          && 'detail' in responseBody
          ? String((responseBody as { detail: unknown }).detail)
          : 'Render failed.';

        throw new Error(errorMessage);
      }

      const videoBlob = await response.blob();
      const fileName = `${sanitizeOutputName(currentProject.name)}.mp4`;
      downloadBlob(videoBlob, fileName);
      setRenderState('success');
      setRenderMessage(`Downloaded ${fileName}.`);
    } catch (error) {
      setRenderState('error');
      setRenderMessage(error instanceof Error ? error.message : 'Render failed.');
    }
  }, [renderState]);

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
        const storedAssetBlobs = await loadPersistedAssetBlobs(Array.from(getReferencedAssetIds(parsedProject)));
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

  return (
    <div className="flex h-screen flex-col overflow-hidden bg-zinc-950 font-sans text-zinc-50">
      <TopBar
        projectName={project.name}
        musicBpm={musicClip?.bpm ?? null}
        saveState={saveState}
        renderState={renderState}
        renderMessage={renderMessage}
        onSave={handleSave}
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
                <PreviewWorkspacePanel
                  projectName={project.name}
                  currentTime={currentTime}
                  timelineDuration={timelineDuration}
                  bpm={musicClip?.bpm ?? null}
                  activeVisualName={activeVisualClip?.name ?? null}
                  subtitleLine={subtitleText}
                  subtitleCueCount={project.subtitles.cues.length}
                  backgroundSegmentCount={project.background.segments.length}
                />
                <div className="preview-stage flex min-h-0 min-w-0 flex-1 flex-col bg-zinc-900">
                  <div className="flex min-h-0 flex-1 items-center justify-center">
                    <VideoPreview
                      currentTime={currentTime}
                      isPlaying={isPlaying}
                      visualClip={activeVisualClip}
                      subtitleText={subtitleText}
                      beatBpm={musicClip?.bpm ?? null}
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
