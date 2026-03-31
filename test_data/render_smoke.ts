import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import { createDefaultMotionConfig, createDefaultTransitionConfig } from '@/lib/project';
import { sanitizeOutputName } from '@/lib/render';
import { DEFAULT_SUBTITLE_STYLE, type EditorProject } from '@/lib/types';

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

const main = async () => {
  const now = new Date().toISOString();
  const audioPath = path.join(process.cwd(), 'test_data', 'clip.mp3');
  const audioBytes = await fs.readFile(audioPath);
  const audioStat = await fs.stat(audioPath);

  const project: EditorProject = {
    version: 3,
    id: 'active-project',
    name: 'Smoke Render',
    createdAt: now,
    updatedAt: now,
    format: {
      aspectRatio: '9:16',
      width: 1080,
      height: 1920,
    },
    music: {
      trackId: 'a1',
      clip: {
        id: 'music-1',
        assetId: 'audio-1',
        name: 'clip.mp3',
        color: '#22c55e',
        start: 0,
        duration: 4,
        sourceDuration: 6,
        trimStart: 1,
        waveform: [],
        bpm: 120,
      },
    },
    subtitles: {
      trackId: 't1',
      sourceText: 'Hello render smoke',
      subtitleStyle: DEFAULT_SUBTITLE_STYLE,
      cues: [
        {
          id: 'cue-1',
          start: 0.5,
          duration: 2.5,
          text: 'Hello render smoke',
          words: [],
        },
      ],
    },
    background: {
      trackId: 'v1',
      globalTransition: createDefaultTransitionConfig(),
      globalMotion: {
        ...createDefaultMotionConfig(),
        strength: 0.6,
      },
      segments: [
        {
          id: 'bg-1',
          assetId: null,
          name: 'Gradient',
          color: '#2563eb',
          start: 0,
          duration: 4,
          visualType: 'gradient',
          transition: { kind: 'none', duration: 0, ease: 'easeInOut' },
          motion: createDefaultMotionConfig(),
        },
      ],
    },
    assets: {
      'audio-1': {
        id: 'audio-1',
        kind: 'audio',
        name: 'clip.mp3',
        mimeType: 'audio/mpeg',
        size: audioStat.size,
        duration: 6,
        createdAt: now,
        updatedAt: now,
        source: 'upload',
      },
    },
    mediaLibraryAssetIds: ['audio-1'],
    lyricSync: {
      subtitleAlignment: {
        status: 'idle',
        input: null,
        result: null,
        approvedAt: null,
        errorMessage: null,
      },
    },
  };

  const formData = new FormData();
  formData.append('project', JSON.stringify(project));
  formData.append('asset:audio-1', new File([audioBytes], 'clip.mp3', { type: 'audio/mpeg' }), 'clip.mp3');

  const response = await fetch('http://127.0.0.1:3000/api/render', {
    method: 'POST',
    body: formData,
  });

  if (response.status !== 202) {
    throw new Error(`Render request failed (${response.status}): ${await response.text()}`);
  }

  const {
    statusUrl,
    downloadUrl,
  } = await response.json() as {
    jobId: string;
    statusUrl: string;
    downloadUrl: string;
  };

  let resolvedDownloadUrl: string | null = downloadUrl;
  for (let attempt = 0; attempt < 160; attempt += 1) {
    await sleep(500);
    const statusResponse = await fetch(`http://127.0.0.1:3000${statusUrl}`, { cache: 'no-store' });
    if (statusResponse.status !== 200) {
      throw new Error(`Status request failed (${statusResponse.status}): ${await statusResponse.text()}`);
    }
    const status = await statusResponse.json() as {
      state: 'queued' | 'staging' | 'bundling' | 'rendering' | 'completed' | 'error';
      message: string;
      errorMessage: string | null;
      downloadUrl: string | null;
    };

    if (status.state === 'error') {
      throw new Error(status.errorMessage ?? status.message);
    }

    if (status.state === 'completed') {
      resolvedDownloadUrl = status.downloadUrl;
      break;
    }
  }

  assert.ok(resolvedDownloadUrl, 'Render job never produced a download URL');
  const downloadResponse = await fetch(`http://127.0.0.1:3000${resolvedDownloadUrl}`, { cache: 'no-store' });
  if (downloadResponse.status !== 200) {
    throw new Error(`Download request failed (${downloadResponse.status}): ${await downloadResponse.text()}`);
  }
  assert.equal(downloadResponse.headers.get('content-type'), 'video/mp4');
  assert.match(
    downloadResponse.headers.get('content-disposition') ?? '',
    new RegExp(`${sanitizeOutputName(project.name)}\\.mp4`),
  );

  const renderBytes = Buffer.from(await downloadResponse.arrayBuffer());
  assert.ok(renderBytes.byteLength > 250_000, `Expected an MP4 payload, got ${renderBytes.byteLength} bytes`);

  console.log(`render smoke passed (${renderBytes.byteLength} bytes)`);
};

void main();
