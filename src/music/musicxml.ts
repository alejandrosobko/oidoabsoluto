import { spellPitch } from './key';
import type { BeatsPerMeasure, GridNote, KeySignature, Subdivision } from './types';

export interface ScoreModel {
  title: string;
  bpm: number;
  beatsPerMeasure: BeatsPerMeasure;
  subdivision: Subdivision;
  key: KeySignature;
  right: GridNote[];
  left: GridNote[];
}

/** Un acorde (o una nota sola) o un silencio, con su posición y largo en unidades de grilla. */
interface VoiceEvent {
  start: number;
  length: number;
  pitches: number[];
}

/** Pedazo de un evento dentro de un compás, ya convertido a una figura escribible. */
interface Segment {
  length: number;
  pitches: number[];
  tieStart: boolean;
  tieStop: boolean;
  wholeMeasureRest: boolean;
}

const VOICE = { right: 1, left: 5 } as const;

/**
 * Arma la línea de una mano: cada acorde dura hasta el próximo ataque de esa mano
 * (o hasta que se suelta, si es antes) y los huecos se llenan con silencios.
 */
export function buildVoice(notes: GridNote[], totalLength: number): VoiceEvent[] {
  const groups = new Map<number, GridNote[]>();
  for (const n of notes) {
    const group = groups.get(n.start);
    if (group) group.push(n);
    else groups.set(n.start, [n]);
  }
  const starts = [...groups.keys()].sort((a, b) => a - b);
  const events: VoiceEvent[] = [];
  let cursor = 0;
  starts.forEach((start, i) => {
    const group = groups.get(start) ?? [];
    const next = starts[i + 1] ?? totalLength;
    const end = Math.min(Math.max(...group.map((n) => n.end)), next);
    if (start > cursor) events.push({ start: cursor, length: start - cursor, pitches: [] });
    events.push({ start, length: end - start, pitches: [...new Set(group.map((n) => n.pitch))].sort((a, b) => a - b) });
    cursor = end;
  });
  if (cursor < totalLength) events.push({ start: cursor, length: totalLength - cursor, pitches: [] });
  return events;
}

/** Nota tal como quedó escrita (posición y largo en unidades de grilla). */
export interface WrittenNote {
  pitch: number;
  start: number;
  length: number;
  velocity: number;
}

/**
 * Las notas con la duración con que se escriben en la partitura (cada acorde cortado en el
 * ataque siguiente de su mano). Es lo que se reproduce, para que suene exactamente lo que se ve.
 */
export function writtenNotes(notes: GridNote[], totalLength: number): WrittenNote[] {
  const velocity = new Map(notes.map((n) => [`${n.pitch}@${n.start}`, n.velocity]));
  return buildVoice(notes, totalLength).flatMap((event) =>
    event.pitches.map((pitch) => ({
      pitch,
      start: event.start,
      length: event.length,
      velocity: velocity.get(`${pitch}@${event.start}`) ?? 0.6,
    })),
  );
}

/** Largo total de la partitura en unidades de grilla: compases completos hasta la última nota. */
export function scoreLength(right: GridNote[], left: GridNote[], measureLength: number): number {
  const lastEnd = Math.max(0, ...right.map((n) => n.end), ...left.map((n) => n.end));
  return Math.max(1, Math.ceil(lastEnd / measureLength)) * measureLength;
}

/** Figuras escribibles, en negras: redonda, blanca con puntillo, blanca, ..., semicorchea. */
const NOTE_VALUES: Array<{ quarters: number; type: string; dots: number }> = [
  { quarters: 4, type: 'whole', dots: 0 },
  { quarters: 3, type: 'half', dots: 1 },
  { quarters: 2, type: 'half', dots: 0 },
  { quarters: 1.5, type: 'quarter', dots: 1 },
  { quarters: 1, type: 'quarter', dots: 0 },
  { quarters: 0.75, type: 'eighth', dots: 1 },
  { quarters: 0.5, type: 'eighth', dots: 0 },
  { quarters: 0.25, type: '16th', dots: 0 },
];

function valueFor(length: number, subdivision: Subdivision) {
  return NOTE_VALUES.find((v) => v.quarters * subdivision === length);
}

/**
 * Parte un largo en figuras escribibles. Si arranca a contratiempo, primero completa
 * hasta el próximo pulso, para que el ritmo se lea por tiempos.
 */
export function decompose(position: number, length: number, subdivision: Subdivision): number[] {
  const parts: number[] = [];
  let pos = position;
  let remaining = length;
  while (remaining > 0) {
    const offBeat = pos % subdivision;
    const limit = offBeat === 0 ? remaining : Math.min(remaining, subdivision - offBeat);
    const value = NOTE_VALUES.map((v) => v.quarters * subdivision).find(
      (units) => Number.isInteger(units) && units <= limit,
    );
    const step = value ?? 1;
    parts.push(step);
    pos += step;
    remaining -= step;
  }
  return parts;
}

