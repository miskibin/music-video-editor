import path from 'node:path';
import { parseProjectDocument } from '@/lib/project';
import {
  createRenderManifest,
  getReferencedRenderAssetIds,
  sanitizeOutputName,
} from '@/lib/render';
import {
  cleanupRenderJob,
  createRenderJobId,
  getRenderJobDir,
  stageRenderAsset,
  writeRenderAssetIndex,
} from '@/lib/server/render-jobs';
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

const processRenderJob = async (
  jobId: string,
  manifest: ReturnType<typeof createRenderManifest>,
  outputPath: string,
  downloadName: string,
) => {
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
        const percent = Math.max(0.18, Math.min(0.98, progress.progress));
        const stageLabel = progress.stitchStage === 'encoding' ? 'Encoding frames' : 'Muxing video';
        updateRenderJobStatus(jobId, {
          state: 'rendering',
          progress: percent,
          message: `${stageLabel} ${Math.round(progress.progress * 100)}%`,
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

    const assetSources: Record<string, string> = {};
    const assetIndexRecord: Record<string, Awaited<ReturnType<typeof stageRenderAsset>>> = {};
    const origin = new URL(request.url).origin;
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
      assetSources[assetId] = `${origin}/api/render-assets/${encodeURIComponent(jobId)}/${encodeURIComponent(assetId)}`;
    }

    await writeRenderAssetIndex(jobId, assetIndexRecord);

    const manifest = createRenderManifest(parsedProject, assetSources);
    const outputPath = path.join(getRenderJobDir(jobId), 'output.mp4');
    const downloadName = `${sanitizeOutputName(parsedProject.name)}.mp4`;

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
