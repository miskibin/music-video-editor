/** Distinct accent colors for V1 background clips (timeline + Remotion gradient). */
const BACKGROUND_SEGMENT_PALETTE = [
  '#fb7185',
  '#38bdf8',
  '#a78bfa',
  '#f472b6',
  '#fbbf24',
  '#f97316',
  '#60a5fa',
  '#c084fc',
  '#2dd4bf',
  '#e879f9',
  '#f43f5e',
  '#818cf8',
] as const;

/** Stable color per segment from id (or any seed string). */
export function colorForBackgroundSegment(seed: string): string {
  let h = 0;
  for (let i = 0; i < seed.length; i++) {
    h = Math.imul(31, h) + seed.charCodeAt(i);
  }
  return BACKGROUND_SEGMENT_PALETTE[Math.abs(h) % BACKGROUND_SEGMENT_PALETTE.length];
}
