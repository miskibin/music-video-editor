import path from 'node:path';
import { bundle } from '@remotion/bundler';
import { renderMedia, selectComposition, type RenderMediaProgress } from '@remotion/renderer';
import { RENDER_COMPOSITION_ID, type RenderManifest } from '../render';

const getEntryPoint = () => path.join(process.cwd(), 'rendering', 'remotion', 'index.ts');
let bundlePromise: Promise<string> | null = null;

export const getRemotionBundle = () => {
  if (!bundlePromise) {
    bundlePromise = bundle({
      entryPoint: getEntryPoint(),
    });
  }

  return bundlePromise;
};

export const renderManifestToMp4 = async (
  manifest: RenderManifest,
  outputLocation: string,
  callbacks?: {
    onBundleStart?: () => void;
    onRenderProgress?: (progress: RenderMediaProgress) => void;
  },
) => {
  callbacks?.onBundleStart?.();
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
    onProgress: callbacks?.onRenderProgress,
  });
};
