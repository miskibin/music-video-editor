import FFT from 'fft.js';

const HOP = 512;
const N_FFT = 2048;
const N_MELS = 64;
const MAX_COLS = 900;

const hzToMel = (hz: number) => 2595 * Math.log10(1 + hz / 700);
const melToHz = (mel: number) => 700 * (10 ** (mel / 2595) - 1);

function hann(n: number, length: number): number {
  return 0.5 * (1 - Math.cos((2 * Math.PI * n) / Math.max(1, length - 1)));
}

function buildMelFilterbank(sampleRate: number, nFft: number, nMels: number): Float32Array[] {
  const nBins = Math.floor(nFft / 2) + 1;
  const fftFreqs = new Float32Array(nBins);
  for (let i = 0; i < nBins; i += 1) {
    fftFreqs[i] = (i * sampleRate) / nFft;
  }

  const melMin = hzToMel(0);
  const melMax = hzToMel(sampleRate / 2);
  const melPoints = new Float32Array(nMels + 2);
  for (let m = 0; m < nMels + 2; m += 1) {
    const t = m / (nMels + 1);
    melPoints[m] = melToHz(melMin + t * (melMax - melMin));
  }

  const weights: Float32Array[] = [];
  for (let m = 0; m < nMels; m += 1) {
    const left = melPoints[m];
    const center = melPoints[m + 1];
    const right = melPoints[m + 2];
    const row = new Float32Array(nBins);
    for (let k = 0; k < nBins; k += 1) {
      const f = fftFreqs[k];
      let w = 0;
      if (f >= left && f <= center && center > left) {
        w = (f - left) / (center - left);
      } else if (f > center && f <= right && right > center) {
        w = (right - f) / (right - center);
      }
      row[k] = w;
    }
    const sum = row.reduce((a, b) => a + b, 0);
    if (sum > 1e-12) {
      for (let k = 0; k < nBins; k += 1) {
        row[k] /= sum;
      }
    }
    weights.push(row);
  }
  return weights;
}

export type MelSpectrogramResult = {
  data: Float32Array;
  cols: number;
  rows: number;
  durationSec: number;
  sampleRate: number;
};

export async function computeMelSpectrogramFromBlob(
  blob: Blob,
  options?: {
    onProgress?: (t: number) => void;
  },
): Promise<MelSpectrogramResult> {
  const arrayBuffer = await blob.arrayBuffer();
  const audioCtx = new AudioContext();
  const audioBuffer = await audioCtx.decodeAudioData(arrayBuffer.slice(0));
  await audioCtx.close();

  const sampleRate = audioBuffer.sampleRate;
  const channelData = audioBuffer.getChannelData(0);
  const durationSec = audioBuffer.duration;

  const melW = buildMelFilterbank(sampleRate, N_FFT, N_MELS);
  const fft = new FFT(N_FFT);
  const windowed = new Float64Array(N_FFT);

  const frameCount = Math.max(1, Math.floor((channelData.length - N_FFT) / HOP) + 1);
  const stride = Math.max(1, Math.ceil(frameCount / MAX_COLS));
  const frameIndices: number[] = [];
  for (let f = 0; f < frameCount; f += stride) {
    frameIndices.push(f);
  }
  const cols = frameIndices.length;
  const rows = N_MELS;
  const data = new Float32Array(rows * cols);

  let col = 0;
  for (const frame of frameIndices) {
    if (col % 8 === 0) {
      options?.onProgress(col / frameIndices.length);
      await new Promise((r) => requestAnimationFrame(r));
    }

    const start = frame * HOP;
    for (let i = 0; i < N_FFT; i += 1) {
      windowed[i] = (channelData[start + i] ?? 0) * hann(i, N_FFT);
    }

    const complexIn = fft.toComplexArray(windowed);
    const complexOut = fft.createComplexArray();
    fft.transform(complexOut, complexIn);
    fft.completeSpectrum(complexOut);

    const nBins = Math.floor(N_FFT / 2) + 1;
    const power = new Float32Array(nBins);
    for (let k = 0; k < nBins; k += 1) {
      const re = complexOut[2 * k];
      const im = complexOut[2 * k + 1];
      power[k] = re * re + im * im;
    }

    for (let m = 0; m < N_MELS; m += 1) {
      let melE = 0;
      const w = melW[m];
      for (let k = 0; k < nBins; k += 1) {
        melE += w[k] * power[k];
      }
      const melDb = 10 * Math.log10(Math.max(melE, 1e-20));
      data[m * cols + col] = melDb;
    }
    col += 1;
  }

  let minV = Infinity;
  let maxV = -Infinity;
  for (let i = 0; i < data.length; i += 1) {
    minV = Math.min(minV, data[i]);
    maxV = Math.max(maxV, data[i]);
  }
  const range = maxV - minV || 1;
  for (let i = 0; i < data.length; i += 1) {
    data[i] = (data[i] - minV) / range;
  }

  options?.onProgress(1);

  return {
    data,
    cols,
    rows,
    durationSec,
    sampleRate,
  };
}
