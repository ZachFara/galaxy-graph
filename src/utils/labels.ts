// Greedy label placement: candidates arrive in priority order; a candidate is kept only
// if its rectangle does not overlap one already kept.

export interface LabelCandidate<T> {
  key: T;
  x: number;
  y: number;
  width: number;
  height: number;
}

const CHAR_PX = 6.4;
const PILL_PADDING_PX = 26;

/** Rough pixel width of a 12px label pill with its colour dot. */
export function estimateLabelWidth(text: string): number {
  return Math.round(text.length * CHAR_PX + PILL_PADDING_PX);
}

export function rectsOverlap<T>(a: LabelCandidate<T>, b: LabelCandidate<T>): boolean {
  return a.x < b.x + b.width && b.x < a.x + a.width && a.y < b.y + b.height && b.y < a.y + a.height;
}

export function placeLabels<T>(candidates: LabelCandidate<T>[], max: number): LabelCandidate<T>[] {
  const kept: LabelCandidate<T>[] = [];
  for (const c of candidates) {
    if (kept.length >= max) break;
    if (kept.some((k) => rectsOverlap(k, c))) continue;
    kept.push(c);
  }
  return kept;
}
