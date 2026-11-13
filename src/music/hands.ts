import type { GridNote } from './types';

/** Una mano abarca cómodamente hasta una octava; más que eso se penaliza. */
const COMFORTABLE_SPAN = 12;
const MAX_NOTES_PER_HAND = 5;
/** Cuánto se adapta la posición de cada mano a lo último que tocó (0 a 1). */
const ADAPT = 0.2;

export interface Hands {
  right: GridNote[];
  left: GridNote[];
}

/**
 * Reparte las notas entre mano derecha (clave de sol) y mano izquierda (clave de fa).
 * Agrupa las notas que suenan juntas y, para cada grupo, elige el corte que deja a cada
 * mano con una extensión tocable y cerca de donde venía tocando.
 */
export function splitHands(notes: GridNote[]): Hands {
  const right: GridNote[] = [];
  const left: GridNote[] = [];
  if (notes.length === 0) return { right, left };

  const sortedPitches = notes.map((n) => n.pitch).sort((a, b) => a - b);
  const percentile = (q: number) => sortedPitches[Math.floor(q * (sortedPitches.length - 1))] ?? 60;
  let leftCenter = Math.min(percentile(0.25), 55);
  let rightCenter = Math.max(percentile(0.75), 62);

  const groups = new Map<number, GridNote[]>();
  for (const n of notes) {
    const group = groups.get(n.start);
    if (group) group.push(n);
    else groups.set(n.start, [n]);
  }

  for (const start of [...groups.keys()].sort((a, b) => a - b)) {
    const group = (groups.get(start) ?? []).sort((a, b) => a.pitch - b.pitch);
    let bestCut = 0;
    let bestCost = Infinity;
    for (let cut = 0; cut <= group.length; cut++) {
      const lower = group.slice(0, cut).map((n) => n.pitch);
      const upper = group.slice(cut).map((n) => n.pitch);
      const cost = handCost(lower, leftCenter) + handCost(upper, rightCenter);
      if (cost < bestCost) {
        bestCost = cost;
        bestCut = cut;
      }
    }
    const lower = group.slice(0, bestCut);
    const upper = group.slice(bestCut);
    left.push(...lower);
    right.push(...upper);
    if (lower.length) leftCenter = (1 - ADAPT) * leftCenter + ADAPT * mean(lower.map((n) => n.pitch));
    if (upper.length) rightCenter = (1 - ADAPT) * rightCenter + ADAPT * mean(upper.map((n) => n.pitch));
  }
  return { right, left };
}

function handCost(pitches: number[], center: number): number {
  if (pitches.length === 0) return 0;
  const span = (pitches[pitches.length - 1] ?? 0) - (pitches[0] ?? 0);
  const spanPenalty = Math.max(0, span - COMFORTABLE_SPAN) * 4;
  const crowdPenalty = Math.max(0, pitches.length - MAX_NOTES_PER_HAND) * 10;
  return spanPenalty + crowdPenalty + Math.abs(mean(pitches) - center);
}

function mean(values: number[]): number {
  return values.reduce((s, v) => s + v, 0) / values.length;
}
