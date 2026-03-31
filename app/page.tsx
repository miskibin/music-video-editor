'use client';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import TopBar from '@/components/TopBar';
import Sidebar from '@/components/Sidebar';
import VideoPreview from '@/components/VideoPreview';
import Timeline from '@/components/Timeline';
import PropertiesPanel from '@/components/PropertiesPanel';
import { AssetRecord, BackgroundSegment, Clip, MusicClip, SubtitleCue } from '@/lib/types';
import {
  ACTIVE_PROJECT_ID,
  MIN_CLIP_DURATION,
  TIMELINE_TRACKS,
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
  extractWaveformPeaks,
  getAudioDuration,
  getImageMetadata,
  getVideoMetadata,
  waitForAudioMetadata,
  waitForAudioReady,
} from '@/lib/media-utils';

type AssetBlobMap = Record<string, Blob>;
type SaveState = 'loading' | 'saving' | 'saved' | 'error';

const AUDIO_TRACK_ID = 'a1';
const VIDEO_TRACK_ID = 'v1';
const TEXT_TRACK_ID = 't1';
const TIMELINE_CHROME_HEIGHT = 64;
const TIMELINE_TRACK_HEIGHT = 48;
const TIMELINE_BOTTOM_PADDING = 4;
const TIMELINE_HEIGHT = TIMELINE_CHROME_HEIGHT + (TIMELINE_TRACKS.length * TIMELINE_TRACK_HEIGHT) + TIMELINE_BOTTOM_PADDING;

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
  const [saveState, setSaveState] = useState<SaveState>('loading');
  const [hasHydratedProject, setHasHydratedProject] = useState(false);
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const animationFrameRef = useRef<number | null>(null);
  const objectUrlsRef = useRef<Record<string, string>>({});
  const previousBlobMapRef = useRef<AssetBlobMap>({});
  const projectRef = useRef(project);
  const assetBlobsRef = useRef(assetBlobs);
  const persistedAssetIdsRef = useRef<Set<string>>(new Set());
  const autoSaveInitializedRef = useRef(false);

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
  const activeVisualClip = useMemo(
    () => findClipAtTime(sortedVisualClips, currentTime) || sortedVisualClips[0] || null,
    [currentTime, sortedVisualClips],
  );
  const activeTextClip = useMemo(
    () => findClipAtTime(sortedTextClips, currentTime) || sortedTextClips[0] || null,
    [currentTime, sortedTextClips],
  );
  const subtitleText = useMemo(
    () => activeTextClip?.overlayText || project.subtitles.sourceText || 'Your subtitles here',
    [activeTextClip, project.subtitles.sourceText],
  );

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
      const [duration, waveform] = await Promise.all([
        getAudioDuration(temporaryUrl),
        extractWaveformPeaks(temporaryUrl),
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
      <TopBar projectName={project.name} saveState={saveState} onSave={handleSave} />
      <div className="flex flex-1 overflow-hidden">
        <Sidebar
          onAddSubtitleCue={handleAddSubtitleCue}
          onAddBackgroundPlaceholder={handleAddBackgroundPlaceholder}
          onUploadMusic={handleUploadMusic}
          onUploadBackgroundMedia={handleUploadBackgroundMedia}
        />
        <div className="flex flex-1 flex-col overflow-hidden">
          <div className="flex flex-1 overflow-hidden">
            <div className="flex flex-1 items-center justify-center bg-zinc-900 p-4">
              <VideoPreview
                currentTime={currentTime}
                isPlaying={isPlaying}
                visualClip={activeVisualClip}
                subtitleText={subtitleText}
              />
            </div>
            <PropertiesPanel clip={selectedClip} onChange={handleUpdateClip} />
          </div>
          <div className="shrink-0 border-t border-zinc-800 bg-zinc-950" style={{ height: `${TIMELINE_HEIGHT}px` }}>
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
            />
          </div>
        </div>
      </div>
    </div>
  );
}
