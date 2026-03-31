type RenderJobState = 'queued' | 'staging' | 'bundling' | 'rendering' | 'completed' | 'error';

export type RenderJobStatus = {
  jobId: string;
  state: RenderJobState;
  progress: number;
  message: string;
  outputPath: string | null;
  downloadName: string | null;
  errorMessage: string | null;
  createdAt: number;
  updatedAt: number;
};

const JOB_TTL_MS = 10 * 60 * 1000;
const renderJobs = new Map<string, RenderJobStatus>();
const cleanupTimers = new Map<string, ReturnType<typeof setTimeout>>();

const scheduleCleanup = (jobId: string) => {
  const existingTimer = cleanupTimers.get(jobId);
  if (existingTimer) {
    clearTimeout(existingTimer);
  }

  const timer = setTimeout(() => {
    renderJobs.delete(jobId);
    cleanupTimers.delete(jobId);
  }, JOB_TTL_MS);

  cleanupTimers.set(jobId, timer);
};

export const createRenderJobStatus = (jobId: string): RenderJobStatus => {
  const now = Date.now();
  const status: RenderJobStatus = {
    jobId,
    state: 'queued',
    progress: 0,
    message: 'Queued render job...',
    outputPath: null,
    downloadName: null,
    errorMessage: null,
    createdAt: now,
    updatedAt: now,
  };

  renderJobs.set(jobId, status);
  scheduleCleanup(jobId);
  return status;
};

export const getRenderJobStatus = (jobId: string) => renderJobs.get(jobId) ?? null;

export const updateRenderJobStatus = (
  jobId: string,
  patch: Partial<Omit<RenderJobStatus, 'jobId' | 'createdAt'>>,
) => {
  const existing = renderJobs.get(jobId);
  if (!existing) {
    return null;
  }

  const nextStatus: RenderJobStatus = {
    ...existing,
    ...patch,
    updatedAt: Date.now(),
  };

  renderJobs.set(jobId, nextStatus);
  scheduleCleanup(jobId);
  return nextStatus;
};

export const deleteRenderJobStatus = (jobId: string) => {
  renderJobs.delete(jobId);
  const existingTimer = cleanupTimers.get(jobId);
  if (existingTimer) {
    clearTimeout(existingTimer);
    cleanupTimers.delete(jobId);
  }
};
