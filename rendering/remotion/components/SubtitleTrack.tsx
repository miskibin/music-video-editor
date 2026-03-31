import { AbsoluteFill, Sequence, spring, useCurrentFrame, useVideoConfig } from 'remotion';
import type { RenderSubtitleCue, RenderSubtitleWord } from '../../../lib/render';
import type { SubtitleStyle } from '../../../lib/types';

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
  const entrance = spring({
    fps,
    frame,
    config: {
      damping: 200,
      mass: 0.9,
      stiffness: 180,
    },
  });

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

    return cue.words.map((word: RenderSubtitleWord, index: number) => {
      const piece = applyTextTransform(word.text, style.textTransform);
      const dim = activeWordIndex >= 0 && index !== activeWordIndex ? 0.45 : 1;
      return (
        <span
          key={word.id}
          style={{
            opacity: dim * style.textOpacity,
            marginRight: '0.25em',
          }}
        >
          {piece}
        </span>
      );
    });
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
          textShadow: style.preset === 'outline'
            ? '0 0 2px rgba(0,0,0,0.95), 0 2px 12px rgba(0,0,0,0.85)'
            : undefined,
          transform: `translateY(${18 - entrance * 18}px) scale(${0.97 + entrance * 0.03})`,
          opacity: entrance * style.textOpacity,
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
