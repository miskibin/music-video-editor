import type { CSSProperties } from 'react';
import { Video } from '@remotion/media';
import {
  AbsoluteFill,
  Easing,
  Img,
  interpolate,
  Sequence,
  useCurrentFrame,
  useVideoConfig,
} from 'remotion';
import type { RenderBackgroundSegment, RenderManifest } from '../../../lib/render';
import type { MotionConfig, TransitionConfig } from '../../../lib/types';

type Props = {
  manifest: RenderManifest;
};

const easeFn = (ease: TransitionConfig['ease']) => {
  switch (ease) {
    case 'linear':
      return Easing.linear;
    case 'easeIn':
      return Easing.in(Easing.cubic);
    case 'easeOut':
      return Easing.out(Easing.cubic);
    case 'easeInOut':
    default:
      return Easing.inOut(Easing.cubic);
  }
};

const getBeatImpact = (
  frame: number,
  fps: number,
  bpm: number | null,
  mode: MotionConfig['mode'],
  motion: MotionConfig,
) => {
  if (!bpm || bpm <= 0 || mode === 'none') {
    return 0;
  }

  const mult = Math.max(0.25, motion.frequencyMultiplier);
  const beatFrames = ((60 / bpm) * fps) / mult;
  const beatProgress = (frame % beatFrames) / beatFrames;
  const sens = motion.sensitivity;

  let raw =
    mode === 'beat-pulse'
      ? (Math.sin(beatProgress * Math.PI * 2 - Math.PI / 2) + 1) / 2
      : Math.pow(1 - beatProgress, 2 + motion.decay * 4);

  raw = raw * sens + (1 - sens) * 0.35;
  const smooth = motion.smoothness;
  raw = raw * (1 - smooth * 0.35) + smooth * 0.2;

  return Math.min(1, Math.max(0, raw));
};

const fadeInOut = (
  frame: number,
  durationInFrames: number,
  transitionFrames: number,
) => {
  if (transitionFrames <= 0) {
    return 1;
  }

  const startFade = interpolate(
    frame,
    [0, transitionFrames],
    [0, 1],
    {
      extrapolateLeft: 'clamp',
      extrapolateRight: 'clamp',
      easing: Easing.inOut(Easing.cubic),
    },
  );

  const endFade = interpolate(
    frame,
    [Math.max(durationInFrames - transitionFrames, transitionFrames), durationInFrames],
    [1, 0],
    {
      extrapolateLeft: 'clamp',
      extrapolateRight: 'clamp',
      easing: Easing.inOut(Easing.cubic),
    },
  );

  return startFade * endFade;
};

const flashOpacity = (
  frame: number,
  durationInFrames: number,
  transitionFrames: number,
) => {
  if (transitionFrames <= 0) {
    return 1;
  }

  const head = interpolate(
    frame,
    [0, transitionFrames],
    [0.25, 1],
    { extrapolateRight: 'clamp', easing: Easing.out(Easing.quad) },
  );

  const tail = interpolate(
    frame,
    [Math.max(durationInFrames - transitionFrames, transitionFrames), durationInFrames],
    [1, 0.25],
    { extrapolateLeft: 'clamp', easing: Easing.in(Easing.quad) },
  );

  return head * tail;
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
  const kind = segment.transition.kind;
  const ease = easeFn(segment.transition.ease ?? 'easeInOut');

  const beatImpact = getBeatImpact(frame, fps, bpm, segment.motion.mode, segment.motion);
  const motionStrength = segment.motion.strength;

  const zoomMotion = segment.motion.mode === 'kick-zoom'
    ? 1 + beatImpact * 0.14 * motionStrength
    : 1 + beatImpact * 0.035 * motionStrength;

  let fadeOpacity = 1;
  let slideTranslate = 0;
  let zoomTransition = 1;

  if (kind === 'fade' || kind === 'crossfade') {
    fadeOpacity = fadeInOut(frame, segment.durationInFrames, transitionFrames);
  } else if (kind === 'flash') {
    fadeOpacity = flashOpacity(frame, segment.durationInFrames, transitionFrames);
  } else if (kind === 'slide' || kind === 'slide-left' || kind === 'slide-right' || kind === 'zoom') {
    fadeOpacity = fadeInOut(frame, segment.durationInFrames, transitionFrames);
  }

  if (kind === 'slide' && transitionFrames > 0) {
    slideTranslate = (
      interpolate(frame, [0, transitionFrames], [width * 0.08, 0], {
        extrapolateLeft: 'clamp',
        extrapolateRight: 'clamp',
        easing: ease,
      })
      + interpolate(
        frame,
        [Math.max(segment.durationInFrames - transitionFrames, transitionFrames), segment.durationInFrames],
        [0, -width * 0.08],
        {
          extrapolateLeft: 'clamp',
          extrapolateRight: 'clamp',
          easing: ease,
        },
      )
    );
  } else if (kind === 'slide-left' && transitionFrames > 0) {
    slideTranslate = (
      interpolate(frame, [0, transitionFrames], [-width * 0.1, 0], {
        extrapolateLeft: 'clamp',
        extrapolateRight: 'clamp',
        easing: ease,
      })
      + interpolate(
        frame,
        [Math.max(segment.durationInFrames - transitionFrames, transitionFrames), segment.durationInFrames],
        [0, -width * 0.08],
        {
          extrapolateLeft: 'clamp',
          extrapolateRight: 'clamp',
          easing: ease,
        },
      )
    );
  } else if (kind === 'slide-right' && transitionFrames > 0) {
    slideTranslate = (
      interpolate(frame, [0, transitionFrames], [width * 0.1, 0], {
        extrapolateLeft: 'clamp',
        extrapolateRight: 'clamp',
        easing: ease,
      })
      + interpolate(
        frame,
        [Math.max(segment.durationInFrames - transitionFrames, transitionFrames), segment.durationInFrames],
        [0, width * 0.08],
        {
          extrapolateLeft: 'clamp',
          extrapolateRight: 'clamp',
          easing: ease,
        },
      )
    );
  }

  if (kind === 'zoom' && transitionFrames > 0) {
    zoomTransition = (
      interpolate(frame, [0, transitionFrames], [0.92, 1], {
        extrapolateLeft: 'clamp',
        extrapolateRight: 'clamp',
        easing: Easing.out(Easing.cubic),
      })
      * interpolate(
        frame,
        [Math.max(segment.durationInFrames - transitionFrames, transitionFrames), segment.durationInFrames],
        [1, 0.94],
        {
          extrapolateLeft: 'clamp',
          extrapolateRight: 'clamp',
          easing: Easing.in(Easing.cubic),
        },
      )
    );
  }

  const zoomAmount = zoomMotion * zoomTransition;

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
