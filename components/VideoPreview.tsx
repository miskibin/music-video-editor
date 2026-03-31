import dynamic from 'next/dynamic';
import { SubtitleLayoutOverlay } from '@/components/SubtitleLayoutOverlay';
import type { RenderManifest } from '@/lib/render';
import type { SubtitleStyle } from '@/lib/types';

interface Props {
  currentTime: number;
  manifest: RenderManifest | null;
  subtitleStyle: SubtitleStyle;
  onSubtitleStyleChange: (updates: Partial<SubtitleStyle>) => void;
  /** Show draggable subtitle layout overlay (e.g. when a subtitle cue is selected). */
  showSubtitleOverlay?: boolean;
}

const VideoPreviewPlayer = dynamic(() => import('@/components/VideoPreviewPlayer'), {
  ssr: false,
  loading: () => (
    <div className="absolute inset-0 bg-black" />
  ),
});

export default function VideoPreview({
  currentTime,
  manifest,
  subtitleStyle,
  onSubtitleStyleChange,
  showSubtitleOverlay = false,
}: Props) {
  return (
    <div className="flex items-center justify-center w-full h-full min-h-0">
      <div className="relative h-full aspect-[9/16] rounded-lg overflow-hidden border border-zinc-800 shadow-2xl bg-black">
        <VideoPreviewPlayer currentTime={currentTime} manifest={manifest} />
        <SubtitleLayoutOverlay
          subtitleStyle={subtitleStyle}
          onSubtitleStyleChange={onSubtitleStyleChange}
          enabled={showSubtitleOverlay}
        />
      </div>
    </div>
  );
}
