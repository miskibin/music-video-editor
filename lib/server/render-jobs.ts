import { promises as fs } from 'node:fs';
import os from 'node:os';
import path from 'node:path';

const RENDER_ROOT_DIR = path.join(os.tmpdir(), 'music-video-editor-renders');
const ASSET_INDEX_FILE = 'asset-index.json';
const JOB_METADATA_FILE = 'job.json';

export type RenderAssetIndexEntry = {
  assetId: string;
  filePath: string;
  fileName: string;
  mimeType: string;
};

export type RenderAssetIndex = Record<string, RenderAssetIndexEntry>;
export type RenderJobMetadata = {
  downloadName: string;
};

export const createRenderJobId = () => (
  `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`
);

export const getRenderJobDir = (jobId: string) => path.join(RENDER_ROOT_DIR, jobId);

const getRenderAssetDir = (jobId: string) => path.join(getRenderJobDir(jobId), 'assets');

const getAssetIndexPath = (jobId: string) => path.join(getRenderJobDir(jobId), ASSET_INDEX_FILE);
const getJobMetadataPath = (jobId: string) => path.join(getRenderJobDir(jobId), JOB_METADATA_FILE);

const sanitizeExt = (fileName: string) => {
  const ext = path.extname(fileName).toLowerCase();
  return ext.replace(/[^a-z0-9.]/g, '');
};

export const ensureRenderJobWorkspace = async (jobId: string) => {
  await fs.mkdir(getRenderAssetDir(jobId), { recursive: true });
  return {
    rootDir: getRenderJobDir(jobId),
    assetsDir: getRenderAssetDir(jobId),
  };
};

export const getRenderOutputPath = (jobId: string) => path.join(getRenderJobDir(jobId), 'output.mp4');

export const stageRenderAsset = async (
  jobId: string,
  assetId: string,
  file: File,
  fallbackFileName: string,
  mimeType: string,
): Promise<RenderAssetIndexEntry> => {
  const workspace = await ensureRenderJobWorkspace(jobId);
  const fileExt = sanitizeExt(file.name || fallbackFileName);
  const fileName = `${assetId}${fileExt}`;
  const filePath = path.join(workspace.assetsDir, fileName);
  const bytes = Buffer.from(await file.arrayBuffer());

  await fs.writeFile(filePath, bytes);

  return {
    assetId,
    filePath,
    fileName,
    mimeType,
  };
};

export const writeRenderAssetIndex = async (jobId: string, assetIndex: RenderAssetIndex) => {
  await ensureRenderJobWorkspace(jobId);
  await fs.writeFile(getAssetIndexPath(jobId), JSON.stringify(assetIndex, null, 2), 'utf8');
};

export const readRenderAssetIndex = async (jobId: string): Promise<RenderAssetIndex> => {
  const contents = await fs.readFile(getAssetIndexPath(jobId), 'utf8');
  return JSON.parse(contents) as RenderAssetIndex;
};

export const writeRenderJobMetadata = async (jobId: string, metadata: RenderJobMetadata) => {
  await ensureRenderJobWorkspace(jobId);
  await fs.writeFile(getJobMetadataPath(jobId), JSON.stringify(metadata, null, 2), 'utf8');
};

export const readRenderJobMetadata = async (jobId: string): Promise<RenderJobMetadata> => {
  const contents = await fs.readFile(getJobMetadataPath(jobId), 'utf8');
  return JSON.parse(contents) as RenderJobMetadata;
};

export const cleanupRenderJob = async (jobId: string) => {
  await fs.rm(getRenderJobDir(jobId), { recursive: true, force: true });
};
