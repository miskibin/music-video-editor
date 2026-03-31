import {
  AbsoluteFill,
  interpolate,
  Sequence,
  spring,
  useCurrentFrame,
  useVideoConfig,
} from 'remotion';
import type { RenderSubtitleCue, RenderSubtitleWord } from '../../../lib/render';
import type { SubtitleStyle } from '../../../lib/types';

const OUTLINE_LIKE_SHADOW = '0 0 2px rgba(0,0,0,0.95), 0 2px 12px rgba(0,0,0,0.85)';

function captionShadowForPreset(preset: SubtitleStyle['preset']): string | undefined {
  if (
    preset === 'outline'
    || preset === 'captions-cc'
    || preset === 'lyric-film'
    || preset === 'neon'
    || preset === 'hype'
  ) {
    return OUTLINE_LIKE_SHADOW;
  }
  return undefined;
}

type Props = {
  cues: RenderSubtitleCue[];
  subtitleStyle: SubtitleStyle;
};

const applyTextTransform = (text: string, mode: SubtitleStyle['textTransform']) => {
  if (mode === 'uppercase') {
    return text.toUpperCase();
  }
  if (mode === 'lowercase') {
    return text.toLowerCase();
  }
  return text;
};

const SubtitleCard = ({ cue, style }: { cue: RenderSubtitleCue; style: SubtitleStyle }) => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const mode = style.subtitleEntrance ?? 'none';

  const fadeFrames = Math.max(
    1,
    Math.round((style.entranceFadeDurationSec ?? 0.12) * fps),
  );

  let entrance = 1;
  let translateYPx = 0;
  let scale = 1;

  if (mode === 'none') {
    entrance = 1;
    translateYPx = 0;
    scale = 1;
  } else if (mode === 'fade') {
    entrance = interpolate(frame, [0, fadeFrames], [0, 1], {
      extrapolateLeft: 'clamp',
      extrapolateRight: 'clamp',
    });
    translateYPx = 0;
    scale = 1;
  } else {
    entrance = spring({
      fps,
      frame,
      config: {
        stiffness: style.entranceSpringStiffness ?? 420,
        damping: 26,
        mass: 0.62,
      },
    });
    translateYPx = 12 - entrance * 12;
    scale = 0.98 + entrance * 0.02;
  }

  const text = applyTextTransform(cue.text, style.textTransform);
  const bgRgba = (() => {
    let hex = style.backgroundColor.replace('#', '').trim();
    if (hex.length === 3) {
      hex = hex.split('').map((c) => c + c).join('');
    }
    if (hex.length < 6) {
      return `rgba(0,0,0,${style.backgroundOpacity})`;
    }
    const r = parseInt(hex.slice(0, 2), 16);
    const g = parseInt(hex.slice(2, 4), 16);
    const b = parseInt(hex.slice(4, 6), 16);
    if (Number.isNaN(r) || Number.isNaN(g) || Number.isNaN(b)) {
      return `rgba(0,0,0,${style.backgroundOpacity})`;
    }
    return `rgba(${r},${g},${b},${style.backgroundOpacity})`;
  })();

  const letterSpacingPx = style.fontSize * style.letterSpacing;

  const activeWordIndex =
    style.wordHighlightMode === 'karaoke' && cue.words.length > 0
      ? cue.words.findIndex((word) => {
        const relStart = word.startFrame - cue.startFrame;
        const relEnd = word.endFrame - cue.startFrame;
        return frame >= relStart && frame < relEnd;
      })
      : -1;

  const renderKaraoke = () => {
    if (style.wordHighlightMode !== 'karaoke' || cue.words.length === 0) {
      return text;
    }

    /** Between timed words, findIndex is -1; old logic treated that as “all bright” and caused flashing. */
    const inactiveOpacity = 0.42;

    const words = cue.words.map((word: RenderSubtitleWord, index: number) => {
      const raw = word.text.replace(/\s+/g, ' ').trim();
      const piece = applyTextTransform(raw, style.textTransform);
      const isActive = activeWordIndex >= 0 && index === activeWordIndex;
      const opacity = isActive ? 1 : inactiveOpacity;
      return (
        <span
          key={word.id}
          style={{
            opacity,
            marginRight: '0.25em',
            whiteSpace: 'nowrap',
          }}
        >
          {piece}
        </span>
      );
    });

    /** Single line: no wrapping between words (typical karaoke). Long lines may extend; tune max width / size in the editor. */
    return (
      <span
        style={{
          display: 'inline-block',
          maxWidth: '100%',
          whiteSpace: 'nowrap',
          textAlign: 'center',
        }}
      >
        {words}
      </span>
    );
  };

  return (
    <AbsoluteFill
      style={{
        justifyContent: 'flex-end',
        alignItems: 'center',
        padding: `0 ${style.horizontalPaddingPx}px ${style.bottomOffsetPx}px`,
      }}
    >
      <div
        style={{
          maxWidth: `${style.maxWidthPercent}%`,
          borderRadius: style.borderRadiusPx,
          border: '1px solid rgba(255,255,255,0.14)',
          backgroundColor: bgRgba,
          color: style.textColor,
          padding: '18px 28px',
          textAlign: 'center',
          fontSize: style.fontSize,
          fontWeight: style.fontWeight,
          lineHeight: 1.15,
          letterSpacing: `${letterSpacingPx}px`,
          backdropFilter: `blur(${style.backdropBlurPx}px)`,
          boxShadow: '0 18px 48px rgba(0, 0, 0, 0.35)',
          textShadow: captionShadowForPreset(style.preset),
          transform: `translateY(${translateYPx}px) scale(${scale})`,
          opacity: entrance * style.textOpacity,
          ...(style.wordHighlightMode === 'karaoke' && cue.words.length > 0
            ? { overflow: 'visible' as const }
            : {}),
        }}
      >
        {style.wordHighlightMode === 'karaoke' && cue.words.length > 0 ? renderKaraoke() : text}
      </div>
    </AbsoluteFill>
  );
};

export const SubtitleTrack = ({ cues, subtitleStyle }: Props) => {
  return (
    <AbsoluteFill>
      {cues.map((cue) => (
        <Sequence
          key={cue.id}
          from={cue.startFrame}
          durationInFrames={cue.durationInFrames}
        >
          <SubtitleCard cue={cue} style={subtitleStyle} />
        </Sequence>
      ))}
    </AbsoluteFill>
  );
};
