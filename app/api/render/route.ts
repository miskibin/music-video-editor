import { parseProjectDocument } from '@/lib/project';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { fileURLToPath } from 'node:url';
import { promises as fs } from 'node:fs';
import {
  createRenderManifest,
  getReferencedRenderAssetIds,
  sanitizeOutputName,
} from '@/lib/render';
import {
  cleanupRenderJob,
  createRenderJobId,
  ensureRenderJobWorkspace,
  getRenderOutputPath,
  stageRenderAsset,
  writeRenderAssetIndex,
  writeRenderJobMetadata,
} from '@/lib/server/render-jobs';
import { trimAudioWithFfmpeg } from '@/lib/server/ffmpeg';
import {
  createRenderJobStatus,
  deleteRenderJobStatus,
  updateRenderJobStatus,
} from '@/lib/server/render-status';
import { renderManifestToMp4 } from '@/lib/server/remotion';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const maxDuration = 300;

const getErrorMessage = (error: unknown) => error instanceof Error ? error.message : 'Render failed.';
const FILE_CLEANUP_DELAY_MS = 10 * 60 * 1000;

const debugLog = (payload: {
  runId: string;
  hypothesisId: string;
  location: string;
  message: string;
  data?: Record<string, unknown>;
}) => {
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

const maybePretrimMusicAsset = async (
  jobId: string,
  project: ReturnType<typeof parseProjectDocument>,
  assetIndexRecord: Record<string, Awaited<ReturnType<typeof stageRenderAsset>>>,
) => {
  const musicClip = project.music.clip;
  const musicAssetId = musicClip?.assetId;
  if (!musicClip || !musicAssetId) {
    return false;
  }

  const stagedMusicAsset = assetIndexRecord[musicAssetId];
  if (!stagedMusicAsset) {
    return false;
  }

  const trimStart = Math.max(0, musicClip.trimStart ?? 0);
  const duration = Math.max(0, musicClip.duration);
  const sourceDuration = Math.max(duration, musicClip.sourceDuration ?? duration);
  const shouldPretrim = trimStart > 0 || duration < sourceDuration;

  if (!shouldPretrim) {
    return false;
  }

  const { assetsDir } = await ensureRenderJobWorkspace(jobId);
  const trimmedFilePath = path.join(assetsDir, `${musicAssetId}-trimmed.m4a`);

  await trimAudioWithFfmpeg({
    inputPath: stagedMusicAsset.filePath,
    outputPath: trimmedFilePath,
    startSeconds: trimStart,
    durationSeconds: duration,
  });

  assetIndexRecord[musicAssetId] = {
    assetId: musicAssetId,
    filePath: trimmedFilePath,
    fileName: `${musicAssetId}-trimmed.m4a`,
    mimeType: 'audio/mp4',
  };

  return true;
};

const processRenderJob = async (
  jobId: string,
  manifest: ReturnType<typeof createRenderManifest>,
  outputPath: string,
  downloadName: string,
) => {
  const totalFrames = Math.max(manifest.durationInFrames, 1);

  try {
    updateRenderJobStatus(jobId, {
      state: 'bundling',
      progress: 0.12,
      message: 'Bundling Remotion composition...',
      outputPath: null,
      downloadName,
      errorMessage: null,
    });

    await renderManifestToMp4(manifest, outputPath, {
      onBundleStart: () => {
        updateRenderJobStatus(jobId, {
          state: 'bundling',
          progress: 0.16,
          message: 'Preparing render bundle...',
        });
      },
      onRenderProgress: (progress) => {
        const renderedRatio = Math.max(0, Math.min(1, progress.renderedFrames / totalFrames));
        const encodedRatio = Math.max(0, Math.min(1, progress.encodedFrames / totalFrames));
        const remotionOverall = Math.max(0, Math.min(1, progress.progress));

        let percent = 0.18 + remotionOverall * 0.68;
        let message = `Rendering ${Math.round(remotionOverall * 100)}% — frames ${progress.renderedFrames}/${totalFrames}`;

        if (renderedRatio >= 0.999) {
          percent = 0.86 + encodedRatio * 0.1;
          message = progress.stitchStage === 'muxing'
            ? `Finalizing video ${Math.round(encodedRatio * 100)}%`
            : `Encoding video ${Math.round(encodedRatio * 100)}% (${progress.encodedFrames}/${totalFrames})`;
        }

        updateRenderJobStatus(jobId, {
          state: 'rendering',
          progress: Math.max(0.18, Math.min(0.98, percent)),
          message,
        });
      },
    });

    updateRenderJobStatus(jobId, {
      state: 'completed',
      progress: 1,
      message: 'Render complete. Download ready.',
      outputPath,
      downloadName,
      errorMessage: null,
    });
  } catch (error) {
    updateRenderJobStatus(jobId, {
      state: 'error',
      progress: 1,
      message: 'Render failed.',
      errorMessage: getErrorMessage(error),
    });
  } finally {
    setTimeout(() => {
      void cleanupRenderJob(jobId);
      deleteRenderJobStatus(jobId);
    }, FILE_CLEANUP_DELAY_MS);
  }
};

export async function POST(request: Request) {
  const jobId = createRenderJobId();
  createRenderJobStatus(jobId);

  try {
    debugLog({
      runId: 'pre-fix',
      hypothesisId: 'A',
      location: 'app/api/render/route.ts:POST:job-start',
      message: 'Render job start',
      data: { jobId },
    });
    updateRenderJobStatus(jobId, {
      state: 'staging',
      progress: 0.02,
      message: 'Reading project payload...',
    });

    const formData = await request.formData();
    const rawProject = formData.get('project');
    if (typeof rawProject !== 'string') {
      deleteRenderJobStatus(jobId);
      await cleanupRenderJob(jobId);
      return Response.json({ detail: 'Missing project payload.' }, { status: 400 });
    }

    const parsedProject = parseProjectDocument(JSON.parse(rawProject));
    if (!parsedProject.music.clip?.assetId) {
      deleteRenderJobStatus(jobId);
      await cleanupRenderJob(jobId);
      return Response.json({ detail: 'Upload music before rendering.' }, { status: 400 });
    }

    const assetIndexRecord: Record<string, Awaited<ReturnType<typeof stageRenderAsset>>> = {};
    const referencedAssets = getReferencedRenderAssetIds(parsedProject);

    debugLog({
      runId: 'pre-fix',
      hypothesisId: 'A',
      location: 'app/api/render/route.ts:POST:referenced-assets',
      message: 'Referenced assets computed',
      data: { jobId, referencedAssetCount: referencedAssets.length, referencedAssets: referencedAssets.slice(0, 30) },
    });

    for (const [index, assetId] of referencedAssets.entries()) {
      updateRenderJobStatus(jobId, {
        state: 'staging',
        progress: 0.04 + ((index + 1) / Math.max(referencedAssets.length, 1)) * 0.08,
        message: `Staging asset ${index + 1} of ${referencedAssets.length}...`,
      });

      const field = formData.get(`asset:${assetId}`);
      if (!(field instanceof File)) {
        deleteRenderJobStatus(jobId);
        await cleanupRenderJob(jobId);
        return Response.json({ detail: `Missing referenced asset "${assetId}".` }, { status: 400 });
      }

      const asset = parsedProject.assets[assetId];
      const stagedAsset = await stageRenderAsset(
        jobId,
        assetId,
        field,
        asset?.name ?? `${assetId}.bin`,
        asset?.mimeType ?? field.type ?? 'application/octet-stream',
      );

      assetIndexRecord[assetId] = stagedAsset;

      const stagedSize = await fs.stat(stagedAsset.filePath).then((s) => s.size).catch(() => null);
      debugLog({
        runId: 'pre-fix',
        hypothesisId: 'A',
        location: 'app/api/render/route.ts:POST:staged-asset',
        message: 'Asset staged to disk',
        data: {
          jobId,
          assetId,
          originalFileName: field.name,
          stagedFileName: stagedAsset.fileName,
          stagedFilePath: stagedAsset.filePath,
          stagedSize,
          mimeType: stagedAsset.mimeType,
        },
      });
    }

    updateRenderJobStatus(jobId, {
      state: 'staging',
      progress: 0.095,
      message: 'Preparing trimmed music window...',
    });

    const audioAlreadyTrimmed = await maybePretrimMusicAsset(jobId, parsedProject, assetIndexRecord);

    await writeRenderAssetIndex(jobId, assetIndexRecord);

    /** Local file URLs — HTTP asset URLs often hang headless Chromium on Windows (localhost / IPv6). */
    const assetSources: Record<string, string> = {};
    for (const assetId of referencedAssets) {
      const entry = assetIndexRecord[assetId];
      if (!entry) {
        deleteRenderJobStatus(jobId);
        await cleanupRenderJob(jobId);
        return Response.json({ detail: `Missing staged asset "${assetId}".` }, { status: 400 });
      }
      assetSources[assetId] = pathToFileURL(path.resolve(entry.filePath)).href;
    }

    const assetSourceSamples = referencedAssets.slice(0, 20).map((assetId) => ({
      assetId,
      href: assetSources[assetId],
      filePath: (() => {
        try {
          return fileURLToPath(assetSources[assetId] ?? '');
        } catch {
          return null;
        }
      })(),
    }));
    const assetExistChecks = await Promise.all(
      referencedAssets.slice(0, 50).map(async (assetId) => {
        const href = assetSources[assetId];
        let filePath: string | null = null;
        try {
          filePath = fileURLToPath(href);
        } catch {
          return { assetId, href, ok: false, reason: 'fileURLToPath-failed' };
        }
        const size = await fs.stat(filePath).then((s) => s.size).catch(() => null);
        return { assetId, href, filePath, ok: typeof size === 'number' && size > 0, size };
      }),
    );
    debugLog({
      runId: 'pre-fix',
      hypothesisId: 'B',
      location: 'app/api/render/route.ts:POST:asset-sources',
      message: 'Asset sources built (file://)',
      data: { jobId, samples: assetSourceSamples, checks: assetExistChecks },
    });

    const manifest = createRenderManifest(parsedProject, assetSources, undefined, {
      audioAlreadyTrimmed,
    });
    const outputPath = getRenderOutputPath(jobId);
    const downloadName = `${sanitizeOutputName(parsedProject.name)}.mp4`;
    await writeRenderJobMetadata(jobId, { downloadName });

    updateRenderJobStatus(jobId, {
      state: 'queued',
      progress: 0.1,
      message: 'Render job accepted.',
      outputPath: null,
      downloadName,
      errorMessage: null,
    });

    debugLog({
      runId: 'pre-fix',
      hypothesisId: 'C',
      location: 'app/api/render/route.ts:POST:enqueue',
      message: 'Job enqueued; starting async render',
      data: {
        jobId,
        outputPath,
        downloadName,
        durationInFrames: manifest.durationInFrames,
        fps: manifest.fps,
      },
    });

    void processRenderJob(jobId, manifest, outputPath, downloadName);

    return Response.json({
      jobId,
      statusUrl: `/api/render/${encodeURIComponent(jobId)}`,
      downloadUrl: `/api/render/${encodeURIComponent(jobId)}/download`,
    }, { status: 202 });
  } catch (error) {
    deleteRenderJobStatus(jobId);
    await cleanupRenderJob(jobId);
    return Response.json({ detail: getErrorMessage(error) }, { status: 500 });
  }
}
