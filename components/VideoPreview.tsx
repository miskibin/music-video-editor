import Image from 'next/image';
import { Clip } from '@/lib/types';

interface Props {
  currentTime: number;
  isPlaying: boolean;
  visualClip: Clip | null;
  subtitleText: string;
}

export default function VideoPreview({ currentTime, isPlaying, visualClip, subtitleText }: Props) {
  const beatPulse = isPlaying ? (Math.sin((currentTime * 140 * Math.PI) / 60) + 1) / 2 : 0.18;
  const imageScale = 1 + beatPulse * 0.04;
  const textOpacity = 0.72 + beatPulse * 0.28;
  const textTranslate = isPlaying ? Math.sin(currentTime * 2.4) * -6 : 0;
  const baseColor = visualClip?.color ?? '#2563eb';

  return (
    <div className="flex items-center justify-center w-full h-full min-h-0">
      <div className="relative h-full aspect-[9/16] rounded-lg overflow-hidden border border-zinc-800 shadow-2xl bg-black">
        {visualClip?.assetUrl ? (
          <Image
            src={visualClip.assetUrl}
            alt={visualClip.name}
            fill
            unoptimized
            className="absolute inset-0 h-full w-full object-cover"
            style={{
              transform: `scale(${imageScale})`,
              filter: `saturate(${1.05 + beatPulse * 0.2}) brightness(${0.88 + beatPulse * 0.12})`,
            }}
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
            Phase 1 Preview
          </div>
        </div>

        <div className="absolute inset-x-6 bottom-16 flex justify-center">
          <div
            className="max-w-[80%] rounded-3xl border border-white/12 bg-black/45 px-5 py-3 text-center text-xl font-semibold leading-tight text-white shadow-2xl backdrop-blur-md"
            style={{
              opacity: textOpacity,
              transform: `translateY(${textTranslate}px) scale(${0.98 + beatPulse * 0.03})`,
            }}
          >
            {subtitleText}
          </div>
        </div>

        <div className="absolute inset-4 border border-zinc-800/50 border-dashed pointer-events-none rounded" />

        <div className="absolute bottom-5 left-5 rounded-full bg-black/40 px-3 py-1 font-mono text-xs text-white/70 backdrop-blur-sm">
          {currentTime.toFixed(1)}s
        </div>
      </div>
    </div>
  );
}
