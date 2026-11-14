import { alignBeats, trackBeats } from './beats';
import { quantizeNotes, timeToBeat } from './quantize';
import type { BeatsPerMeasure, PerformedNote } from './types';

/**
 * Sugerencia de tempo cuando el detectado parece ser la mitad o un tercio del real.
 * Con el triple también se sugiere compás de 3 y en qué tiempo cae el primer sonido.
 */
export interface TempoSuggestion {
  bpm: number;
  /** 2 = el doble, 3 = el triple. */
  factor: 2 | 3;
  /** Solo con el triple: el compás y el tiempo del primer sonido que mejor encajan. */
  beatsPerMeasure?: BeatsPerMeasure;
  firstBeat?: number;
}

/**
 * Desde qué proporción de ataques encimados se sugiere duplicar el tempo.
 * Medido con grabaciones reales: con el tempo bien detectado queda por debajo de 0,15;
 * con el tempo a la mitad (Carol of the Bells) pasa de 0,25.
 */
export const CROWDED_RATIO_THRESHOLD = 0.2;
/**
 * Para sugerir el triple, la grilla de a 3 tiene que encajar mucho mejor que cualquier
 * grilla de a 2: su error, como mucho esta fracción del de la mejor binaria.
 * Medido: Hedwig's Theme (de a 3) da 0,13; un piano de acordes en 4/4 da 0,31.
 */
export const TERNARY_FIT_RATIO = 0.25;
/** No se sugieren tempos más rápidos que esto (el máximo que acepta el campo Tempo). */
export const MAX_SUGGESTED_BPM = 240;
/** Con el triple, un tope más bajo: más rápido que esto casi nunca es la lectura correcta. */
export const MAX_TRIPLE_BPM = 190;
/** Con tan pocos ataques las medidas no dicen nada. */
const MIN_ONSETS = 8;

function distinctOnsets(notes: PerformedNote[]): number[] {
  return [...new Set(notes.map((n) => n.start))].sort((a, b) => a - b);
}

/**
 * Proporción de ataques que, en una grilla de corcheas, caen en la misma casilla que el
 * ataque anterior. Las notas ya tienen que venir con los acordes juntados
 * (`mergeChordOnsets`), así cada ataque distinto es una nota (o acorde) que se tocó después.
 * Si es alta, la música va más rápido que la grilla: probablemente el tempo detectado es la mitad.
 */
export function crowdedOnsetRatio(notes: PerformedNote[], beats: number[]): number {
  const onsets = distinctOnsets(notes);
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

/**
 * Qué tan lejos caen los ataques de la grilla que divide cada pulso en `divisions` partes,
 * en fracciones de casilla: 0 = todos justo en la grilla, 0,25 = como si fueran al azar.
 */
export function gridError(notes: PerformedNote[], beats: number[], divisions: number): number {
  const onsets = distinctOnsets(notes);
  if (onsets.length === 0 || beats.length < 2) return 0.25;
  let sum = 0;
  for (const time of onsets) {
    const position = timeToBeat(time, beats) * divisions;
    sum += Math.abs(position - Math.round(position));
  }
  return sum / onsets.length;
}

/**
 * En qué tiempo de un compás de `beatsPerMeasure` conviene poner el primer sonido:
 * el que deja más notas largas en el primer tiempo de cada compás (donde suelen caer
 * los acentos). No se cuentan las ligaduras: el modelo alarga las notas tocadas ligado
 * y se pisan entre sí, así que esa cuenta sale ruidosa.
 */
export function bestFirstBeat(notes: PerformedNote[], beats: number[], beatsPerMeasure: BeatsPerMeasure): number {
  const subdivision = 2;
  const measure = beatsPerMeasure * subdivision;
  const grid = quantizeNotes(notes, beats, subdivision);
  let best = { firstBeat: 1, weight: -Infinity };
  for (let firstBeat = 1; firstBeat <= beatsPerMeasure; firstBeat++) {
    const offset = (firstBeat - 1) * subdivision;
    let weight = 0;
    for (const n of grid) {
      if ((((n.start + offset) % measure) + measure) % measure === 0) weight += n.end - n.start;
    }
    if (weight > best.weight) best = { firstBeat, weight };
  }
  return best.firstBeat;
}

export interface TempoContext {
  /** Notas con los acordes ya juntados. */
  notes: PerformedNote[];
  /** Curva de ataques (`onsetEnvelope`), para seguir el pulso a otros tempos. */
  envelope: Float64Array;
  /** Pulsos seguidos con el tempo detectado y el tempo que dan. */
  beats: number[];
  bpm: number;
  firstOnset: number;
  lastTime: number;
}

/** Pulsos seguidos a `factor` veces el tempo detectado. */
function beatsAt(context: TempoContext, factor: number): number[] {
  const bpm = context.bpm * factor;
  return alignBeats(trackBeats(context.envelope, bpm), context.firstOnset, context.lastTime, bpm);
}

/** La sugerencia de tempo, o `undefined` si el detectado parece estar bien. */
export function suggestTempo(context: TempoContext): TempoSuggestion | undefined {
  const { notes, beats, bpm } = context;
  if (distinctOnsets(notes).length < MIN_ONSETS) return undefined;

  const doubleBeats = beatsAt(context, 2);
  const tripleBeats = beatsAt(context, 3);
  // Grillas binarias finas (de a 4 con el tempo detectado y con el doble) contra la ternaria.
  const binaryError = Math.min(gridError(notes, beats, 4), gridError(notes, doubleBeats, 4));
  const ternaryError = gridError(notes, tripleBeats, 2);

  const triple = Math.round(bpm * 3);
  if (triple <= MAX_TRIPLE_BPM && ternaryError <= binaryError * TERNARY_FIT_RATIO) {
    return { bpm: triple, factor: 3, beatsPerMeasure: 3, firstBeat: bestFirstBeat(notes, tripleBeats, 3) };
  }

  const double = Math.round(bpm * 2);
  if (
    double <= MAX_SUGGESTED_BPM &&
    crowdedOnsetRatio(notes, beats) >= CROWDED_RATIO_THRESHOLD &&
    gridError(notes, doubleBeats, 4) <= ternaryError
  ) {
    return { bpm: double, factor: 2 };
  }
  return undefined;
}
