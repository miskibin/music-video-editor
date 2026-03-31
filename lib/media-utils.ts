const WAVEFORM_BARS = 320;

const getAudioContextConstructor = () => {
  const windowWithWebkit = window as Window & typeof globalThis & {
    webkitAudioContext?: typeof AudioContext;
  };

  return window.AudioContext ?? windowWithWebkit.webkitAudioContext;
};

export const waitForAudioMetadata = (audio: HTMLAudioElement) => new Promise<void>((resolve) => {
  if (audio.readyState >= 1) {
    resolve();
    return;
  }

  const handleLoadedMetadata = () => {
    resolve();
  };

  const handleError = () => {
    resolve();
  };

  audio.addEventListener('loadedmetadata', handleLoadedMetadata, { once: true });
  audio.addEventListener('error', handleError, { once: true });
});

export const waitForAudioReady = (audio: HTMLAudioElement) => new Promise<void>((resolve) => {
  if (audio.readyState >= 2) {
    resolve();
    return;
  }

  const handleLoadedData = () => {
    resolve();
  };

  const handleCanPlay = () => {
    resolve();
  };

  const handleError = () => {
    resolve();
  };

  audio.addEventListener('loadeddata', handleLoadedData, { once: true });
  audio.addEventListener('canplay', handleCanPlay, { once: true });
  audio.addEventListener('error', handleError, { once: true });
});

export const getAudioDuration = (url: string) => new Promise<number>((resolve) => {
  const probe = document.createElement('audio');

  const cleanup = () => {
    probe.removeAttribute('src');
    probe.load();
  };

  probe.preload = 'metadata';
  probe.src = url;

  probe.onloadedmetadata = () => {
    const duration = Number.isFinite(probe.duration) ? probe.duration : 30;
    cleanup();
    resolve(duration);
  };

  probe.onerror = () => {
    cleanup();
    resolve(30);
  };
});

/** Onset-envelope autocorrelation; returns null if analysis fails or clip is too short. */
export const estimateBpmFromAudioUrl = async (url: string): Promise<number | null> => {
  const AudioContextConstructor = getAudioContextConstructor();
  if (!AudioContextConstructor) {
    return null;
  }

  const audioContext = new AudioContextConstructor();

  try {
    const response = await fetch(url);
    const audioData = await response.arrayBuffer();
    const audioBuffer = await audioContext.decodeAudioData(audioData);
    return estimateBpmFromAudioBuffer(audioBuffer);
  } catch {
    return null;
  } finally {
    await audioContext.close().catch(() => undefined);
  }
};

function estimateBpmFromAudioBuffer(buffer: AudioBuffer): number | null {
  const sampleRate = buffer.sampleRate;
  const length = buffer.length;
  if (length < sampleRate * 4) {
    return null;
  }

  const hopSize = 512;
  const numFrames = Math.floor(length / hopSize);
  const mono = new Float32Array(length);
  if (buffer.numberOfChannels > 1) {
    const ch0 = buffer.getChannelData(0);
    const ch1 = buffer.getChannelData(1);
    for (let i = 0; i < length; i++) {
      mono[i] = ((ch0[i] ?? 0) + (ch1[i] ?? 0)) * 0.5;
    }
  } else {
    mono.set(buffer.getChannelData(0));
  }

  const envelope = new Float32Array(numFrames);
  for (let i = 0; i < numFrames; i++) {
    let sum = 0;
    const start = i * hopSize;
    const end = Math.min(start + hopSize, length);
    for (let j = start; j < end; j++) {
      sum += mono[j] * mono[j];
    }
    envelope[i] = Math.sqrt(sum / (end - start));
  }

  let max = 0;
  for (let i = 0; i < envelope.length; i++) {
    max = Math.max(max, envelope[i]);
  }
  if (max < 1e-8) {
    return null;
  }
  for (let i = 0; i < envelope.length; i++) {
    envelope[i] /= max;
  }

  const diff = new Float32Array(envelope.length - 1);
  for (let i = 0; i < diff.length; i++) {
    diff[i] = Math.max(0, envelope[i + 1] - envelope[i]);
  }

  const minBpm = 60;
  const maxBpm = 190;
  const envRate = sampleRate / hopSize;
  const minLag = Math.max(2, Math.floor((60 / maxBpm) * envRate));
  const maxLag = Math.min(diff.length - 1, Math.ceil((60 / minBpm) * envRate));

  let bestLag = -1;
  let bestScore = -1;
  for (let lag = minLag; lag <= maxLag; lag++) {
    let sum = 0;
    const lim = diff.length - lag;
    for (let i = 0; i < lim; i++) {
      sum += diff[i] * diff[i + lag];
    }
    if (sum > bestScore) {
      bestScore = sum;
      bestLag = lag;
    }
  }

  if (bestLag <= 0 || bestScore <= 0) {
    return null;
  }

  const periodSec = bestLag / envRate;
  let bpm = 60 / periodSec;
  while (bpm > maxBpm) {
    bpm /= 2;
  }
  while (bpm < minBpm) {
    bpm *= 2;
  }

  const rounded = Math.round(bpm);
  if (rounded < minBpm || rounded > maxBpm) {
    return null;
  }

  return rounded;
}

