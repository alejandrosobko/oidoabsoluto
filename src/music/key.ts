import type { KeySignature, PerformedNote } from './types';

// Perfiles de Krumhansl-Kessler: qué tan "esperable" es cada grado en una tonalidad.
const MAJOR_PROFILE = [6.35, 2.23, 3.48, 2.33, 4.38, 4.09, 2.52, 5.19, 2.39, 3.66, 2.29, 2.88];
const MINOR_PROFILE = [6.33, 2.68, 3.52, 5.38, 2.6, 3.53, 2.54, 4.75, 3.98, 2.69, 3.34, 3.17];

/** Armadura (en quintas) de cada tónica mayor, indexada por clase de altura (0 = Do). */
const MAJOR_FIFTHS = [0, -5, 2, -3, 4, -1, 6, 1, -4, 3, -2, 5];

const SHARP_NAMES = ['Do', 'Do♯', 'Re', 'Re♯', 'Mi', 'Fa', 'Fa♯', 'Sol', 'Sol♯', 'La', 'La♯', 'Si'];
const FLAT_NAMES = ['Do', 'Re♭', 'Re', 'Mi♭', 'Mi', 'Fa', 'Sol♭', 'Sol', 'La♭', 'La', 'Si♭', 'Si'];

/** Detecta la tonalidad más probable pesando cada nota por su duración. */
export function detectKey(notes: PerformedNote[]): KeySignature {
  const weights = new Array<number>(12).fill(0);
  for (const n of notes) {
    const pc = ((n.pitch % 12) + 12) % 12;
    weights[pc] = (weights[pc] ?? 0) + n.duration;
  }
  if (weights.every((w) => w === 0)) return { fifths: 0, mode: 'major', name: 'Do mayor' };

  let best = { tonic: 0, mode: 'major' as 'major' | 'minor', r: -Infinity };
  for (let tonic = 0; tonic < 12; tonic++) {
    for (const mode of ['major', 'minor'] as const) {
      const profile = mode === 'major' ? MAJOR_PROFILE : MINOR_PROFILE;
      const rotated = weights.map((_, i) => profile[(i - tonic + 12) % 12] ?? 0);
      const r = correlation(weights, rotated);
      if (r > best.r) best = { tonic, mode, r };
    }
  }

  const relativeMajor = best.mode === 'major' ? best.tonic : (best.tonic + 3) % 12;
  const fifths = MAJOR_FIFTHS[relativeMajor] ?? 0;
  const names = fifths < 0 ? FLAT_NAMES : SHARP_NAMES;
  const name = `${names[best.tonic]} ${best.mode === 'major' ? 'mayor' : 'menor'}`;
  return { fifths, mode: best.mode, name };
}

/** Armaduras que se ofrecen para elegir a mano: de 6 bemoles a 6 sostenidos. */
export const KEY_SIGNATURE_RANGE = { min: -6, max: 6 } as const;

/** Armadura elegida a mano. Como no se sabe si es mayor o menor, se nombran las dos. */
export function keySignatureFromFifths(fifths: number): KeySignature {
  const clamped = Math.min(KEY_SIGNATURE_RANGE.max, Math.max(KEY_SIGNATURE_RANGE.min, Math.round(fifths)));
  const majorTonic = (((clamped * 7) % 12) + 12) % 12;
  const minorTonic = (majorTonic + 9) % 12;
  const names = clamped < 0 ? FLAT_NAMES : SHARP_NAMES;
  return { fifths: clamped, mode: 'major', name: `${names[majorTonic]} mayor / ${names[minorTonic]} menor` };
}

function correlation(a: number[], b: number[]): number {
  const ma = a.reduce((s, v) => s + v, 0) / a.length;
  const mb = b.reduce((s, v) => s + v, 0) / b.length;
  let num = 0;
  let da = 0;
  let db = 0;
  for (let i = 0; i < a.length; i++) {
    const x = (a[i] ?? 0) - ma;
    const y = (b[i] ?? 0) - mb;
    num += x * y;
    da += x * x;
    db += y * y;
  }
  return da && db ? num / Math.sqrt(da * db) : 0;
}

export interface SpelledPitch {
  step: 'C' | 'D' | 'E' | 'F' | 'G' | 'A' | 'B';
  alter: number;
  octave: number;
}

const SHARP_SPELLING: Array<[SpelledPitch['step'], number]> = [
  ['C', 0], ['C', 1], ['D', 0], ['D', 1], ['E', 0], ['F', 0],
  ['F', 1], ['G', 0], ['G', 1], ['A', 0], ['A', 1], ['B', 0],
];
const FLAT_SPELLING: Array<[SpelledPitch['step'], number]> = [
  ['C', 0], ['D', -1], ['D', 0], ['E', -1], ['E', 0], ['F', 0],
  ['G', -1], ['G', 0], ['A', -1], ['A', 0], ['B', -1], ['B', 0],
];

/** Nombra una altura MIDI con sostenidos o bemoles según la armadura. */
export function spellPitch(pitch: number, fifths: number): SpelledPitch {
  const pc = ((pitch % 12) + 12) % 12;
  const [step, alter] = (fifths < 0 ? FLAT_SPELLING : SHARP_SPELLING)[pc] ?? ['C', 0];
  return { step, alter, octave: Math.floor(pitch / 12) - 1 };
}
