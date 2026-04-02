/** Placeholder labels for structural segments (not semantic verse/chorus detection). */
const HEURISTIC = ['Intro', 'Verse 1', 'Chorus 1', 'Verse 2', 'Chorus 2', 'Bridge', 'Outro'];

export const defaultHeuristicSectionLabels = (segmentCount: number): string[] => {
  if (segmentCount <= 0) {
    return [];
  }
  return Array.from({ length: segmentCount }, (_, i) => {
    if (i < HEURISTIC.length) {
      return HEURISTIC[i];
    }
    if (i === segmentCount - 1 && segmentCount > 1) {
      return 'Outro';
    }
    return `Section ${i + 1}`;
  });
};
