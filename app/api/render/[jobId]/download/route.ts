import { promises as fs } from 'node:fs';
import { cleanupRenderJob } from '@/lib/server/render-jobs';
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

  if (!job || job.state !== 'completed' || !job.outputPath || !job.downloadName) {
    return Response.json({ detail: 'Rendered artifact not available.' }, { status: 404 });
  }

  const bytes = await fs.readFile(job.outputPath);
  deleteRenderJobStatus(jobId);
  await cleanupRenderJob(jobId);

  return new Response(bytes, {
    status: 200,
    headers: {
      'Content-Type': 'video/mp4',
      'Content-Disposition': `attachment; filename="${job.downloadName}"`,
      'Cache-Control': 'no-store',
    },
  });
}