/** Reparte los eventos de una mano en compases, con ligaduras donde una nota cruza la barra. */
export function toMeasures(events: VoiceEvent[], measureLength: number, measureCount: number, subdivision: Subdivision): Segment[][] {
  const measures: Segment[][] = Array.from({ length: measureCount }, () => []);
  for (const event of events) {
    const pieces: Array<{ measure: number; length: number }> = [];
    let pos = event.start;
    let remaining = event.length;
    while (remaining > 0) {
      const measure = Math.floor(pos / measureLength);
      const position = pos % measureLength;
      const length = Math.min(remaining, measureLength - position);
      for (const part of decompose(position, length, subdivision)) {
        pieces.push({ measure, length: part });
      }
      pos += length;
      remaining -= length;
    }
    const isRest = event.pitches.length === 0;
    pieces.forEach((piece, i) => {
      measures[piece.measure]?.push({
        length: piece.length,
        pitches: event.pitches,
        tieStart: !isRest && i < pieces.length - 1,
        tieStop: !isRest && i > 0,
        wholeMeasureRest: false,
      });
    });
  }
  // Un compás entero de silencio se escribe como silencio de compás.
  return measures.map((segments) =>
    segments.every((s) => s.pitches.length === 0)
      ? [{ length: measureLength, pitches: [], tieStart: false, tieStop: false, wholeMeasureRest: true }]
      : segments,
  );
}

export function buildMusicXml(model: ScoreModel): string {
  const { subdivision, beatsPerMeasure, key } = model;
  const measureLength = beatsPerMeasure * subdivision;
  const total = scoreLength(model.right, model.left, measureLength);
  const measureCount = total / measureLength;

  const right = toMeasures(buildVoice(model.right, total), measureLength, measureCount, subdivision);
  const left = toMeasures(buildVoice(model.left, total), measureLength, measureCount, subdivision);

  const measuresXml: string[] = [];
  for (let m = 0; m < measureCount; m++) {
    const parts: string[] = [`<measure number="${m + 1}">`];
    if (m === 0) {
      parts.push(
        '<attributes>',
        `<divisions>${subdivision}</divisions>`,
        `<key><fifths>${key.fifths}</fifths><mode>${key.mode}</mode></key>`,
        `<time><beats>${beatsPerMeasure}</beats><beat-type>4</beat-type></time>`,
        '<staves>2</staves>',
        '<clef number="1"><sign>G</sign><line>2</line></clef>',
        '<clef number="2"><sign>F</sign><line>4</line></clef>',
        '</attributes>',
        '<direction placement="above"><direction-type><metronome>',
        `<beat-unit>quarter</beat-unit><per-minute>${Math.round(model.bpm)}</per-minute>`,
        `</metronome></direction-type><staff>1</staff><sound tempo="${Math.round(model.bpm)}"/></direction>`,
      );
    }
    parts.push(...segmentsXml(right[m] ?? [], 1, VOICE.right, subdivision, key.fifths));
    parts.push(`<backup><duration>${measureLength}</duration></backup>`);
    parts.push(...segmentsXml(left[m] ?? [], 2, VOICE.left, subdivision, key.fifths));
    parts.push('</measure>');
    measuresXml.push(parts.join(''));
  }

  return [
    '<?xml version="1.0" encoding="UTF-8"?>',
    '<!DOCTYPE score-partwise PUBLIC "-//Recordare//DTD MusicXML 3.1 Partwise//EN" "http://www.musicxml.org/dtds/partwise.dtd">',
    '<score-partwise version="3.1">',
    `<work><work-title>${escapeXml(model.title)}</work-title></work>`,
    '<identification><encoding><software>sound-2-sheet</software></encoding></identification>',
    '<part-list><score-part id="P1"><part-name>Piano</part-name></score-part></part-list>',
    '<part id="P1">',
    ...measuresXml,
    '</part>',
    '</score-partwise>',
  ].join('\n');
}

function segmentsXml(segments: Segment[], staff: number, voice: number, subdivision: Subdivision, fifths: number): string[] {
  const out: string[] = [];
  for (const s of segments) {
    if (s.wholeMeasureRest) {
      out.push(`<note><rest measure="yes"/><duration>${s.length}</duration><voice>${voice}</voice><staff>${staff}</staff></note>`);
      continue;
    }
    const value = valueFor(s.length, subdivision);
    const typeXml = value ? `<type>${value.type}</type>${'<dot/>'.repeat(value.dots)}` : '';
    if (s.pitches.length === 0) {
      out.push(`<note><rest/><duration>${s.length}</duration><voice>${voice}</voice>${typeXml}<staff>${staff}</staff></note>`);
      continue;
    }
    s.pitches.forEach((pitch, i) => {
      const { step, alter, octave } = spellPitch(pitch, fifths);
      const ties = (s.tieStop ? '<tie type="stop"/>' : '') + (s.tieStart ? '<tie type="start"/>' : '');
      const tied = (s.tieStop ? '<tied type="stop"/>' : '') + (s.tieStart ? '<tied type="start"/>' : '');
      out.push(
        '<note>' +
          (i > 0 ? '<chord/>' : '') +
          `<pitch><step>${step}</step>${alter ? `<alter>${alter}</alter>` : ''}<octave>${octave}</octave></pitch>` +
          `<duration>${s.length}</duration>${ties}<voice>${voice}</voice>${typeXml}<staff>${staff}</staff>` +
          (tied ? `<notations>${tied}</notations>` : '') +
          '</note>',
      );
    });
  }
  return out;
}

function escapeXml(text: string): string {
  return text.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}
