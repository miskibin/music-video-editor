import { useEffect, useMemo, useRef } from 'react';
import Image from 'next/image';
import { Clip } from '@/lib/types';

interface Props {
  currentTime: number;
  isPlaying: boolean;
  visualClip: Clip | null;
  subtitleText: string;
  /** Estimated music BPM; falls back to 140 for beat-pulse motion when unknown. */
  beatBpm?: number | null;
}

const clamp = (value: number, min: number, max: number) => Math.min(Math.max(value, min), max);

export default function VideoPreview({ currentTime, isPlaying, visualClip, subtitleText, beatBpm }: Props) {
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const bpmForMotion = beatBpm ?? 140;
  const beatPulse = isPlaying ? (Math.sin((currentTime * bpmForMotion * Math.PI) / 60) + 1) / 2 : 0.18;
  const baseColor = visualClip?.color ?? '#2563eb';
  const isVideoClip = visualClip?.assetKind === 'video' || visualClip?.visualType === 'video';
  const hasSubtitle = subtitleText.trim().length > 0;
  const visualOffset = useMemo(() => {
    if (!visualClip) {
      return 0;
    }

    return clamp(currentTime - visualClip.start, 0, visualClip.duration) + (visualClip.trimStart ?? 0);
  }, [currentTime, visualClip]);

  useEffect(() => {
    const video = videoRef.current;
    if (!video || !isVideoClip || !visualClip?.assetUrl) {
      return;
    }

    if (Math.abs(video.currentTime - visualOffset) > 0.12) {
      video.currentTime = visualOffset;
    }

    if (isPlaying) {
      void video.play().catch(() => undefined);
      return;
    }

    video.pause();
  }, [isPlaying, isVideoClip, visualClip?.assetUrl, visualOffset]);

  return (
    <div className="flex items-center justify-center w-full h-full min-h-0">
      <div className="relative h-full aspect-[9/16] rounded-lg overflow-hidden border border-zinc-800 shadow-2xl bg-black">
        {!visualClip ? (
          <div className="absolute inset-0 bg-black" />
        ) : visualClip.assetUrl && isVideoClip ? (
          <video
            ref={videoRef}
            src={visualClip.assetUrl}
            muted
            playsInline
            className="absolute inset-0 h-full w-full object-cover"
          />
        ) : visualClip.assetUrl ? (
          <Image
            src={visualClip.assetUrl}
            alt={visualClip.name}
            fill
            unoptimized
            className="absolute inset-0 h-full w-full object-cover"
          />
        ) : (
          <div
            className="absolute inset-0"
            style={{
              background: `linear-gradient(145deg, ${baseColor}, #09090b 68%)`,
              transform: `scale(${1 + beatPulse * 0.02})`,
            }}
          >
            <div
              className="absolute -left-10 top-12 h-48 w-48 rounded-full blur-3xl"
              style={{
                background: 'rgba(255,255,255,0.18)',
                transform: `translate3d(${beatPulse * 16}px, ${beatPulse * -10}px, 0)`,
              }}
            />
            <div
              className="absolute bottom-16 right-0 h-56 w-56 rounded-full blur-3xl"
              style={{
                background: 'rgba(244,114,182,0.2)',
                transform: `translate3d(${beatPulse * -18}px, ${beatPulse * 12}px, 0)`,
              }}
            />
          </div>
        )}

        <div className="absolute inset-0 bg-gradient-to-b from-black/15 via-transparent to-black/55" />

        <div className="absolute inset-x-0 top-6 flex justify-center">
          <div className="rounded-full border border-white/10 bg-black/35 px-3 py-1 text-[11px] font-medium uppercase tracking-[0.24em] text-white/70 backdrop-blur-sm">
            Phase 2 Preview
          </div>
        </div>

        {hasSubtitle ? (
          <div className="absolute inset-x-6 bottom-16 flex justify-center">
            <div
              className="max-w-[80%] rounded-3xl border border-white/12 bg-black/45 px-5 py-3 text-center text-xl font-semibold leading-tight text-white shadow-2xl backdrop-blur-md"
              style={{
                opacity: 1,
                transform: 'none',
              }}
            >
              {subtitleText}
            </div>
          </div>
        ) : null}

        <div className="absolute inset-4 border border-zinc-800/50 border-dashed pointer-events-none rounded" />

        <div className="absolute bottom-5 left-5 rounded-full bg-black/40 px-3 py-1 font-mono text-xs text-white/70 backdrop-blur-sm">
          {currentTime.toFixed(1)}s
        </div>
      </div>
    </div>
  );
}
