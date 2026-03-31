import { useEffect, useMemo, useRef } from 'react';
import { Player, type PlayerRef } from '@remotion/player';
import { createPlaceholderRenderManifest, RENDER_FPS, type RenderManifest } from '@/lib/render';
import { MusicVideoComposition } from '@/rendering/remotion/MusicVideoComposition';

interface Props {
  currentTime: number;
  manifest: RenderManifest | null;
}

const clamp = (value: number, min: number, max: number) => Math.min(Math.max(value, min), max);

export default function VideoPreview({ currentTime, manifest }: Props) {
  const playerRef = useRef<PlayerRef>(null);
  const previewManifest = useMemo(() => manifest ?? createPlaceholderRenderManifest(), [manifest]);
  const currentFrame = useMemo(
    () => clamp(Math.round(currentTime * previewManifest.fps), 0, Math.max(previewManifest.durationInFrames - 1, 0)),
    [currentTime, previewManifest.durationInFrames, previewManifest.fps],
  );

  useEffect(() => {
    const player = playerRef.current;
    if (!player) {
      return;
    }

    if (player.getCurrentFrame() !== currentFrame) {
      player.seekTo(currentFrame);
    }
    player.pause();
  }, [currentFrame]);

  return (
    <div className="flex items-center justify-center w-full h-full min-h-0">
      <div className="relative h-full aspect-[9/16] rounded-lg overflow-hidden border border-zinc-800 shadow-2xl bg-black">
        <Player
          ref={playerRef}
          component={MusicVideoComposition}
          inputProps={{ manifest: previewManifest }}
          durationInFrames={previewManifest.durationInFrames}
          compositionWidth={previewManifest.width}
          compositionHeight={previewManifest.height}
          fps={previewManifest.fps || RENDER_FPS}
          controls={false}
          clickToPlay={false}
          doubleClickToFullscreen={false}
          spaceKeyToPlayOrPause={false}
          initiallyMuted
          initialFrame={currentFrame}
          style={{
            width: '100%',
            height: '100%',
          }}
        />
      </div>
    </div>
  );
}
