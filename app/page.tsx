'use client';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import TopBar from '@/components/TopBar';
import Sidebar from '@/components/Sidebar';
import VideoPreview from '@/components/VideoPreview';
import Timeline from '@/components/Timeline';
import PropertiesPanel from '@/components/PropertiesPanel';
import { Clip, Track, TrackType } from '@/lib/types';

const AUDIO_TRACK_ID = 'a1';
const VIDEO_TRACK_ID = 'v1';
const TEXT_TRACK_ID = 't1';
const WAVEFORM_BARS = 320;
const MIN_CLIP_DURATION = 1;

const clamp = (value: number, min: number, max: number) => Math.min(Math.max(value, min), max);

const createClipId = () => Math.random().toString(36).substring(2, 9);

const getAudioDuration = (url: string) => new Promise<number>((resolve) => {
  const probe = document.createElement('audio');

  const cleanup = () => {
    probe.removeAttribute('src');
    probe.load();
  };

  probe.preload = 'metadata';
  probe.src = url;

  probe.onloadedmetadata = () => {
    const duration = Number.isFinite(probe.duration) ? probe.duration : 30;
    cleanup();
    resolve(duration);
  };

  probe.onerror = () => {
    cleanup();
    resolve(30);
  };
});

const getAudioContextConstructor = () => {
  const windowWithWebkit = window as Window & typeof globalThis & {
    webkitAudioContext?: typeof AudioContext;
  };

  return window.AudioContext ?? windowWithWebkit.webkitAudioContext;
};

const extractWaveformPeaks = async (url: string, totalBars = WAVEFORM_BARS) => {
  const AudioContextConstructor = getAudioContextConstructor();
  if (!AudioContextConstructor) {
    return [];
  }

  const audioContext = new AudioContextConstructor();

  try {
    const response = await fetch(url);
    const audioData = await response.arrayBuffer();
    const audioBuffer = await audioContext.decodeAudioData(audioData);
    const samplesPerBar = Math.max(1, Math.floor(audioBuffer.length / totalBars));

    const peaks = Array.from({ length: totalBars }, (_, barIndex) => {
      const start = barIndex * samplesPerBar;
      const end = Math.min(audioBuffer.length, start + samplesPerBar);
      const sampleStep = Math.max(1, Math.floor((end - start) / 96));
      let peak = 0;

      for (let channelIndex = 0; channelIndex < audioBuffer.numberOfChannels; channelIndex += 1) {
        const channelData = audioBuffer.getChannelData(channelIndex);

        for (let sampleIndex = start; sampleIndex < end; sampleIndex += sampleStep) {
          peak = Math.max(peak, Math.abs(channelData[sampleIndex] ?? 0));
        }
      }

      return peak;
    });

    const maxPeak = Math.max(...peaks, 0.001);
    return peaks.map((peak) => Number((peak / maxPeak).toFixed(4)));
  } catch {
    return [];
  } finally {
    await audioContext.close().catch(() => undefined);
  }
};

const waitForAudioMetadata = (audio: HTMLAudioElement) => new Promise<void>((resolve) => {
  if (audio.readyState >= 1) {
    resolve();
    return;
  }

  const handleLoadedMetadata = () => {
    resolve();
  };

  const handleError = () => {
    resolve();
  };

  audio.addEventListener('loadedmetadata', handleLoadedMetadata, { once: true });
  audio.addEventListener('error', handleError, { once: true });
});

const waitForAudioReady = (audio: HTMLAudioElement) => new Promise<void>((resolve) => {
  if (audio.readyState >= 2) {
    resolve();
    return;
  }

  const handleLoadedData = () => {
    resolve();
  };

  const handleCanPlay = () => {
    resolve();
  };

  const handleError = () => {
    resolve();
  };

  audio.addEventListener('loadeddata', handleLoadedData, { once: true });
  audio.addEventListener('canplay', handleCanPlay, { once: true });
  audio.addEventListener('error', handleError, { once: true });
});

const sortClipsByStart = (clips: Clip[]) => [...clips].sort((left, right) => left.start - right.start);

const getClipSourceDuration = (clip: Clip) => clip.sourceDuration ?? clip.duration;

