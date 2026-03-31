import type { CSSProperties } from 'react';
import { Video } from '@remotion/media';
import { AbsoluteFill, Img, interpolate, Sequence, useCurrentFrame, useVideoConfig } from 'remotion';
import type { RenderBackgroundSegment, RenderManifest } from '../../../lib/render';

type Props = {
  manifest: RenderManifest;
};

const getBeatImpact = (frame: number, fps: number, bpm: number | null, mode: RenderBackgroundSegment['motion']['mode']) => {
  if (!bpm || bpm <= 0 || mode === 'none') {
    return 0;
  }

  const beatFrames = (60 / bpm) * fps;
  const beatProgress = (frame % beatFrames) / beatFrames;

  if (mode === 'beat-pulse') {
    return (Math.sin(beatProgress * Math.PI * 2 - Math.PI / 2) + 1) / 2;
  }

  return Math.pow(1 - beatProgress, 3);
};

const BackgroundSegmentLayer = ({
  segment,
  bpm,
}: {
  segment: RenderBackgroundSegment;
  bpm: number | null;
}) => {
  const frame = useCurrentFrame();
  const { width, fps } = useVideoConfig();
  const transitionFrames = Math.min(
    segment.durationInFrames / 2,
    Math.max(0, Math.round(segment.transition.duration * fps)),
  );
  const beatImpact = getBeatImpact(frame, fps, bpm, segment.motion.mode);
  const motionStrength = segment.motion.strength;

  const zoomAmount = segment.motion.mode === 'kick-zoom'
    ? 1 + beatImpact * 0.14 * motionStrength
    : 1 + beatImpact * 0.035 * motionStrength;

  const fadeOpacity = segment.transition.kind === 'fade' && transitionFrames > 0
    ? interpolate(
      frame,
      [0, transitionFrames, Math.max(segment.durationInFrames - transitionFrames, transitionFrames), segment.durationInFrames],
      [0, 1, 1, 0],
      {
        extrapolateLeft: 'clamp',
        extrapolateRight: 'clamp',
      },
    )
    : 1;

  const slideTranslate = segment.transition.kind === 'slide' && transitionFrames > 0
    ? (
      interpolate(frame, [0, transitionFrames], [width * 0.08, 0], {
        extrapolateLeft: 'clamp',
        extrapolateRight: 'clamp',
      })
      + interpolate(
        frame,
        [Math.max(segment.durationInFrames - transitionFrames, transitionFrames), segment.durationInFrames],
        [0, -width * 0.08],
        {
          extrapolateLeft: 'clamp',
          extrapolateRight: 'clamp',
        },
      )
    )
    : 0;

  const mediaStyle: CSSProperties = {
    width: '100%',
    height: '100%',
    objectFit: 'cover',
    transform: `translate3d(${slideTranslate}px, 0, 0) scale(${zoomAmount})`,
    opacity: fadeOpacity,
  };

  return (
    <AbsoluteFill>
      {segment.visualType === 'image' && segment.src ? (
        <Img src={segment.src} style={mediaStyle} />
      ) : null}
      {segment.visualType === 'video' && segment.src ? (
        <Video src={segment.src} trimBefore={segment.trimBefore} muted style={mediaStyle} />
      ) : null}
      {(segment.visualType === 'gradient' || !segment.src) ? (
        <AbsoluteFill
          style={{
            background: `linear-gradient(145deg, ${segment.color}, #09090b 72%)`,
            ...mediaStyle,
          }}
        />
      ) : null}
      <AbsoluteFill
        style={{
          background: 'linear-gradient(180deg, rgba(0,0,0,0.12), rgba(0,0,0,0.45))',
        }}
      />
    </AbsoluteFill>
  );
};

export const BackgroundTrack = ({ manifest }: Props) => {
  return (
    <AbsoluteFill>
      {manifest.backgroundSegments.map((segment) => (
        <Sequence
          key={segment.id}
          from={segment.startFrame}
          durationInFrames={segment.durationInFrames}
        >
          <BackgroundSegmentLayer segment={segment} bpm={manifest.music?.bpm ?? null} />
        </Sequence>
      ))}
    </AbsoluteFill>
  );
};
