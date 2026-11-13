import { describe, expect, it } from 'vitest';
import { detectKey, keySignatureFromFifths, spellPitch } from './key';
import type { PerformedNote } from './types';

const notesFrom = (pitches: number[], weightFirst = 1): PerformedNote[] =>
  pitches.map((pitch, i) => ({ start: i, duration: i === 0 ? weightFirst : 1, pitch, velocity: 0.8 }));

describe('detectKey', () => {
  it('reconoce Do mayor en la escala', () => {
    expect(detectKey(notesFrom([60, 62, 64, 65, 67, 69, 71, 72], 3))).toEqual({ fifths: 0, mode: 'major', name: 'Do mayor' });
  });

  it('reconoce Fa menor con la progresión Fam – La♭ – Si♭ – Mi♭', () => {
    const progression = [
      [41, 53, 56, 60],
      [44, 56, 60, 63],
      [46, 58, 62, 65],
      [39, 55, 58, 63],
      [41, 53, 56, 60],
    ].flat();
    const key = detectKey(notesFrom(progression, 2));
    expect(key).toEqual({ fifths: -4, mode: 'minor', name: 'Fa menor' });
  });

  it('usa sostenidos en tonalidades con sostenidos', () => {
    const key = detectKey(notesFrom([64, 66, 68, 69, 71, 73, 75, 76], 3));
    expect(key.name).toBe('Mi mayor');
    expect(key.fifths).toBe(4);
  });

  it('sin notas cae en Do mayor', () => {
    expect(detectKey([]).fifths).toBe(0);
  });
});

describe('spellPitch', () => {
  it('escribe con bemoles en armaduras con bemoles', () => {
    expect(spellPitch(56, -4)).toEqual({ step: 'A', alter: -1, octave: 3 });
  });

  it('escribe con sostenidos en armaduras con sostenidos', () => {
    expect(spellPitch(61, 2)).toEqual({ step: 'C', alter: 1, octave: 4 });
  });

  it('el Do central es C4', () => {
    expect(spellPitch(60, 0)).toEqual({ step: 'C', alter: 0, octave: 4 });
  });
});

describe('keySignatureFromFifths', () => {
  it('nombra la mayor y la relativa menor', () => {
    expect(keySignatureFromFifths(-4).name).toBe('La♭ mayor / Fa menor');
    expect(keySignatureFromFifths(0).name).toBe('Do mayor / La menor');
    expect(keySignatureFromFifths(3).name).toBe('La mayor / Fa♯ menor');
  });

  it('limita a 6 alteraciones', () => {
    expect(keySignatureFromFifths(-9).fifths).toBe(-6);
    expect(keySignatureFromFifths(9).fifths).toBe(6);
  });
});
