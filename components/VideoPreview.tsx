import dynamic from 'next/dynamic';
import type { RenderManifest } from '@/lib/render';

interface Props {
  currentTime: number;
  manifest: RenderManifest | null;
}

const VideoPreviewPlayer = dynamic(() => import('@/components/VideoPreviewPlayer'), {
  ssr: false,
  loading: () => (
    <div className="absolute inset-0 bg-black" />
  ),
});

export default function VideoPreview({ currentTime, manifest }: Props) {
  return (
    <div className="flex items-center justify-center w-full h-full min-h-0">
      <div className="relative h-full aspect-[9/16] rounded-lg overflow-hidden border border-zinc-800 shadow-2xl bg-black">
        <VideoPreviewPlayer currentTime={currentTime} manifest={manifest} />
      </div>
    </div>
  );
}
