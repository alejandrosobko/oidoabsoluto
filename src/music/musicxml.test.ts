import { DOMParser, type Element as XmlElement } from '@xmldom/xmldom';
import { describe, expect, it } from 'vitest';
import { buildMusicXml, buildVoice, decompose, type ScoreModel } from './musicxml';
import type { GridNote } from './types';

const note = (pitch: number, start: number, end: number): GridNote => ({ pitch, start, end, velocity: 0.8 });

function model(overrides: Partial<ScoreModel> = {}): ScoreModel {
  return {
    title: 'Prueba <1> & "2"',
    bpm: 76,
    beatsPerMeasure: 4,
    subdivision: 4,
    key: { fifths: -4, mode: 'minor', name: 'Fa menor' },
    right: [],
    left: [],
    ...overrides,
  };
}

function parse(xml: string) {
  const errors: string[] = [];
  const doc = new DOMParser({ onError: (level, msg) => level !== 'warning' && errors.push(msg) }).parseFromString(xml, 'text/xml');
  expect(errors).toEqual([]);
  return doc;
}

const children = (parent: XmlElement, tag: string) =>
  Array.from(parent.childNodes).filter((n): n is XmlElement => n.nodeType === 1 && (n as XmlElement).tagName === tag);
const text = (parent: XmlElement, tag: string) => children(parent, tag)[0]?.textContent ?? '';

/** Suma, por compás y pentagrama, la duración de las notas (sin contar las de acorde). */
function durationsPerStaff(xml: string): Array<Record<string, number>> {
  const doc = parse(xml);
  return Array.from(doc.getElementsByTagName('measure')).map((measure) => {
    const totals: Record<string, number> = {};
    for (const n of children(measure as unknown as XmlElement, 'note')) {
      if (children(n, 'chord').length) continue;
      const staff = text(n, 'staff');
      totals[staff] = (totals[staff] ?? 0) + Number(text(n, 'duration'));
    }
    return totals;
  });
}

describe('decompose', () => {
  it('usa figuras con puntillo cuando entran', () => {
    expect(decompose(0, 6, 4)).toEqual([6]);
    expect(decompose(0, 12, 4)).toEqual([12]);
  });

  it('a contratiempo completa primero hasta el pulso', () => {
    expect(decompose(2, 8, 4)).toEqual([2, 6]);
  });

  it('parte largos que no son una sola figura', () => {
    expect(decompose(0, 5, 4)).toEqual([4, 1]);
  });
});

describe('buildVoice', () => {
  it('corta cada acorde en el ataque siguiente y llena huecos con silencios', () => {
    const events = buildVoice([note(60, 2, 10), note(64, 2, 6), note(67, 6, 7)], 16);
    expect(events).toEqual([
      { start: 0, length: 2, pitches: [] },
      { start: 2, length: 4, pitches: [60, 64] },
      { start: 6, length: 1, pitches: [67] },
      { start: 7, length: 9, pitches: [] },
    ]);
  });
});

describe('buildMusicXml', () => {
  it('genera XML válido con título escapado, armadura y tempo', () => {
    const xml = buildMusicXml(model({ right: [note(60, 0, 4)] }));
    const doc = parse(xml);
    expect(doc.getElementsByTagName('work-title')[0]?.textContent).toBe('Prueba <1> & "2"');
    expect(doc.getElementsByTagName('fifths')[0]?.textContent).toBe('-4');
    expect(doc.getElementsByTagName('per-minute')[0]?.textContent).toBe('76');
    expect(doc.getElementsByTagName('staves')[0]?.textContent).toBe('2');
  });

  it('cada compás de cada pentagrama suma exactamente su largo', () => {
    const right = [note(60, 0, 3), note(63, 0, 3), note(65, 3, 9), note(67, 13, 30)];
    const left = [note(41, 0, 16), note(29, 0, 16), note(46, 18, 19)];
    const totals = durationsPerStaff(buildMusicXml(model({ right, left })));
    expect(totals).toHaveLength(2);
    for (const measure of totals) expect(measure).toEqual({ '1': 16, '2': 16 });
  });

  it('liga las notas que cruzan la barra de compás', () => {
    const doc = parse(buildMusicXml(model({ right: [note(60, 12, 20)] })));
    const ties = Array.from(doc.getElementsByTagName('tie')).map((t) => t.getAttribute('type'));
    expect(ties).toEqual(['start', 'stop']);
  });

  it('marca los acordes y escribe con bemoles', () => {
    const doc = parse(buildMusicXml(model({ right: [note(53, 0, 4), note(56, 0, 4), note(60, 0, 4)] })));
    expect(doc.getElementsByTagName('chord')).toHaveLength(2);
    const alters = Array.from(doc.getElementsByTagName('alter')).map((a) => a.textContent);
    expect(alters).toEqual(['-1']);
  });

  it('un compás vacío es un silencio de compás', () => {
    const doc = parse(buildMusicXml(model({ right: [note(60, 16, 20)] })));
    const measureRests = Array.from(doc.getElementsByTagName('rest')).filter((r) => r.getAttribute('measure') === 'yes');
    // Compás 1 vacío en las dos manos, compás 2 vacío en la izquierda.
    expect(measureRests).toHaveLength(3);
  });

  it('respeta el compás de 3/4 y la grilla de corcheas', () => {
    const xml = buildMusicXml(model({ beatsPerMeasure: 3, subdivision: 2, right: [note(60, 0, 2), note(62, 2, 7)] }));
    const totals = durationsPerStaff(xml);
    for (const measure of totals) expect(measure).toEqual({ '1': 6, '2': 6 });
    expect(parse(xml).getElementsByTagName('beats')[0]?.textContent).toBe('3');
  });
});
