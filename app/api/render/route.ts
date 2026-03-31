import { promises as fs } from 'node:fs';
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
import { renderManifestToMp4 } from '@/lib/server/remotion';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const maxDuration = 300;

const getErrorMessage = (error: unknown) => error instanceof Error ? error.message : 'Render failed.';

export async function POST(request: Request) {
  const jobId = createRenderJobId();

  try {
    const formData = await request.formData();
    const rawProject = formData.get('project');
    if (typeof rawProject !== 'string') {
      return Response.json({ detail: 'Missing project payload.' }, { status: 400 });
    }

    const parsedProject = parseProjectDocument(JSON.parse(rawProject));
    if (!parsedProject.music.clip?.assetId) {
      return Response.json({ detail: 'Upload music before rendering.' }, { status: 400 });
    }

    const assetSources: Record<string, string> = {};
    const assetIndexRecord: Record<string, Awaited<ReturnType<typeof stageRenderAsset>>> = {};
    const origin = new URL(request.url).origin;

    for (const assetId of getReferencedRenderAssetIds(parsedProject)) {
      const field = formData.get(`asset:${assetId}`);
      if (!(field instanceof File)) {
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

    await renderManifestToMp4(manifest, outputPath);

    const video = await fs.readFile(outputPath);
    const downloadName = `${sanitizeOutputName(parsedProject.name)}.mp4`;

    return new Response(video, {
      status: 200,
      headers: {
        'Content-Type': 'video/mp4',
        'Content-Disposition': `attachment; filename="${downloadName}"`,
        'Cache-Control': 'no-store',
      },
    });
  } catch (error) {
    return Response.json({ detail: getErrorMessage(error) }, { status: 500 });
  } finally {
    await cleanupRenderJob(jobId);
  }
}
