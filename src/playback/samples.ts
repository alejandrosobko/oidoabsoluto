/**
 * Muestras de piano disponibles en public/piano: una cada tercera menor, de La0 a Do8.
 * Cada nota se toca con la muestra más cercana, ajustando la velocidad de reproducción.
 */
const NAMES = ['C', 'Cs', 'D', 'Ds', 'E', 'F', 'Fs', 'G', 'Gs', 'A', 'As', 'B'];

export interface PianoSample {
  name: string;
  midi: number;
}

export const PIANO_SAMPLES: PianoSample[] = (() => {
  const list: PianoSample[] = [];
  for (let midi = 21; midi <= 108; midi += 3) {
    list.push({ name: `${NAMES[midi % 12]}${Math.floor(midi / 12) - 1}`, midi });
  }
  return list;
})();

/** La muestra más cercana a una altura (empate: la de abajo) y cuánto hay que transportarla. */
export function nearestSample(pitch: number): { sample: PianoSample; playbackRate: number } {
  let best = PIANO_SAMPLES[0]!;
  for (const sample of PIANO_SAMPLES) {
    if (Math.abs(sample.midi - pitch) < Math.abs(best.midi - pitch)) best = sample;
  }
  return { sample: best, playbackRate: 2 ** ((pitch - best.midi) / 12) };
}

/** Volumen de una nota según su intensidad (0 a 1), con un piso para que nada quede mudo. */
export function velocityToGain(velocity: number): number {
  const v = Math.min(1, Math.max(0, velocity));
  return 0.12 + 0.5 * v * v;
}
