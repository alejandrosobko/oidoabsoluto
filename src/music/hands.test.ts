import { describe, expect, it } from 'vitest';
import { splitHands } from './hands';
import type { GridNote } from './types';

const note = (pitch: number, start: number): GridNote => ({ pitch, start, end: start + 4, velocity: 0.8 });
const pitches = (notes: GridNote[]) => notes.map((n) => n.pitch).sort((a, b) => a - b);

// Fa1, Fa2 | Fa3, La♭3, Do4: octava en el bajo y acorde arriba.
const F_MINOR_VOICING = [29, 41, 53, 56, 60];

describe('splitHands', () => {
  it('separa el bajo en octavas del acorde', () => {
    const { left, right } = splitHands(F_MINOR_VOICING.map((p) => note(p, 0)));
    expect(pitches(left)).toEqual([29, 41]);
    expect(pitches(right)).toEqual([53, 56, 60]);
  });

  it('mantiene el criterio cuando el acorde y el bajo llegan por separado', () => {
    const notes = [
      ...F_MINOR_VOICING.map((p) => note(p, 0)),
      note(29, 8),
      note(41, 8),
      note(53, 10),
      note(56, 10),
      note(60, 10),
    ];
    const { left, right } = splitHands(notes);
    expect(pitches(left)).toEqual([29, 29, 41, 41]);
    expect(pitches(right)).toEqual([53, 53, 56, 56, 60, 60]);
  });

  it('una melodía aguda va entera a la derecha y un bajo grave a la izquierda', () => {
    const melody = [72, 74, 76, 77, 79].map((p, i) => note(p, i * 2));
    const bass = [36, 43].map((p, i) => note(p, i * 4));
    const { left, right } = splitHands([...melody, ...bass]);
    expect(pitches(right)).toEqual([72, 74, 76, 77, 79]);
    expect(pitches(left)).toEqual([36, 43]);
  });

  it('no deja a una mano con más de una octava y media si puede evitarlo', () => {
    const { left, right } = splitHands([36, 48, 55, 64, 67, 72].map((p) => note(p, 0)));
    for (const hand of [left, right]) {
      const ps = pitches(hand);
      expect((ps[ps.length - 1] ?? 0) - (ps[0] ?? 0)).toBeLessThanOrEqual(19);
    }
  });

  it('sin notas devuelve las dos manos vacías', () => {
    expect(splitHands([])).toEqual({ left: [], right: [] });
  });
});
