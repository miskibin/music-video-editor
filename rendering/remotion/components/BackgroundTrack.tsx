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
  absoluteFrame: number,
  fps: number,
  bpm: number | null,
  mode: MotionConfig['mode'],
  motion: MotionConfig,
) => {
  if (mode !== 'beat-pulse' && mode !== 'kick-zoom') {
    return 0;
  }
  if (!bpm || bpm <= 0) {
    return 0;
  }

  const mult = Math.max(0.25, motion.frequencyMultiplier);
  const beatFrames = ((60 / bpm) * fps) / mult;
  const beatProgress = (absoluteFrame % beatFrames) / beatFrames;
  const sens = motion.sensitivity;

  let raw =
    mode === 'beat-pulse'
      ? (Math.sin(beatProgress * Math.PI * 2 - Math.PI / 2) + 1) / 2
      : Math.exp(-beatProgress * (6 + motion.decay * 5));

  raw = raw * sens + (1 - sens) * 0.35;
  const smooth = motion.smoothness;
  raw = raw * (1 - smooth * 0.35) + smooth * 0.2;

  return Math.min(1, Math.max(0, raw));
};

/** Fade in/out using segment `ease` (not hardcoded easeInOut). */
const fadeInOut = (
  frame: number,
  durationInFrames: number,
  transitionFrames: number,
  easing: (t: number) => number,
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
      easing,
    },
  );

  const endFade = interpolate(
    frame,
    [Math.max(durationInFrames - transitionFrames, transitionFrames), durationInFrames],
    [1, 0],
    {
      extrapolateLeft: 'clamp',
      extrapolateRight: 'clamp',
      easing,
    },
  );

  return startFade * endFade;
};

/**
 * True crossfade: overlapping segments with linear ramps so A↓ and B↑ meet at the cut.
 * (Per-segment easeInOut fades look like mushy “ease” blends, not a crossfade.)
 */
