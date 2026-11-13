import type { GridNote, PerformedNote, Subdivision } from './types';

/** Convierte un tiempo en segundos a posición en pulsos (fraccionaria) según la lista de pulsos. */
export function timeToBeat(time: number, beats: number[]): number {
  const n = beats.length;
  if (n < 2) return 0;
  const first = beats[0] ?? 0;
  const last = beats[n - 1] ?? 0;
  if (time <= first) return (time - first) / ((beats[1] ?? 0) - first);
  if (time >= last) return n - 1 + (time - last) / (last - (beats[n - 2] ?? 0));

  let lo = 0;
  let hi = n - 1;
  while (hi - lo > 1) {
    const mid = (lo + hi) >> 1;
    if ((beats[mid] ?? 0) <= time) lo = mid;
    else hi = mid;
  }
  const a = beats[lo] ?? 0;
  const b = beats[hi] ?? 0;
  return lo + (time - a) / (b - a);
}

/** Notas que arrancan dentro de esta ventana se consideran un mismo acorde (apenas arpegiado). */
export const CHORD_WINDOW_SECONDS = 0.08;

/**
 * Junta en un acorde las notas que arrancan casi a la vez: les da el ataque de la primera
 * y mantiene el momento en que cada una se suelta. Así un acorde apenas arpegiado no
 * termina escrito como varias semicorcheas.
 */
export function mergeChordOnsets(notes: PerformedNote[], window = CHORD_WINDOW_SECONDS): PerformedNote[] {
  const sorted = [...notes].sort((a, b) => a.start - b.start);
  let clusterStart = -Infinity;
  return sorted.map((n) => {
    if (n.start - clusterStart > window) {
      clusterStart = n.start;
      return n;
    }
    return { ...n, start: clusterStart, duration: n.duration + (n.start - clusterStart) };
  });
}

/**
 * Ubica cada nota en la grilla (posiciones enteras en unidades de la figura mínima).
 * Si una misma altura aparece dos veces en el mismo lugar, se queda la más larga.
 */
export function quantizeNotes(notes: PerformedNote[], beats: number[], subdivision: Subdivision): GridNote[] {
  const byKey = new Map<string, GridNote>();
  for (const n of notes) {
    const start = Math.round(timeToBeat(n.start, beats) * subdivision);
    let end = Math.round(timeToBeat(n.start + n.duration, beats) * subdivision);
    if (end <= start) end = start + 1;
    const key = `${n.pitch}@${start}`;
    const existing = byKey.get(key);
    if (!existing || existing.end < end) byKey.set(key, { pitch: n.pitch, start, end, velocity: n.velocity });
  }
  return [...byKey.values()].sort((a, b) => a.start - b.start || a.pitch - b.pitch);
}
