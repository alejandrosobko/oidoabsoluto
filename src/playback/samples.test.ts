import { describe, expect, it } from 'vitest';
import { nearestSample, PIANO_SAMPLES, velocityToGain } from './samples';

describe('PIANO_SAMPLES', () => {
  it('cubre el teclado entero, una cada tercera menor, con los nombres de los archivos', () => {
    expect(PIANO_SAMPLES).toHaveLength(30);
    expect(PIANO_SAMPLES[0]).toEqual({ name: 'A0', midi: 21 });
    expect(PIANO_SAMPLES.map((s) => s.name)).toContain('Ds4');
    expect(PIANO_SAMPLES.map((s) => s.name)).toContain('Fs4');
    expect(PIANO_SAMPLES[PIANO_SAMPLES.length - 1]).toEqual({ name: 'C8', midi: 108 });
  });
});

describe('nearestSample', () => {
  it('usa la muestra exacta sin transportar', () => {
    expect(nearestSample(60)).toEqual({ sample: { name: 'C4', midi: 60 }, playbackRate: 1 });
  });

  it('transporta como mucho un semitono', () => {
    for (let pitch = 21; pitch <= 108; pitch++) {
      const { sample, playbackRate } = nearestSample(pitch);
      expect(Math.abs(sample.midi - pitch)).toBeLessThanOrEqual(1);
      expect(playbackRate).toBeCloseTo(2 ** ((pitch - sample.midi) / 12));
    }
  });

  it('notas fuera del piano usan la muestra del extremo', () => {
    expect(nearestSample(10).sample.name).toBe('A0');
    expect(nearestSample(115).sample.name).toBe('C8');
  });
});

describe('velocityToGain', () => {
  it('crece con la intensidad y nunca es cero', () => {
    expect(velocityToGain(0)).toBeGreaterThan(0);
    expect(velocityToGain(1)).toBeGreaterThan(velocityToGain(0.5));
    expect(velocityToGain(2)).toBe(velocityToGain(1));
  });
});