const crossfadeOpacity = (
  compositionFrame: number,
  segStart: number,
  segEnd: number,
  overlapFrames: number,
  segmentIndex: number,
  segmentCount: number,
) => {
  const T = Math.max(1, overlapFrames);
  const rampIn =
    segmentIndex === 0
      ? 1
      : interpolate(
        compositionFrame,
        [segStart - T, segStart],
        [0, 1],
        {
          extrapolateLeft: 'clamp',
          extrapolateRight: 'clamp',
          easing: Easing.linear,
        },
      );
  const rampOut =
    segmentIndex === segmentCount - 1
      ? 1
      : interpolate(
        compositionFrame,
        [segEnd - T, segEnd],
        [1, 0],
        {
          extrapolateLeft: 'clamp',
          extrapolateRight: 'clamp',
          easing: Easing.linear,
        },
      );
  return rampIn * rampOut;
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

type SegmentLayerProps = {
  segment: RenderBackgroundSegment;
  bpm: number | null;
  segmentIndex: number;
  segmentCount: number;
  sequenceFrom: number;
  overlapFrames: number;
  isCrossfade: boolean;
};

const BackgroundSegmentLayer = ({
  segment,
  bpm,
  segmentIndex,
  segmentCount,
  sequenceFrom,
  overlapFrames,
  isCrossfade,
}: SegmentLayerProps) => {
  const frame = useCurrentFrame();
  const { width, fps } = useVideoConfig();
  const compositionFrame = sequenceFrom + frame;

  const transitionFrames = Math.min(
    segment.durationInFrames / 2,
    Math.max(0, Math.round(segment.transition.duration * fps)),
  );
  const kind = segment.transition.kind;
  const ease = easeFn(segment.transition.ease ?? 'easeInOut');

  /** Local frame aligned to segment media start (crossfade pre-roll shifts Sequence.from earlier). */
  const effectFrame = Math.max(
    0,
    frame - (isCrossfade && segmentIndex > 0 ? overlapFrames : 0),
  );

  const beatImpact = getBeatImpact(compositionFrame, fps, bpm, segment.motion.mode, segment.motion);
  const motionStrength = segment.motion.strength;

  const beatZoomDelta =
    segment.motion.mode === 'kick-zoom'
      ? beatImpact * 0.14 * motionStrength
      : segment.motion.mode === 'beat-pulse'
        ? beatImpact * 0.035 * motionStrength
        : 0;
  const zoomMotion = 1 + beatZoomDelta;

  const mode = segment.motion.mode;
  const clipLen = Math.max(1, segment.durationInFrames - 1);
  const clipT = Math.min(1, Math.max(0, effectFrame / clipLen));
  const slowAmp = 0.12 * motionStrength;
  let slowZoomFactor = 1;
  if (mode === 'slow-zoom-in') {
    slowZoomFactor = 1 + slowAmp * clipT;
  } else if (mode === 'slow-zoom-out') {
    slowZoomFactor = 1 + slowAmp * (1 - clipT);
  } else if (mode === 'slow-breathe') {
    slowZoomFactor = 1 + slowAmp * Math.sin(Math.PI * clipT);
  }

  let fadeOpacity = 1;
  let slideTranslate = 0;
  let zoomTransition = 1;

  if (isCrossfade) {
    const segStart = segment.startFrame;
    const segEnd = segment.startFrame + segment.durationInFrames;
    fadeOpacity = crossfadeOpacity(
      compositionFrame,
      segStart,
      segEnd,
      overlapFrames,
      segmentIndex,
      segmentCount,
    );
  } else if (kind === 'fade' || kind === 'crossfade') {
    fadeOpacity = fadeInOut(effectFrame, segment.durationInFrames, transitionFrames, ease);
  } else if (kind === 'flash') {
    fadeOpacity = flashOpacity(effectFrame, segment.durationInFrames, transitionFrames);
  } else if (kind === 'slide' || kind === 'slide-left' || kind === 'slide-right' || kind === 'zoom') {
    fadeOpacity = fadeInOut(effectFrame, segment.durationInFrames, transitionFrames, ease);
  }

  if (kind === 'slide' && transitionFrames > 0) {
    slideTranslate = (
      interpolate(effectFrame, [0, transitionFrames], [width * 0.08, 0], {
        extrapolateLeft: 'clamp',
        extrapolateRight: 'clamp',
        easing: ease,
      })
      + interpolate(
        effectFrame,
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
      interpolate(effectFrame, [0, transitionFrames], [-width * 0.1, 0], {
        extrapolateLeft: 'clamp',
        extrapolateRight: 'clamp',
        easing: ease,
      })
      + interpolate(
        effectFrame,
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
      interpolate(effectFrame, [0, transitionFrames], [width * 0.1, 0], {
        extrapolateLeft: 'clamp',
        extrapolateRight: 'clamp',
        easing: ease,
      })
      + interpolate(
        effectFrame,
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
      interpolate(effectFrame, [0, transitionFrames], [0.92, 1], {
        extrapolateLeft: 'clamp',
        extrapolateRight: 'clamp',
        easing: Easing.out(Easing.cubic),
      })
      * interpolate(
        effectFrame,
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

  const zoomAmount = zoomMotion * zoomTransition * slowZoomFactor;

  const mediaStyle: CSSProperties = {
    width: '100%',
    height: '100%',
    objectFit: 'cover',
    transform: `translate3d(${slideTranslate}px, 0, 0) scale(${zoomAmount})`,
    opacity: fadeOpacity,
  };

  return (
    <AbsoluteFill style={{ zIndex: segmentIndex + 1 }}>
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
  const sorted = [...manifest.backgroundSegments].sort((a, b) => a.startFrame - b.startFrame);
  const { fps } = useVideoConfig();
  const n = sorted.length;

  return (
    <AbsoluteFill>
      {sorted.map((segment, i) => {
        const kind = segment.transition.kind;
        const isCrossfade = kind === 'crossfade';
        const requestedT = Math.max(0, Math.round(segment.transition.duration * fps));
        const next = i < n - 1 ? sorted[i + 1] : null;
        const prev = i > 0 ? sorted[i - 1] : null;

        const maxOverlapNext = next
          ? Math.min(Math.floor(segment.durationInFrames / 2), Math.floor(next.durationInFrames / 2))
          : segment.durationInFrames;
        const maxOverlapPrev = prev
          ? Math.min(Math.floor(segment.durationInFrames / 2), Math.floor(prev.durationInFrames / 2))
          : segment.durationInFrames;
        const overlapFrames = isCrossfade
          ? Math.max(1, Math.min(requestedT, maxOverlapNext, maxOverlapPrev))
          : requestedT;

        const segStart = segment.startFrame;
        const sequenceFrom = isCrossfade && i > 0 ? segStart - overlapFrames : segStart;
        const sequenceDurationInFrames = isCrossfade
          ? segment.durationInFrames + (i > 0 ? overlapFrames : 0) + (i < n - 1 ? overlapFrames : 0)
          : segment.durationInFrames;

        return (
          <Sequence
            key={segment.id}
            from={sequenceFrom}
            durationInFrames={sequenceDurationInFrames}
          >
            <BackgroundSegmentLayer
              segment={segment}
              bpm={manifest.music?.bpm ?? null}
              segmentIndex={i}
              segmentCount={n}
              sequenceFrom={sequenceFrom}
              overlapFrames={overlapFrames}
              isCrossfade={isCrossfade}
            />
          </Sequence>
        );
      })}
    </AbsoluteFill>
  );
};
