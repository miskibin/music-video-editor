/** Pick the nearest snap time within `thresholdSec` of `time`, else return `time`. */
export function snapNearestTime(
  time: number,
  points: readonly number[],
  thresholdSec: number,
): number {
  if (points.length === 0 || thresholdSec <= 0) {
    return time;
  }

  let best = time;
  let bestDist = thresholdSec;

  for (const p of points) {
    const d = Math.abs(p - time);
    if (d < bestDist) {
      bestDist = d;
      best = p;
    }
  }

  return best;
}
