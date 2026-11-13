/** Nota tal como se tocó: tiempos en segundos, altura MIDI (60 = Do central). */
export interface PerformedNote {
  start: number;
  duration: number;
  pitch: number;
  /** Intensidad entre 0 y 1. */
  velocity: number;
}

/** Nota ubicada en la grilla rítmica: posiciones enteras en unidades de la figura mínima. */
export interface GridNote {
  pitch: number;
  start: number;
  end: number;
  velocity: number;
}

export type BeatsPerMeasure = 2 | 3 | 4;

/** Cuántas unidades de grilla entran en una negra: 2 = corchea, 4 = semicorchea. */
export type Subdivision = 2 | 4;

export interface ScoreOptions {
  /** Tempo forzado en negras por minuto. Sin valor, se detecta solo. */
  bpm?: number;
  beatsPerMeasure: BeatsPerMeasure;
  subdivision: Subdivision;
  /** En qué tiempo del compás cae el primer sonido (1 = primer tiempo). */
  firstBeat: number;
  /** Armadura forzada (en quintas). Sin valor, se detecta la tonalidad. */
  keyFifths?: number;
  title: string;
}

export interface KeySignature {
  /** Armadura en quintas: negativo = bemoles, positivo = sostenidos. */
  fifths: number;
  mode: 'major' | 'minor';
  /** Nombre legible, por ejemplo "Fa menor". */
  name: string;
}
