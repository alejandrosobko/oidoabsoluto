import { describe, expect, it } from 'vitest';
import { alignBeats, estimateTempo, medianBpm, onsetEnvelope, trackBeats } from './beats';
import type { PerformedNote } from './types';

/** Notas en cada pulso, con un pequeño desvío pseudoaleatorio para simular a una persona. */
function steadyNotes(bpm: number, count: number, start = 1): PerformedNote[] {
  const period = 60 / bpm;
  return Array.from({ length: count }, (_, i) => ({
    start: start + i * period + Math.sin(i * 12.9898) * 0.012,
    duration: period * 0.9,
    pitch: 60 + (i % 5),
    velocity: i % 4 === 0 ? 0.9 : 0.6,
  }));
}

describe('estimateTempo', () => {
  it.each([72, 90, 110, 128])('detecta %i negras por minuto', (bpm) => {
    const detected = estimateTempo(onsetEnvelope(steadyNotes(bpm, 64)));
    expect(Math.abs(detected - bpm)).toBeLessThan(bpm * 0.03);
  });

  it('prefiere el tempo cercano a 100 cuando hay corcheas en un pulso lento', () => {
    const quarters = steadyNotes(70, 40);
    const eighths = quarters.map((n) => ({ ...n, start: n.start + 30 / 70, velocity: 0.3, pitch: 72 }));
    const detected = estimateTempo(onsetEnvelope([...quarters, ...eighths]));
    expect(Math.min(Math.abs(detected - 70), Math.abs(detected - 140))).toBeLessThan(5);
  });
});

describe('trackBeats', () => {
  it('sigue un pulso estable', () => {
    const notes = steadyNotes(90, 48);
    const beats = trackBeats(onsetEnvelope(notes), 90);
    expect(Math.abs(medianBpm(beats) - 90)).toBeLessThan(2);
    // Cada nota queda a menos de 40 ms de algún pulso.
    for (const n of notes) {
      expect(Math.min(...beats.map((b) => Math.abs(b - n.start)))).toBeLessThan(0.04);
    }
  });

  it('acompaña un accelerando de 80 a 100', () => {
    const notes: PerformedNote[] = [];
    let t = 1;
    for (let i = 0; i < 60; i++) {
      const bpm = 80 + (20 * i) / 59;
      notes.push({ start: t, duration: 0.3, pitch: 60, velocity: 0.8 });
      t += 60 / bpm;
    }
    const beats = trackBeats(onsetEnvelope(notes), 90);
    for (const n of notes) {
      expect(Math.min(...beats.map((b) => Math.abs(b - n.start)))).toBeLessThan(0.04);
    }
  });

  it('devuelve vacío sin ataques', () => {
    expect(trackBeats(new Float64Array(100), 90)).toEqual([]);
  });
});

describe('alignBeats', () => {
  it('pone el pulso 0 en el primer sonido y extiende hasta el final', () => {
    const beats = [0.2, 1.2, 2.2, 3.2];
    const aligned = alignBeats(beats, 1.25, 6, 60);
    expect(aligned[0]).toBeCloseTo(1.2);
    expect(aligned[aligned.length - 1]).toBeGreaterThanOrEqual(7);
  });

  it('extrapola hacia atrás si el primer sonido es anterior al primer pulso', () => {
    const aligned = alignBeats([3, 4, 5], 1, 5, 60);
    expect(aligned[0]).toBeCloseTo(1);
  });

  it('usa el tempo dado si casi no hay pulsos', () => {
    const aligned = alignBeats([], 2, 4, 120);
    expect(aligned[0]).toBe(2);
    expect((aligned[1] ?? 0) - (aligned[0] ?? 0)).toBeCloseTo(0.5);
  });
});
