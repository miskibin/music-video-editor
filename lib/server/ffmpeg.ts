import { spawn } from 'node:child_process';

const formatSeconds = (seconds: number) => {
  const safeSeconds = Number.isFinite(seconds) ? Math.max(0, seconds) : 0;
  return safeSeconds.toFixed(3);
};

export const trimAudioWithFfmpeg = async ({
  inputPath,
  outputPath,
  startSeconds,
  durationSeconds,
}: {
  inputPath: string;
  outputPath: string;
  startSeconds: number;
  durationSeconds: number;
}) => {
  await new Promise<void>((resolve, reject) => {
    const args = [
      '-y',
      '-i',
      inputPath,
      '-ss',
      formatSeconds(startSeconds),
      '-t',
      formatSeconds(durationSeconds),
      '-vn',
      '-c:a',
      'aac',
      '-b:a',
      '192k',
      outputPath,
    ];

    const ffmpeg = spawn('ffmpeg', args, {
      stdio: ['ignore', 'ignore', 'pipe'],
    });

    let stderr = '';

    ffmpeg.stderr.on('data', (chunk) => {
      stderr += chunk.toString();
    });

    ffmpeg.on('error', (error) => {
      reject(error);
    });

    ffmpeg.on('close', (code) => {
      if (code === 0) {
        resolve();
        return;
      }

      reject(new Error(`FFmpeg audio trim failed with exit code ${code}: ${stderr.trim()}`));
    });
  });
};
