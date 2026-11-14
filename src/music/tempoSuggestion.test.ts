import { describe, expect, it } from 'vitest';
import { buildScore } from './score';
import { crowdedOnsetRatio, suggestTempo } from './tempoSuggestion';
import type { PerformedNote, ScoreOptions } from './types';

/** Pulsos parejos de `period` segundos. */
function grid(period: number, count: number): number[] {
  return Array.from({ length: count }, (_, i) => i * period);
}

/**
 * El motivo de Carol of the Bells (Si♭ negra, La–Si♭ corcheas, Sol negra) en 3/4 a `bpm`,
 * con un bajo en cada compás.
 */
function carol(bpm: number, bars = 12): PerformedNote[] {
  const beat = 60 / bpm;
  const motif = [
    { at: 0, pitch: 70, length: 1 },
    { at: 1, pitch: 69, length: 0.5 },
    { at: 1.5, pitch: 70, length: 0.5 },
    { at: 2, pitch: 67, length: 1 },
  ];
  const notes: PerformedNote[] = [];
  for (let bar = 0; bar < bars; bar++) {
    const t0 = 1 + bar * 3 * beat;
    notes.push({ start: t0, duration: 3 * beat * 0.95, pitch: 43 + (bar % 4), velocity: 0.5 });
    for (const m of motif) {
      notes.push({ start: t0 + m.at * beat, duration: m.length * beat * 0.9, pitch: m.pitch, velocity: 0.7 });
    }
  }
  return notes;
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

describe('suggestTempo', () => {
  it('sugiere el doble cuando el tempo detectado es la mitad del real', () => {
    const notes = carol(154);
    expect(suggestTempo(notes, grid(60 / 77, 30), 77)).toBe(154);
  });

  it('no sugiere nada si el tempo ya es el correcto', () => {
    const notes = carol(154);
    expect(suggestTempo(notes, grid(60 / 154, 60), 154)).toBeUndefined();
  });

  it('no sugiere tempos imposibles de escribir en el campo', () => {
    const notes = carol(154);
    expect(suggestTempo(notes, grid(60 / 130, 40), 130)).toBeUndefined();
  });
});

describe('buildScore con sugerencia de tempo', () => {
  it('a Carol of the Bells a 154 lo detecta a la mitad y sugiere el doble', () => {
    const result = buildScore(carol(154), options);
    expect(Math.abs(result.detectedBpm - 77)).toBeLessThan(2);
    expect(Math.abs((result.suggestedBpm ?? 0) - 154)).toBeLessThanOrEqual(2);
  });

  it('si el tempo se detecta bien, no sugiere nada', () => {
    const result = buildScore(carol(140), options);
    expect(Math.abs(result.detectedBpm - 140)).toBeLessThan(2);
    expect(result.suggestedBpm).toBeUndefined();
  });

  it('con el tempo forzado no sugiere nada', () => {
    expect(buildScore(carol(154), { ...options, bpm: 77 }).suggestedBpm).toBeUndefined();
  });
});
