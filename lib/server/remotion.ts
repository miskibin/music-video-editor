import path from 'node:path';
import { bundle } from '@remotion/bundler';
import { renderMedia, selectComposition, type RenderMediaProgress } from '@remotion/renderer';
import { RENDER_COMPOSITION_ID, type RenderManifest } from '../render';

const getEntryPoint = () => path.join(process.cwd(), 'rendering', 'remotion', 'index.ts');
let bundlePromise: Promise<string> | null = null;

const debugLog = (payload: {
  runId: string;
  hypothesisId: string;
  location: string;
  message: string;
  data?: Record<string, unknown>;
}) => {
  const line = `${JSON.stringify({
    sessionId: '35e18a',
    timestamp: Date.now(),
    ...payload,
  })}\n`;
  // Best-effort local fallback (in case HTTP ingest is unreachable)
  // #region agent log
  void import('node:fs/promises')
    .then((m) => m.appendFile(path.join(process.cwd(), 'debug-35e18a.log'), line, 'utf8'))
    .catch(() => {});
  // #endregion
  // #region agent log
  fetch('http://127.0.0.1:7519/ingest/94b95f73-1e6f-469d-99e1-3b8fd84e110f', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'X-Debug-Session-Id': '35e18a' },
    body: JSON.stringify({
      sessionId: '35e18a',
      timestamp: Date.now(),
      ...payload,
    }),
  }).catch(() => {});
  // #endregion
};

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
  debugLog({
    runId: 'pre-fix',
    hypothesisId: 'D',
    location: 'lib/server/remotion.ts:renderManifestToMp4:bundle-start',
    message: 'Remotion bundle requested',
    data: {
      outputLocation,
      durationInFrames: manifest.durationInFrames,
      fps: manifest.fps,
      assetSourceCount: Object.keys(manifest.assetSources ?? {}).length,
    },
  });
  const serveUrl = await getRemotionBundle();
  debugLog({
    runId: 'pre-fix',
    hypothesisId: 'D',
    location: 'lib/server/remotion.ts:renderManifestToMp4:bundle-ready',
    message: 'Remotion bundle ready',
    data: { serveUrl },
  });
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
    /** First frame can exceed 30s when loading media; delayRender() uses this cap. */
    timeoutInMilliseconds: 180_000,
    overwrite: true,
  });
};
