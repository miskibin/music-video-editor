import { promises as fs } from 'node:fs';
import { readRenderAssetIndex } from '@/lib/server/render-jobs';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

type RouteContext = {
  params: Promise<{
    jobId: string;
    assetId: string;
  }>;
};

export async function GET(_request: Request, context: RouteContext) {
  const { jobId, assetId } = await context.params;

  try {
    const assetIndex = await readRenderAssetIndex(jobId);
    const asset = assetIndex[assetId];
    if (!asset) {
      return new Response('Not found', { status: 404 });
    }

    const bytes = await fs.readFile(asset.filePath);
    return new Response(bytes, {
      status: 200,
      headers: {
        'Content-Type': asset.mimeType,
        'Cache-Control': 'no-store',
      },
    });
  } catch {
    return new Response('Not found', { status: 404 });
  }
}
