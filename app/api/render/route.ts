import { parseProjectDocument } from '@/lib/project';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
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