const getClipTrimStart = (clip: Clip) => clip.trimStart ?? 0;

const getClipTrimEnd = (clip: Clip) => Math.min(getClipTrimStart(clip) + clip.duration, getClipSourceDuration(clip));

const normalizeClipUpdates = (clip: Clip, updates: Partial<Clip>) => {
  if (clip.trackId !== AUDIO_TRACK_ID || !clip.assetUrl) {
    return updates;
  }

  const sourceDuration = Math.max(getClipSourceDuration(clip), MIN_CLIP_DURATION);
  const trimStart = clamp(
    updates.trimStart ?? getClipTrimStart(clip),
    0,
    Math.max(sourceDuration - MIN_CLIP_DURATION, 0),
  );
  const duration = clamp(
    updates.duration ?? clip.duration,
    MIN_CLIP_DURATION,
    Math.max(sourceDuration - trimStart, MIN_CLIP_DURATION),
  );

  return {
    ...updates,
    sourceDuration,
    trimStart,
    duration,
  };
};

const findClipAtTime = (clips: Clip[], time: number) => clips.find(
  (clip) => time >= clip.start && time < clip.start + clip.duration,
) ?? null;

const mergeClipUpdates = (clip: Clip, updates: Partial<Clip>) => {
  let didChange = false;
  const nextClip = { ...clip };

  for (const [key, value] of Object.entries(updates) as [keyof Clip, Clip[keyof Clip]][]) {
    if (Object.is(clip[key], value)) {
      continue;
    }

    Object.assign(nextClip, { [key]: value });
    didChange = true;
  }

  return didChange ? nextClip : clip;
};

const updateClipCollection = (clips: Clip[], id: string, updates: Partial<Clip>) => {
  let didChange = false;

  const nextClips = clips.map((clip) => {
    if (clip.id !== id) {
      return clip;
    }

    const nextClip = mergeClipUpdates(clip, updates);
    if (nextClip !== clip) {
      didChange = true;
    }

    return nextClip;
  });

  return didChange ? nextClips : clips;
};

const INITIAL_TRACKS: Track[] = [
  { id: 'v1', name: 'V1 - Main', type: 'video' },
  { id: 't1', name: 'T1 - Text', type: 'text' },
  { id: 'a1', name: 'A1 - Audio', type: 'audio' },
];

const TIMELINE_CHROME_HEIGHT = 64;
const TIMELINE_TRACK_HEIGHT = 48;
const TIMELINE_BOTTOM_PADDING = 4;
const TIMELINE_HEIGHT = TIMELINE_CHROME_HEIGHT + (INITIAL_TRACKS.length * TIMELINE_TRACK_HEIGHT) + TIMELINE_BOTTOM_PADDING;

const INITIAL_CLIPS: Clip[] = [
  { id: 'c1', trackId: 'v1', name: 'Intro.mp4', color: '#2563eb', start: 0, duration: 15, visualType: 'gradient' },
  { id: 'c2', trackId: 'v1', name: 'Main_Sequence.mp4', color: '#2563eb', start: 15, duration: 30, visualType: 'gradient' },
  { id: 'c3', trackId: 'v1', name: 'B-Roll_01.mp4', color: '#3b82f6', start: 45, duration: 10, visualType: 'gradient' },
  { id: 'c4', trackId: 't1', name: 'Title Text', color: '#d946ef', start: 5, duration: 10, overlayText: 'Your subtitles here' },
];

