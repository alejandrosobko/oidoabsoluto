import { alignBeats, estimateTempo, medianBpm, onsetEnvelope, trackBeats } from './beats';
import { splitHands } from './hands';
import { detectKey, keySignatureFromFifths } from './key';
import { buildMusicXml, scoreLength, writtenNotes } from './musicxml';
import { mergeChordOnsets, quantizeNotes } from './quantize';
import type { KeySignature, PerformedNote, ScoreOptions } from './types';

export interface ScoreResult {
  musicXml: string;
  /** Tempo usado en la partitura (negras por minuto). */
  bpm: number;
  /** Tempo detectado automáticamente, para mostrarlo aunque se haya forzado otro. */
  detectedBpm: number;
  key: KeySignature;
  measureCount: number;
  noteCount: number;
  /** Lo escrito en la partitura, en negras desde el inicio, para reproducirlo. */
  playback: PlaybackNote[];
  /** Largo total de la partitura en negras. */
  totalBeats: number;
}

export interface PlaybackNote {
  pitch: number;
  /** Inicio y duración en negras desde el comienzo de la partitura. */
  start: number;
  duration: number;
  velocity: number;
}

/** De las notas tocadas a la partitura: pulso, cuantización, manos, tonalidad y MusicXML. */
export function buildScore(performed: PerformedNote[], options: ScoreOptions): ScoreResult {
  if (performed.length === 0) {
    throw new Error('No se detectaron notas en el audio.');
  }
  const notes = mergeChordOnsets(performed);
  const envelope = onsetEnvelope(notes);
  const detectedBpm = estimateTempo(envelope);
  const targetBpm = options.bpm && options.bpm > 0 ? options.bpm : detectedBpm;

  const firstOnset = Math.min(...notes.map((n) => n.start));
  const lastTime = Math.max(...notes.map((n) => n.start + n.duration));
  const beats = alignBeats(trackBeats(envelope, targetBpm), firstOnset, lastTime, targetBpm);
  const bpm = options.bpm && options.bpm > 0 ? options.bpm : medianBpm(beats);

  const measureLength = options.beatsPerMeasure * options.subdivision;
  const quantized = quantizeNotes(notes, beats, options.subdivision);
  let offset = (clampBeat(options.firstBeat, options.beatsPerMeasure) - 1) * options.subdivision;
  // Si algo quedó antes del inicio (un ataque apenas adelantado), se agregan compases al principio.
  const earliest = Math.min(...quantized.map((n) => n.start)) + offset;
  if (earliest < 0) offset += Math.ceil(-earliest / measureLength) * measureLength;
  const grid = quantized.map((n) => ({ ...n, start: n.start + offset, end: n.end + offset }));

  const { right, left } = splitHands(grid);
  const key = options.keyFifths === undefined ? detectKey(notes) : keySignatureFromFifths(options.keyFifths);
  const musicXml = buildMusicXml({
    title: options.title,
    bpm,
    beatsPerMeasure: options.beatsPerMeasure,
    subdivision: options.subdivision,
    key,
    right,
    left,
  });
  const total = scoreLength(right, left, measureLength);
  const playback = [...writtenNotes(right, total), ...writtenNotes(left, total)]
    .map((n) => ({
      pitch: n.pitch,
      start: n.start / options.subdivision,
      duration: n.length / options.subdivision,
      velocity: n.velocity,
    }))
    .sort((a, b) => a.start - b.start || a.pitch - b.pitch);
  return {
    musicXml,
    bpm,
    detectedBpm,
    key,
    measureCount: total / measureLength,
    noteCount: grid.length,
    playback,
    totalBeats: total / options.subdivision,
  };
}

function clampBeat(beat: number, beatsPerMeasure: number): number {
  return Math.min(Math.max(1, Math.round(beat) || 1), beatsPerMeasure);
}
