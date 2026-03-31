import { Composition } from 'remotion';
import {
  createPlaceholderRenderManifest,
  RENDER_COMPOSITION_ID,
  type RenderManifest,
} from '../../lib/render';
import { MusicVideoComposition } from './MusicVideoComposition';

export type MusicVideoCompositionProps = {
  manifest: RenderManifest;
};

export const RemotionRoot = () => {
  const placeholderManifest = createPlaceholderRenderManifest();

  return (
    <Composition
      id={RENDER_COMPOSITION_ID}
      component={MusicVideoComposition}
      width={placeholderManifest.width}
      height={placeholderManifest.height}
      fps={placeholderManifest.fps}
      durationInFrames={placeholderManifest.durationInFrames}
      defaultProps={{ manifest: placeholderManifest } satisfies MusicVideoCompositionProps}
      calculateMetadata={({ props }: { props: MusicVideoCompositionProps }) => ({
        width: props.manifest.width,
        height: props.manifest.height,
        fps: props.manifest.fps,
        durationInFrames: props.manifest.durationInFrames,
        defaultOutName: 'music-video-render.mp4',
      })}
    />
  );
};
