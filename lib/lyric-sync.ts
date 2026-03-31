import { SubtitleAlignmentInput, SubtitleAlignmentResult } from '@/lib/types';

const DEFAULT_LYRIC_SYNC_API_BASE_URL = 'http://127.0.0.1:8000';

const getLyricSyncApiBaseUrl = () => {
  const configuredBaseUrl = process.env.NEXT_PUBLIC_LYRIC_SYNC_API_BASE_URL?.trim()
    || process.env.NEXT_PUBLIC_PHASE3_API_BASE_URL?.trim();

  if (!configuredBaseUrl) {
    return DEFAULT_LYRIC_SYNC_API_BASE_URL;
  }

  return configuredBaseUrl.replace(/\/$/, '');
};

export const alignSubtitles = async (input: SubtitleAlignmentInput): Promise<SubtitleAlignmentResult> => {
  const response = await fetch(`${getLyricSyncApiBaseUrl()}/api/lyric-sync/subtitles/align`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(input),
  });

  const contentType = response.headers.get('content-type') ?? '';
  const responseBody = contentType.includes('application/json')
    ? await response.json()
    : await response.text();

  if (!response.ok) {
    const errorMessage = typeof responseBody === 'object'
      && responseBody !== null
      && 'detail' in responseBody
      ? String((responseBody as { detail: unknown }).detail)
      : `Lyric Sync failed with status ${response.status}.`;

    throw new Error(errorMessage);
  }

  return responseBody as SubtitleAlignmentResult;
};