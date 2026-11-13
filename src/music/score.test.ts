import { describe, expect, it } from 'vitest';
import { buildScore } from './score';
import type { PerformedNote, ScoreOptions } from './types';

const options: ScoreOptions = { beatsPerMeasure: 4, subdivision: 4, firstBeat: 1, title: 'Prueba' };

/** Ocho compases de Fam – La♭ – Si♭ – Fam a 80 bpm: bajo en blancas y acorde en negras. */
function ballad(bpm = 80, startAt = 13): PerformedNote[] {
  const beat = 60 / bpm;
  const chords = [
    { bass: [29, 41], upper: [53, 56, 60] },
    { bass: [32, 44], upper: [56, 60, 63] },
    { bass: [34, 46], upper: [58, 62, 65] },
    { bass: [29, 41], upper: [53, 56, 60] },
  ];
  const notes: PerformedNote[] = [];
  for (let bar = 0; bar < 8; bar++) {
    const chord = chords[bar % 4]!;
    for (let b = 0; b < 4; b++) {
      const t = startAt + (bar * 4 + b) * beat;
      if (b % 2 === 0) chord.bass.forEach((pitch) => notes.push({ start: t, duration: beat * 1.9, pitch, velocity: 0.8 }));
      chord.upper.forEach((pitch) => notes.push({ start: t + 0.01, duration: beat * 0.9, pitch, velocity: 0.6 }));
    }
  }
  return notes;
}

describe('buildScore', () => {
  it('arma la partitura de una balada: tonalidad, tempo y compases', () => {
    const result = buildScore(ballad(), options);
    expect(result.key.name).toBe('Fa menor');
    // El pulso se mide en cuadros de 10 ms: a 80 bpm, un cuadro equivale a ~1 bpm.
    expect(Math.abs(result.bpm - 80)).toBeLessThan(1.5);
    expect(result.measureCount).toBe(8);
    expect(result.musicXml).toContain('<score-partwise');
  });

  it('respeta el tempo forzado', () => {
    const result = buildScore(ballad(), { ...options, bpm: 40 });
    expect(result.bpm).toBe(40);
    expect(result.measureCount).toBe(4);
  });

  it('el primer sonido en el tiempo 3 agrega dos negras de silencio al inicio', () => {
    const result = buildScore(ballad(), { ...options, firstBeat: 3 });
    expect(result.measureCount).toBe(9);
  });

  it('usa la armadura elegida a mano', () => {
    const result = buildScore(ballad(), { ...options, keyFifths: -2 });
    expect(result.key.fifths).toBe(-2);
    expect(result.musicXml).toContain('<fifths>-2</fifths>');
  });

  it('no pierde un primer acorde que cae apenas antes del pulso', () => {
    const notes = ballad();
    const early = notes.map((n, i) => (i < 2 ? { ...n, start: n.start - 0.35 } : n));
    const result = buildScore(early, options);
    expect(result.noteCount).toBe(buildScore(notes, options).noteCount);
  });

  it('lo que se reproduce es exactamente lo escrito en la partitura', () => {
    const result = buildScore(ballad(), options);
    // Cada nota escrita (sin contar las continuaciones de ligadura) es una nota que suena.
    const written = result.musicXml.split('<note>').filter((n) => n.includes('<pitch>') && !n.includes('<tie type="stop"/>'));
    expect(result.playback).toHaveLength(written.length);
    expect(result.totalBeats).toBe(result.measureCount * 4);
    for (const n of result.playback) {
      expect(n.start).toBeGreaterThanOrEqual(0);
      expect(n.start + n.duration).toBeLessThanOrEqual(result.totalBeats);
    }
  });

  it('si se quitan notas, se reproducen menos', () => {
    const all = buildScore(ballad(), options);
    const fewer = buildScore(ballad().filter((n) => n.pitch !== 60), options);
    expect(fewer.playback.length).toBeLessThan(all.playback.length);
    expect(fewer.playback.some((n) => n.pitch === 60)).toBe(false);
  });

  it('falla con un mensaje claro si no hay notas', () => {
    expect(() => buildScore([], options)).toThrow('No se detectaron notas');
  });
});
