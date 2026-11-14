import type { SpelledPitch } from './key';

const SOLFEGE: Record<SpelledPitch['step'], string> = {
  C: 'Do',
  D: 'Re',
  E: 'Mi',
  F: 'Fa',
  G: 'Sol',
  A: 'La',
  B: 'Si',
};

const ACCIDENTALS: Record<number, string> = { [-2]: '𝄫', [-1]: '♭', 0: '', 1: '♯', 2: '𝄪' };

export type Clef = 'treble' | 'bass';

/** Nombre de una nota en solfeo con su octava (Do4 = Do central), por ejemplo "Fa♯3". */
export function solfegeName({ step, alter, octave }: SpelledPitch): string {
  const accidental = ACCIDENTALS[alter] ?? (alter > 0 ? '♯'.repeat(alter) : '♭'.repeat(-alter));
  return `${SOLFEGE[step]}${accidental}${octave}`;
}

/** Descripción corta para mostrar al pasar sobre una nota: "Fa♯3 · clave de fa · compás 2". */
export function describeNote(pitch: SpelledPitch, clef: Clef, measure?: number): string {
  const parts = [solfegeName(pitch), clef === 'treble' ? 'clave de sol' : 'clave de fa'];
  if (measure !== undefined && measure > 0) parts.push(`compás ${measure}`);
  return parts.join(' · ');
}
