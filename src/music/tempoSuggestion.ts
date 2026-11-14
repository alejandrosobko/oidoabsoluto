import { timeToBeat } from './quantize';
import type { PerformedNote } from './types';

/**
 * Desde qué proporción de ataques encimados se sugiere duplicar el tempo.
 * Medido con grabaciones reales: con el tempo bien detectado queda por debajo de 0,15;
 * con el tempo a la mitad (Carol of the Bells) pasa de 0,25.
 */
export const CROWDED_RATIO_THRESHOLD = 0.2;
/** No se sugieren tempos más rápidos que esto (el máximo que acepta el campo Tempo). */
export const MAX_SUGGESTED_BPM = 240;
/** Con tan pocos ataques la proporción no dice nada. */
const MIN_ONSETS = 8;

/**
 * Proporción de ataques que, en una grilla de corcheas, caen en la misma casilla que el
 * ataque anterior. Las notas ya tienen que venir con los acordes juntados
 * (`mergeChordOnsets`), así cada ataque distinto es una nota (o acorde) que se tocó después.
 * Si es alta, la música va más rápido que la grilla: probablemente el tempo detectado es la mitad.
 */
export function crowdedOnsetRatio(notes: PerformedNote[], beats: number[]): number {
  const onsets = [...new Set(notes.map((n) => n.start))].sort((a, b) => a - b);
  if (onsets.length < MIN_ONSETS || beats.length < 2) return 0;
  let crowded = 0;
  let previousSlot = NaN;
  for (const time of onsets) {
    const slot = Math.round(timeToBeat(time, beats) * 2);
    if (slot === previousSlot) crowded++;
    previousSlot = slot;
  }
  return crowded / (onsets.length - 1);
}

/** El tempo a sugerir (el doble del detectado), o `undefined` si no hace falta. */
export function suggestTempo(notes: PerformedNote[], beats: number[], detectedBpm: number): number | undefined {
  const doubled = Math.round(detectedBpm * 2);
  if (doubled > MAX_SUGGESTED_BPM) return undefined;
  return crowdedOnsetRatio(notes, beats) >= CROWDED_RATIO_THRESHOLD ? doubled : undefined;
}
