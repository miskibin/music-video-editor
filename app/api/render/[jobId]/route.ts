import { getRenderJobStatus } from '@/lib/server/render-status';

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

  if (!job) {
    return Response.json({ detail: 'Render job not found.' }, { status: 404 });
  }

  return Response.json({
    jobId: job.jobId,
    state: job.state,
    progress: job.progress,
    message: job.errorMessage ?? job.message,
    errorMessage: job.errorMessage,
    downloadUrl: job.state === 'completed' ? `/api/render/${encodeURIComponent(jobId)}/download` : null,
  });
}
