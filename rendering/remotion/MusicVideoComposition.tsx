import { Audio } from '@remotion/media';
import { AbsoluteFill, interpolate, Sequence } from 'remotion';
import type { MusicVideoCompositionProps } from './Root';
import { BackgroundTrack } from './components/BackgroundTrack';
import { SubtitleTrack } from './components/SubtitleTrack';

export const MusicVideoComposition = ({ manifest }: MusicVideoCompositionProps) => {
  const musicVolume = (frame: number) => {
    const m = manifest.music;
    if (!m) {
      return 1;
    }
    const dur = m.durationInFrames;
    const fi = m.fadeInFrames;
    const fo = m.fadeOutFrames;
    let v = 1;
    if (fi > 0 && frame < fi) {
      v *= interpolate(frame, [0, fi], [0, 1], { extrapolateRight: 'clamp' });
    }
    if (fo > 0 && frame >= dur - fo) {
      v *= interpolate(frame, [dur - fo, dur], [1, 0], { extrapolateLeft: 'clamp' });
    }
    return v;
  };

  return (
    <AbsoluteFill style={{ backgroundColor: '#000000' }}>
      <BackgroundTrack manifest={manifest} />
      {manifest.music ? (
        <Sequence durationInFrames={manifest.music.durationInFrames}>
          <Audio
            src={manifest.music.src}
            trimBefore={manifest.music.trimBefore}
            trimAfter={manifest.music.trimAfter}
            volume={musicVolume}
          />
        </Sequence>
      ) : null}
      <SubtitleTrack cues={manifest.subtitleCues} subtitleStyle={manifest.subtitleStyle} />
    </AbsoluteFill>
  );
};
