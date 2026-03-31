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