export default function Editor() {
  const [clips, setClips] = useState<Clip[]>(INITIAL_CLIPS);
  const [selectedClipId, setSelectedClipId] = useState<string | null>(null);
  const [currentTime, setCurrentTime] = useState(0);
  const [isPlaying, setIsPlaying] = useState(false);
  const [activeAudioClipId, setActiveAudioClipId] = useState<string | null>(null);
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const animationFrameRef = useRef<number | null>(null);
  const objectUrlsRef = useRef<string[]>([]);

  const selectedClip = useMemo(
    () => clips.find((clip) => clip.id === selectedClipId) || null,
    [clips, selectedClipId],
  );
  const audioClips = useMemo(
    () => clips.filter((clip) => clip.trackId === AUDIO_TRACK_ID),
    [clips],
  );
  const uploadedAudioClips = useMemo(
    () => audioClips.filter((clip) => Boolean(clip.assetUrl)),
    [audioClips],
  );
  const sortedVisualClips = useMemo(
    () => sortClipsByStart(clips.filter((clip) => clip.trackId === VIDEO_TRACK_ID)),
    [clips],
  );
  const sortedTextClips = useMemo(
    () => sortClipsByStart(clips.filter((clip) => clip.trackId === TEXT_TRACK_ID)),
    [clips],
  );
  const selectedAudioClip = useMemo(
    () => selectedClip?.trackId === AUDIO_TRACK_ID && selectedClip.assetUrl ? selectedClip : null,
    [selectedClip],
  );
  const latestUploadedAudioClip = uploadedAudioClips[uploadedAudioClips.length - 1] || null;
  const latestUploadedVisualClip = useMemo(
    () => [...clips].reverse().find((clip) => clip.trackId === VIDEO_TRACK_ID && clip.assetUrl) || null,
    [clips],
  );
  const firstVisualClip = useMemo(
    () => clips.find((clip) => clip.trackId === VIDEO_TRACK_ID) || null,
    [clips],
  );
  const firstTextClip = useMemo(
    () => clips.find((clip) => clip.trackId === TEXT_TRACK_ID) || null,
    [clips],
  );
  const activeAudioClip = useMemo(
    () => selectedAudioClip
      || uploadedAudioClips.find((clip) => clip.id === activeAudioClipId)
      || latestUploadedAudioClip,
    [activeAudioClipId, latestUploadedAudioClip, selectedAudioClip, uploadedAudioClips],
  );
  const activeVisualClip = useMemo(
    () => findClipAtTime(sortedVisualClips, currentTime)
      || latestUploadedVisualClip
      || firstVisualClip,
    [currentTime, firstVisualClip, latestUploadedVisualClip, sortedVisualClips],
  );
  const activeTextClip = useMemo(
    () => findClipAtTime(sortedTextClips, currentTime)
      || firstTextClip,
    [currentTime, firstTextClip, sortedTextClips],
  );
  const subtitleText = useMemo(
    () => activeTextClip?.overlayText || activeTextClip?.name || 'Your subtitles here',
    [activeTextClip],
  );

  const revokeObjectUrl = useCallback((url?: string) => {
    if (!url) return;
    objectUrlsRef.current = objectUrlsRef.current.filter(currentUrl => currentUrl !== url);
    URL.revokeObjectURL(url);
  }, []);

  const registerObjectUrl = useCallback((file: File) => {
    const url = URL.createObjectURL(file);
    objectUrlsRef.current.push(url);
    return url;
  }, []);

  const syncAudioTime = useCallback(async (time: number) => {
    const audio = audioRef.current;
    const clip = activeAudioClip;
    if (!audio || !clip?.assetUrl) return;

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
  }, [activeAudioClip]);

  const stopPlayback = useCallback((resetToStart = true) => {
    const audio = audioRef.current;
    if (animationFrameRef.current !== null) {
      cancelAnimationFrame(animationFrameRef.current);
      animationFrameRef.current = null;
    }

    if (audio) {
      audio.pause();
      audio.currentTime = 0;
    }

    setIsPlaying(false);
    if (resetToStart) {
      setCurrentTime(0);
    }
  }, []);

  const handleAddClip = useCallback((type: TrackType) => {
    const track = INITIAL_TRACKS.find(t => t.type === type);
    if (!track) return;

    const newClip: Clip = {
      id: createClipId(),
      trackId: track.id,
      name: `New ${type}`,
      color: type === 'video' ? '#3b82f6' : type === 'text' ? '#d946ef' : '#22c55e',
      start: 0,
      duration: 10,
      visualType: type === 'video' ? 'gradient' : undefined,
      overlayText: type === 'text' ? 'Your subtitles here' : undefined,
    };

    setClips((currentClips) => {
      const trackClips = currentClips.filter((clip) => clip.trackId === track.id);
      const maxEnd = trackClips.reduce((max, clip) => Math.max(max, clip.start + clip.duration), 0);
      return [...currentClips, { ...newClip, start: maxEnd }];
    });
    setSelectedClipId(newClip.id);
  }, []);

  const handleUploadMusic = useCallback(async (file: File) => {
    const assetUrl = registerObjectUrl(file);
    const [duration, waveform] = await Promise.all([
      getAudioDuration(assetUrl),
      extractWaveformPeaks(assetUrl),
    ]);

    clips
      .filter(clip => clip.trackId === AUDIO_TRACK_ID && clip.assetUrl)
      .forEach(clip => revokeObjectUrl(clip.assetUrl));

    stopPlayback();

    const newClip: Clip = {
      id: createClipId(),
      trackId: AUDIO_TRACK_ID,
      name: file.name,
      color: '#22c55e',
      start: 0,
      duration,
      sourceDuration: duration,
      trimStart: 0,
      assetUrl,
      waveform,
    };

    setClips(currentClips => [
      ...currentClips.filter(clip => clip.trackId !== AUDIO_TRACK_ID),
      newClip,
    ]);
    setActiveAudioClipId(newClip.id);
    setSelectedClipId(newClip.id);
    setCurrentTime(0);
  }, [clips, registerObjectUrl, revokeObjectUrl, stopPlayback]);

  const handleUploadImage = useCallback((file: File) => {
    const assetUrl = registerObjectUrl(file);
    const newClip: Clip = {
      id: createClipId(),
      trackId: VIDEO_TRACK_ID,
      name: file.name,
      color: '#fb7185',
      start: currentTime,
      duration: activeAudioClip?.duration || 12,
      assetUrl,
      visualType: 'image',
    };

    setClips(currentClips => [...currentClips, newClip]);
    setSelectedClipId(newClip.id);
  }, [activeAudioClip?.duration, currentTime, registerObjectUrl]);

  const handleUpdateClip = useCallback((id: string, updates: Partial<Clip>) => {
    setClips((currentClips) => {
      const clip = currentClips.find((currentClip) => currentClip.id === id);
      if (!clip) {
        return currentClips;
      }

      return updateClipCollection(currentClips, id, normalizeClipUpdates(clip, updates));
    });
  }, []);

  const handleDragEnd = useCallback((clipId: string) => {
    setClips(currentClips => {
      const clip = currentClips.find(c => c.id === clipId);
      if (!clip) return currentClips;

      let updatedClips = [...currentClips];

      const trackClips = updatedClips
        .filter(c => c.trackId === clip.trackId)
        .sort((a, b) => a.start - b.start);
      
      let currentStart = 0;
      trackClips.forEach(c => {
        const newStart = Math.max(currentStart, c.start);
        if (newStart !== c.start) {
          const index = updatedClips.findIndex(uc => uc.id === c.id);
          updatedClips[index] = { ...updatedClips[index], start: newStart };
        }
        currentStart = newStart + c.duration;
      });

      return updatedClips;
    });
  }, []);

  const handleDeleteClip = useCallback((id: string) => {
    const clipToDelete = clips.find(c => c.id === id);
    if (clipToDelete?.assetUrl) {
      revokeObjectUrl(clipToDelete.assetUrl);
    }

    if (id === activeAudioClipId || clipToDelete?.trackId === AUDIO_TRACK_ID) {
      stopPlayback();
      setActiveAudioClipId(null);
    }

    setClips(clips.filter(c => c.id !== id));
    if (selectedClipId === id) setSelectedClipId(null);
  }, [activeAudioClipId, clips, revokeObjectUrl, selectedClipId, stopPlayback]);

  const handleTimeChange = useCallback((time: number) => {
    const nextTime = Math.max(0, time);
    setCurrentTime(nextTime);
    void syncAudioTime(nextTime);
  }, [syncAudioTime]);

  const handlePlay = useCallback(async () => {
    const audio = audioRef.current;
    const clip = activeAudioClip;

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
      setActiveAudioClipId(clip.id);
    } catch {
      setIsPlaying(false);
    }
  }, [activeAudioClip, currentTime]);

  const handlePause = useCallback(() => {
    const audio = audioRef.current;
    if (audio && activeAudioClip) {
      audio.pause();
      setCurrentTime(
        activeAudioClip.start
          + clamp(audio.currentTime - getClipTrimStart(activeAudioClip), 0, activeAudioClip.duration),
      );
    }
    setIsPlaying(false);
  }, [activeAudioClip]);

  const handleStepTime = useCallback((delta: number) => {
    const clip = activeAudioClip;
    const clipEnd = clip ? clip.start + clip.duration : Number.POSITIVE_INFINITY;
    handleTimeChange(clamp(currentTime + delta, 0, clipEnd));
  }, [activeAudioClip, currentTime, handleTimeChange]);

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

      objectUrlsRef.current.forEach(url => URL.revokeObjectURL(url));
      objectUrlsRef.current = [];
    };
  }, []);

  useEffect(() => {
    const audio = audioRef.current;
    if (!audio) return;

    if (!activeAudioClip?.assetUrl) {
      audio.pause();
      audio.removeAttribute('src');
      audio.load();
      return;
    }

    if (audio.src !== activeAudioClip.assetUrl) {
      audio.src = activeAudioClip.assetUrl;
      audio.load();
    }
  }, [activeAudioClip]);

  useEffect(() => {
    const audio = audioRef.current;
    const clip = activeAudioClip;
    if (!audio || !clip) return;

    const handleEnded = () => {
      setIsPlaying(false);
      setCurrentTime(clip.start + clip.duration);
    };

    audio.addEventListener('ended', handleEnded);

    return () => {
      audio.removeEventListener('ended', handleEnded);
    };
  }, [activeAudioClip]);

  useEffect(() => {
    if (!isPlaying || !activeAudioClip) {
      if (animationFrameRef.current !== null) {
        cancelAnimationFrame(animationFrameRef.current);
        animationFrameRef.current = null;
      }
      return;
    }

    const audio = audioRef.current;
    if (!audio) return;

    const tick = () => {
      const trimStart = getClipTrimStart(activeAudioClip);
      const trimEnd = getClipTrimEnd(activeAudioClip);
      const clipTime = clamp(audio.currentTime - trimStart, 0, activeAudioClip.duration);

      if (audio.currentTime >= trimEnd - 0.02 || clipTime >= activeAudioClip.duration - 0.02) {
        audio.pause();
        audio.currentTime = trimEnd;
        setCurrentTime(activeAudioClip.start + activeAudioClip.duration);
        setIsPlaying(false);
        animationFrameRef.current = null;
        return;
      }

      setCurrentTime(activeAudioClip.start + clipTime);

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
  }, [isPlaying, activeAudioClip]);

  return (
    <div className="flex flex-col h-screen bg-zinc-950 text-zinc-50 overflow-hidden font-sans">
      <TopBar />
      <div className="flex flex-1 overflow-hidden">
        <Sidebar onAddClip={handleAddClip} onUploadMusic={handleUploadMusic} onUploadImage={handleUploadImage} />
        <div className="flex flex-col flex-1 overflow-hidden">
          <div className="flex flex-1 overflow-hidden">
            <div className="flex-1 flex items-center justify-center p-4 bg-zinc-900">
              <VideoPreview currentTime={currentTime} isPlaying={isPlaying} visualClip={activeVisualClip} subtitleText={subtitleText} />
            </div>
            <PropertiesPanel clip={selectedClip} onChange={handleUpdateClip} />
          </div>
          <div className="border-t border-zinc-800 bg-zinc-950 shrink-0" style={{ height: `${TIMELINE_HEIGHT}px` }}>
            <Timeline 
              tracks={INITIAL_TRACKS}
              clips={clips}
              selectedClipId={selectedClipId}
              onSelectClip={setSelectedClipId}
              onChangeClip={handleUpdateClip}
              onDeleteClip={handleDeleteClip}
              onDragEnd={handleDragEnd}
              currentTime={currentTime}
              onTimeChange={handleTimeChange}
              isPlaying={isPlaying}
              hasPlayableAudio={Boolean(activeAudioClip?.assetUrl)}
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
