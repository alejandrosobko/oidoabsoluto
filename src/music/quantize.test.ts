import { describe, expect, it } from 'vitest';
import { mergeChordOnsets, quantizeNotes, timeToBeat } from './quantize';

const beats = [1, 2, 3, 4, 5];

describe('timeToBeat', () => {
  it('interpola entre pulsos', () => {
    expect(timeToBeat(1, beats)).toBe(0);
    expect(timeToBeat(2.5, beats)).toBe(1.5);
  });

  it('extrapola antes del primero y después del último', () => {
    expect(timeToBeat(0.5, beats)).toBe(-0.5);
    expect(timeToBeat(6, beats)).toBe(5);
  });

  it('sigue pulsos de distinto largo', () => {
    expect(timeToBeat(2.25, [1, 2, 2.5, 3])).toBe(1.5);
  });
});

describe('quantizeNotes', () => {
  it('lleva cada nota a la semicorchea más cercana', () => {
    const notes = [
      { start: 1.02, duration: 0.96, pitch: 60, velocity: 0.8 },
      { start: 2.26, duration: 0.24, pitch: 62, velocity: 0.8 },
    ];
    expect(quantizeNotes(notes, beats, 4)).toEqual([
      { pitch: 60, start: 0, end: 4, velocity: 0.8 },
      { pitch: 62, start: 5, end: 6, velocity: 0.8 },
    ]);
  });

  it('una nota muy corta dura al menos una unidad', () => {
    const [note] = quantizeNotes([{ start: 1, duration: 0.01, pitch: 60, velocity: 1 }], beats, 2);
    expect(note).toMatchObject({ start: 0, end: 1 });
  });

  it('une la misma altura repetida en el mismo lugar, quedándose con la más larga', () => {
    const notes = [
      { start: 1, duration: 0.5, pitch: 60, velocity: 0.5 },
      { start: 1.03, duration: 1, pitch: 60, velocity: 0.7 },
    ];
    expect(quantizeNotes(notes, beats, 4)).toEqual([{ pitch: 60, start: 0, end: 4, velocity: 0.7 }]);
  });
});

describe('mergeChordOnsets', () => {
  it('junta un acorde apenas arpegiado en un solo ataque y respeta cuándo se suelta cada nota', () => {
    const merged = mergeChordOnsets([
      { start: 1.05, duration: 1, pitch: 60, velocity: 0.5 },
      { start: 1, duration: 1, pitch: 53, velocity: 0.5 },
      { start: 1.07, duration: 0.5, pitch: 56, velocity: 0.5 },
    ]);
    expect(merged.map((n) => n.start)).toEqual([1, 1, 1]);
    expect(merged.map((n) => +(n.start + n.duration).toFixed(2))).toEqual([2, 2.05, 1.57]);
  });

  it('no junta notas separadas por más que la ventana', () => {
    const merged = mergeChordOnsets([
      { start: 1, duration: 1, pitch: 53, velocity: 0.5 },
      { start: 1.2, duration: 1, pitch: 56, velocity: 0.5 },
    ]);
    expect(merged.map((n) => n.start)).toEqual([1, 1.2]);
  });
});
