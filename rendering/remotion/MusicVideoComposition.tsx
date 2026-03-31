import { Audio } from '@remotion/media';
import { AbsoluteFill, Sequence } from 'remotion';
import type { MusicVideoCompositionProps } from './Root';
import { BackgroundTrack } from './components/BackgroundTrack';
import { SubtitleTrack } from './components/SubtitleTrack';

export const MusicVideoComposition = ({ manifest }: MusicVideoCompositionProps) => {
  return (
    <AbsoluteFill style={{ backgroundColor: '#000000' }}>
      <BackgroundTrack manifest={manifest} />
      {manifest.music ? (
        <Sequence durationInFrames={manifest.music.durationInFrames}>
          <Audio src={manifest.music.src} trimBefore={manifest.music.trimBefore} />
        </Sequence>
      ) : null}
      <SubtitleTrack cues={manifest.subtitleCues} />
    </AbsoluteFill>
  );
};
