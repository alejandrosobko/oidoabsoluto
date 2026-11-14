import { describe, expect, it } from 'vitest';
import { spellPitch } from './key';
import { describeNote, solfegeName } from './noteName';

describe('solfegeName', () => {
  it('nombra el Do central como Do4', () => {
    expect(solfegeName(spellPitch(60, 0))).toBe('Do4');
  });

  it('usa sostenidos o bemoles según cómo está escrita', () => {
    expect(solfegeName({ step: 'F', alter: 1, octave: 3 })).toBe('Fa♯3');
    expect(solfegeName({ step: 'B', alter: -1, octave: 2 })).toBe('Si♭2');
    expect(solfegeName({ step: 'C', alter: 2, octave: 5 })).toBe('Do𝄪5');
  });
});

describe('describeNote', () => {
  it('incluye la clave y el compás', () => {
    expect(describeNote({ step: 'A', alter: 0, octave: 4 }, 'treble', 3)).toBe('La4 · clave de sol · compás 3');
    expect(describeNote({ step: 'E', alter: -1, octave: 2 }, 'bass')).toBe('Mi♭2 · clave de fa');
  });
});
