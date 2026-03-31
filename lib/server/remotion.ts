import path from 'node:path';
import { bundle } from '@remotion/bundler';
import { renderMedia, selectComposition } from '@remotion/renderer';
import { RENDER_COMPOSITION_ID, type RenderManifest } from '@/lib/render';

const getEntryPoint = () => path.join(process.cwd(), 'rendering', 'remotion', 'index.ts');

export const getRemotionBundle = () => bundle({
  entryPoint: getEntryPoint(),
});

export const renderManifestToMp4 = async (
  manifest: RenderManifest,
  outputLocation: string,
) => {
  const serveUrl = await getRemotionBundle();
  const inputProps = { manifest };
  const composition = await selectComposition({
    serveUrl,
    id: RENDER_COMPOSITION_ID,
    inputProps,
  });

  await renderMedia({
    serveUrl,
    composition,
    codec: 'h264',
    audioCodec: 'aac',
    outputLocation,
    inputProps,
    logLevel: 'error',
  });
};
