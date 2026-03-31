import { promises as fs } from 'node:fs';
import { cleanupRenderJob, getRenderOutputPath, readRenderJobMetadata } from '@/lib/server/render-jobs';
import { deleteRenderJobStatus, getRenderJobStatus } from '@/lib/server/render-status';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

type RouteContext = {
  params: Promise<{
    jobId: string;
  }>;
};

export async function GET(_request: Request, context: RouteContext) {
  const { jobId } = await context.params;
  const job = getRenderJobStatus(jobId);
  const outputPath = job?.outputPath ?? getRenderOutputPath(jobId);

  try {
    const [{ downloadName }, bytes] = await Promise.all([
      readRenderJobMetadata(jobId),
      fs.readFile(outputPath),
    ]);

    deleteRenderJobStatus(jobId);
    await cleanupRenderJob(jobId);

    return new Response(bytes, {
      status: 200,
      headers: {
        'Content-Type': 'video/mp4',
        'Content-Disposition': `attachment; filename="${downloadName}"`,
        'Cache-Control': 'no-store',
      },
    });
  } catch {
    return Response.json({ detail: 'Rendered artifact not available.' }, { status: 404 });
  }
}