export const extractWaveformPeaks = async (url: string, totalBars = WAVEFORM_BARS) => {
  const AudioContextConstructor = getAudioContextConstructor();
  if (!AudioContextConstructor) {
    return [];
  }

  const audioContext = new AudioContextConstructor();

  try {
    const response = await fetch(url);
    const audioData = await response.arrayBuffer();
    const audioBuffer = await audioContext.decodeAudioData(audioData);
    const samplesPerBar = Math.max(1, Math.floor(audioBuffer.length / totalBars));

    const peaks = Array.from({ length: totalBars }, (_, barIndex) => {
      const start = barIndex * samplesPerBar;
      const end = Math.min(audioBuffer.length, start + samplesPerBar);
      const sampleStep = Math.max(1, Math.floor((end - start) / 96));
      let peak = 0;

      for (let channelIndex = 0; channelIndex < audioBuffer.numberOfChannels; channelIndex += 1) {
        const channelData = audioBuffer.getChannelData(channelIndex);

        for (let sampleIndex = start; sampleIndex < end; sampleIndex += sampleStep) {
          peak = Math.max(peak, Math.abs(channelData[sampleIndex] ?? 0));
        }
      }

      return peak;
    });

    const maxPeak = Math.max(...peaks, 0.001);
    return peaks.map((peak) => Number((peak / maxPeak).toFixed(4)));
  } catch {
    return [];
  } finally {
    await audioContext.close().catch(() => undefined);
  }
};

export const getImageMetadata = (url: string) => new Promise<{ width: number; height: number }>((resolve) => {
  const image = new Image();

  image.onload = () => {
    resolve({
      width: image.naturalWidth || 1080,
      height: image.naturalHeight || 1920,
    });
  };

  image.onerror = () => {
    resolve({ width: 1080, height: 1920 });
  };

  image.src = url;
});

export const getVideoMetadata = (url: string) => new Promise<{ duration: number; width: number; height: number }>((resolve) => {
  const probe = document.createElement('video');

  const cleanup = () => {
    probe.pause();
    probe.removeAttribute('src');
    probe.load();
  };

  probe.preload = 'metadata';
  probe.muted = true;
  probe.src = url;

  probe.onloadedmetadata = () => {
    resolve({
      duration: Number.isFinite(probe.duration) ? probe.duration : 12,
      width: probe.videoWidth || 1080,
      height: probe.videoHeight || 1920,
    });
    cleanup();
  };

  probe.onerror = () => {
    resolve({ duration: 12, width: 1080, height: 1920 });
    cleanup();
  };
});