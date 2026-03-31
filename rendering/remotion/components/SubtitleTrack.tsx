import { AbsoluteFill, Sequence, spring, useCurrentFrame, useVideoConfig } from 'remotion';
import type { RenderSubtitleCue } from '../../../lib/render';

type Props = {
  cues: RenderSubtitleCue[];
};

const SubtitleCard = ({ text }: { text: string }) => {
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

  return (
    <AbsoluteFill
      style={{
        justifyContent: 'flex-end',
        alignItems: 'center',
        padding: '0 64px 120px',
      }}
    >
      <div
        style={{
          maxWidth: '82%',
          borderRadius: 28,
          border: '1px solid rgba(255,255,255,0.14)',
          backgroundColor: 'rgba(0,0,0,0.58)',
          color: '#ffffff',
          padding: '18px 28px',
          textAlign: 'center',
          fontSize: 46,
          fontWeight: 700,
          lineHeight: 1.15,
          letterSpacing: '-0.03em',
          backdropFilter: 'blur(18px)',
          boxShadow: '0 18px 48px rgba(0, 0, 0, 0.35)',
          transform: `translateY(${18 - entrance * 18}px) scale(${0.97 + entrance * 0.03})`,
          opacity: entrance,
        }}
      >
        {text}
      </div>
    </AbsoluteFill>
  );
};

export const SubtitleTrack = ({ cues }: Props) => {
  return (
    <AbsoluteFill>
      {cues.map((cue) => (
        <Sequence
          key={cue.id}
          from={cue.startFrame}
          durationInFrames={cue.durationInFrames}
        >
          <SubtitleCard text={cue.text} />
        </Sequence>
      ))}
    </AbsoluteFill>
  );
};
