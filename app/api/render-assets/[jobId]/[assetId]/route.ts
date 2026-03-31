import { promises as fs } from 'node:fs';
import { readRenderAssetIndex } from '@/lib/server/render-jobs';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const getCorsHeaders = (request: Request) => {
  const origin = request.headers.get('origin');
  if (!origin) {
    return {};
  }

  // Dev-only allowlist (UI runs on 3000/3001, localhost or 127.0.0.1).
  const allowed = /^(https?:\/\/)(localhost|127\.0\.0\.1)(:3000|:3001)$/.test(origin);
  if (!allowed) {
    return {};
  }

  return {
    'Access-Control-Allow-Origin': origin,
    'Access-Control-Allow-Methods': 'GET,OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type',
    'Vary': 'Origin',
  } as const;
};

type RouteContext = {
  params: Promise<{
    jobId: string;
    assetId: string;
  }>;
};

export async function OPTIONS(request: Request) {
  return new Response(null, { status: 204, headers: getCorsHeaders(request) });
}

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
        ...getCorsHeaders(_request),
      },
    });
  } catch {
    return new Response('Not found', { status: 404, headers: getCorsHeaders(_request) });
  }
}
