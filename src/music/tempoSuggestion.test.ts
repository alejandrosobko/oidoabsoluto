import { describe, expect, it } from 'vitest';
import { buildScore } from './score';
import { bestFirstBeat, crowdedOnsetRatio, gridError } from './tempoSuggestion';
import type { PerformedNote, ScoreOptions } from './types';

/** Pulsos parejos de `period` segundos. */
function grid(period: number, count: number, start = 0): number[] {
  return Array.from({ length: count }, (_, i) => start + i * period);
}

/** Notas a partir de [altura, duración en negras], una detrás de otra, a `bpm`. */
function melody(bpm: number, notes: [number, number][], start = 1): PerformedNote[] {
  const beat = 60 / bpm;
  let t = start;
  return notes.map(([pitch, length]) => {
    const note = { start: t, duration: length * beat * 0.9, pitch, velocity: 0.7 };
    t += length * beat;
    return note;
  });
}

/** El motivo de Carol of the Bells (Si♭ negra, La–Si♭ corcheas, Sol negra) en 3/4, con un bajo por compás. */
function carol(bpm: number, bars = 12): PerformedNote[] {
  const beat = 60 / bpm;
  const notes: PerformedNote[] = [];
  for (let bar = 0; bar < bars; bar++) {
    const t0 = 1 + bar * 3 * beat;
    notes.push({ start: t0, duration: 3 * beat * 0.95, pitch: 43 + (bar % 4), velocity: 0.5 });
    notes.push(...melody(bpm, [[70, 1], [69, 0.5], [70, 0.5], [67, 1]], t0));
  }
  return notes;
}

/**
 * El comienzo de Hedwig's Theme (Williams), escrito en 3/4 a `bpm`, con anacrusa:
 * Si | Mi. Sol Fa# | Mi Si | La | Fa# | Mi. Sol Fa# | Re# Fa | Si.
 * El pulso que más se oye es el del compás, así que el tempo se detecta a un tercio.
 */
function hedwig(bpm: number, times = 3): PerformedNote[] {
  const phrase: [number, number][] = [
    [59, 1], [64, 1.5], [67, 0.5], [66, 1], [64, 2], [71, 1], [69, 3], [66, 3],
    [64, 1.5], [67, 0.5], [66, 1], [63, 2], [65, 1], [59, 3], [59, 2],
  ];
  return melody(bpm, Array.from({ length: times }, () => phrase).flat());
}

/** Una melodía en negras y corcheas en 4/4 a 100 bpm: el tempo se detecta bien. */
function straight(): PerformedNote[] {
  const bar: [number, number][] = [[60, 1], [62, 0.5], [64, 0.5], [65, 1], [67, 1]];
  return melody(100, Array.from({ length: 12 }, () => bar).flat());
}

const options: ScoreOptions = { beatsPerMeasure: 4, subdivision: 2, firstBeat: 1, title: 'Prueba' };

describe('crowdedOnsetRatio', () => {
  const at = (...starts: number[]): PerformedNote[] =>
    starts.map((start) => ({ start, duration: 0.2, pitch: 60, velocity: 0.5 }));

  it('es 0 si cada ataque cae en su propia corchea', () => {
    expect(crowdedOnsetRatio(at(0, 0.5, 1, 1.5, 2, 2.5, 3, 3.5, 4), grid(1, 6))).toBe(0);
  });

  it('cuenta los ataques que caen en la misma corchea que el anterior', () => {
    // Semicorcheas con pulso de 1 s: la mitad cae encimada (8 de 16 intervalos).
    const sixteenths = at(...Array.from({ length: 17 }, (_, i) => i * 0.25 + 0.01));
    expect(crowdedOnsetRatio(sixteenths, grid(1, 6))).toBeCloseTo(0.5, 1);
  });

  it('las notas de un mismo acorde son un solo ataque', () => {
    const chords = at(0, 0, 0, 0.5, 0.5, 1, 1, 1.5, 2, 2.5, 3, 3.5, 4);
    expect(crowdedOnsetRatio(chords, grid(1, 6))).toBe(0);
  });

  it('con muy pocas notas no opina', () => {
    expect(crowdedOnsetRatio(at(0, 0.1, 0.2), grid(1, 4))).toBe(0);
  });
});

describe('gridError', () => {
  const at = (...starts: number[]): PerformedNote[] =>
    starts.map((start) => ({ start, duration: 0.2, pitch: 60, velocity: 0.5 }));

  it('es 0 si todo cae justo en la grilla', () => {
    expect(gridError(at(0, 0.5, 1, 2.5), grid(1, 4), 2)).toBe(0);
  });

  it('notas de a tercios encajan en una grilla de a 3 y no en una de a 2', () => {
    const thirds = at(...Array.from({ length: 9 }, (_, i) => i / 3));
    expect(gridError(thirds, grid(1, 4), 3)).toBeCloseTo(0, 5);
    expect(gridError(thirds, grid(1, 4), 2)).toBeGreaterThan(0.2);
  });
});

describe('bestFirstBeat', () => {
  it('pone las notas largas en el primer tiempo aunque haya anacrusa', () => {
    // Hedwig a 150: con pulsos en negras, la primera nota (Si) es el tercer tiempo.
    const notes = hedwig(150, 2);
    expect(bestFirstBeat(notes, grid(60 / 150, 60, 1), 3)).toBe(3);
  });
});

describe('buildScore con sugerencia de tempo', () => {
  it('Carol of the Bells a 154: detecta la mitad y sugiere el doble, sin cambiar el compás', () => {
    const result = buildScore(carol(154), options);
    expect(Math.abs(result.detectedBpm - 77)).toBeLessThan(2);
    expect(result.tempoSuggestion?.factor).toBe(2);
    expect(Math.abs((result.tempoSuggestion?.bpm ?? 0) - 154)).toBeLessThanOrEqual(2);
    expect(result.tempoSuggestion?.beatsPerMeasure).toBeUndefined();
  });

  it('Hedwig a 165: detecta un tercio y sugiere el triple en 3/4 empezando en el tiempo 3', () => {
    const result = buildScore(hedwig(165), options);
    expect(Math.abs(result.detectedBpm - 55)).toBeLessThan(2);
    expect(result.tempoSuggestion).toMatchObject({ factor: 3, beatsPerMeasure: 3, firstBeat: 3 });
    expect(Math.abs((result.tempoSuggestion?.bpm ?? 0) - 165)).toBeLessThanOrEqual(3);
  });

  it('si el tempo se detecta bien, no sugiere nada', () => {
    const result = buildScore(straight(), options);
    expect(Math.abs(result.detectedBpm - 100)).toBeLessThan(2);
    expect(result.tempoSuggestion).toBeUndefined();
  });

  it('con el tempo forzado no sugiere nada', () => {
    expect(buildScore(carol(154), { ...options, bpm: 77 }).tempoSuggestion).toBeUndefined();
    expect(buildScore(hedwig(165), { ...options, bpm: 55 }).tempoSuggestion).toBeUndefined();
  });
});
