import assert from 'node:assert/strict';
import { createRenderManifest, RENDER_FPS } from '@/lib/render';
import type { EditorProject } from '@/lib/types';

const now = new Date().toISOString();

const project: EditorProject = {
  version: 3,
  id: 'active-project',
  name: 'Render Manifest Check',
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
      name: 'song.mp3',
      color: '#22c55e',
      start: 0,
      duration: 8,
      sourceDuration: 12,
      trimStart: 2,
      waveform: [],
      bpm: 120,
    },
  },
  subtitles: {
    trackId: 't1',
    sourceText: 'hello from trim-aware subtitles',
    cues: [
      {
        id: 'cue-1',
        start: 1,
        duration: 2,
        text: 'trim me away',
        words: [],
      },
      {
        id: 'cue-2',
        start: 2.5,
        duration: 3,
        text: 'hello from trim-aware subtitles',
        words: [
          {
            id: 'word-1',
            text: 'hello',
            startMs: 2500,
            endMs: 2800,
            confidence: 0.99,
          },
          {
            id: 'word-2',
            text: 'subtitles',
            startMs: 4300,
            endMs: 5000,
            confidence: 0.95,
          },
        ],
      },
    ],
  },
  background: {
    trackId: 'v1',
    segments: [
      {
        id: 'bg-1',
        assetId: null,
        name: 'Gradient opener',
        color: '#2563eb',
        start: 0,
        duration: 4,
        visualType: 'gradient',
        transition: {
          kind: 'fade',
          duration: 0.3,
        },
        motion: {
          mode: 'beat-pulse',
          strength: 0.4,
        },
      },
      {
        id: 'bg-2',
        assetId: 'video-1',
        name: 'Video follow-up',
        color: '#0ea5e9',
        start: 4,
        duration: 4,
        sourceDuration: 9,
        trimStart: 1,
        visualType: 'video',
        transition: {
          kind: 'slide',
          duration: 0.5,
        },
        motion: {
          mode: 'kick-zoom',
          strength: 0.6,
        },
      },
    ],
  },
  assets: {
    'audio-1': {
      id: 'audio-1',
      kind: 'audio',
      name: 'song.mp3',
      mimeType: 'audio/mpeg',
      size: 123,
      duration: 12,
      createdAt: now,
      updatedAt: now,
      source: 'upload',
    },
    'video-1': {
      id: 'video-1',
      kind: 'video',
      name: 'bg.mp4',
      mimeType: 'video/mp4',
      size: 456,
      duration: 9,
      width: 1080,
      height: 1920,
      createdAt: now,
      updatedAt: now,
      source: 'upload',
    },
  },
  mediaLibraryAssetIds: ['audio-1', 'video-1'],
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

const manifest = createRenderManifest(project, {
  'audio-1': 'http://localhost:3000/api/render-assets/job/audio-1',
  'video-1': 'http://localhost:3000/api/render-assets/job/video-1',
});

assert.equal(manifest.fps, RENDER_FPS);
assert.equal(manifest.music?.trimBefore, 60);
assert.equal(manifest.music?.trimAfter, 300);
assert.equal(manifest.music?.durationInFrames, 240);
assert.equal(manifest.backgroundSegments.length, 2);
assert.equal(manifest.backgroundSegments[1].trimBefore, 30);
assert.equal(manifest.subtitleCues.length, 2);
assert.equal(manifest.subtitleCues[0].startFrame, 0);
assert.equal(manifest.subtitleCues[0].durationInFrames, 30);
assert.equal(manifest.subtitleCues[1].startFrame, 15);
assert.equal(manifest.subtitleCues[1].durationInFrames, 90);
assert.equal(manifest.subtitleCues[1].words.length, 2);
assert.equal(manifest.durationInFrames, 360);

console.log('render manifest validation passed');
