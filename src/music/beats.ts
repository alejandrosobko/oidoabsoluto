import type { PerformedNote } from './types';

/** Resolución temporal del análisis de pulso (cuadros por segundo). */
export const ENVELOPE_FPS = 100;

const MIN_BPM = 40;
const MAX_BPM = 200;
/** Tempo "preferido" para desempatar entre mitad y doble (las baladas rondan este valor). */
const PREFERRED_BPM = 100;

/**
 * Curva de ataques: un pico por cada nota que empieza, pesado por su intensidad
 * y suavizado para tolerar pequeñas imprecisiones.
 */
export function onsetEnvelope(notes: PerformedNote[], fps = ENVELOPE_FPS): Float64Array {
  const last = notes.reduce((max, n) => Math.max(max, n.start + n.duration), 0);
  const raw = new Float64Array(Math.ceil(last * fps) + 2);
  for (const n of notes) {
    const i = Math.round(n.start * fps);
    raw[i] = (raw[i] ?? 0) + Math.max(n.velocity, 0.05);
  }
  return gaussianSmooth(raw, 2);
}

function gaussianSmooth(values: Float64Array, sigma: number): Float64Array {
  const radius = Math.ceil(sigma * 3);
  const kernel: number[] = [];
  for (let k = -radius; k <= radius; k++) kernel.push(Math.exp(-0.5 * (k / sigma) ** 2));
  const out = new Float64Array(values.length);
  for (let i = 0; i < values.length; i++) {
    let sum = 0;
    for (let k = -radius; k <= radius; k++) {
      const j = i + k;
      if (j >= 0 && j < values.length) sum += (values[j] ?? 0) * (kernel[k + radius] ?? 0);
    }
    out[i] = sum;
  }
  return out;
}

/** Estima el tempo (negras por minuto) por autocorrelación de la curva de ataques. */
export function estimateTempo(envelope: Float64Array, fps = ENVELOPE_FPS): number {
  const minLag = Math.floor((60 * fps) / MAX_BPM);
  const maxLag = Math.ceil((60 * fps) / MIN_BPM);
  let bestLag = 0;
  let bestScore = -Infinity;
  const scores: number[] = [];
  for (let lag = minLag; lag <= maxLag && lag < envelope.length; lag++) {
    let sum = 0;
    for (let i = 0; i + lag < envelope.length; i++) sum += (envelope[i] ?? 0) * (envelope[i + lag] ?? 0);
    const ac = sum / (envelope.length - lag);
    const bpm = (60 * fps) / lag;
    const weight = Math.exp(-0.5 * Math.log2(bpm / PREFERRED_BPM) ** 2);
    const score = ac * weight;
    scores[lag] = score;
    if (score > bestScore) {
      bestScore = score;
      bestLag = lag;
    }
  }
  if (bestLag === 0) return PREFERRED_BPM;
  // Interpolación parabólica para afinar el período entre cuadros.
  const prev = scores[bestLag - 1];
  const next = scores[bestLag + 1];
  let lag = bestLag;
  if (prev !== undefined && next !== undefined) {
    const denom = prev - 2 * bestScore + next;
    if (denom !== 0) lag = bestLag + (0.5 * (prev - next)) / denom;
  }
  return (60 * fps) / lag;
}

/**
 * Sigue el pulso con programación dinámica (método de Ellis, 2007): elige la secuencia
 * de pulsos que mejor coincide con los ataques sin alejarse demasiado del tempo dado.
 * Tolera que el intérprete acelere o frene. Devuelve los tiempos de cada pulso en segundos.
 */
export function trackBeats(
  envelope: Float64Array,
  bpm: number,
  fps = ENVELOPE_FPS,
  tightness = 100,
): number[] {
  const period = (60 * fps) / bpm;
  const n = envelope.length;
  if (n === 0 || period <= 0) return [];

  const std = Math.sqrt(envelope.reduce((s, v) => s + v * v, 0) / n);
  if (std === 0) return [];
  const local = Array.from(envelope, (v) => v / std);

  const score = new Float64Array(n);
  const back = new Int32Array(n).fill(-1);
  for (let t = 0; t < n; t++) {
    const from = Math.max(0, Math.round(t - 2 * period));
    const to = Math.round(t - period / 2);
    let best = -Infinity;
    let bestPrev = -1;
    for (let p = from; p <= to; p++) {
      const penalty = tightness * Math.log((t - p) / period) ** 2;
      const value = (score[p] ?? 0) - penalty;
      if (value > best) {
        best = value;
        bestPrev = p;
      }
    }
    // Un pulso puede "arrancar" una secuencia nueva si no le conviene seguir una previa.
    if (bestPrev >= 0 && best > 0) {
      score[t] = (local[t] ?? 0) + best;
      back[t] = bestPrev;
    } else {
      score[t] = local[t] ?? 0;
    }
  }

  // El último pulso: el de mayor puntaje dentro del último período con actividad.
  let lastActive = n - 1;
  while (lastActive > 0 && (envelope[lastActive] ?? 0) < 1e-3 * std) lastActive--;
  let end = lastActive;
  for (let t = Math.max(0, Math.round(lastActive - period)); t <= lastActive; t++) {
    if ((score[t] ?? 0) > (score[end] ?? 0)) end = t;
  }

  const frames: number[] = [];
  for (let t = end; t >= 0; t = back[t] ?? -1) frames.push(t);
  return frames.reverse().map((f) => f / fps);
}

/**
 * Deja los pulsos listos para cuantizar: el pulso 0 es el más cercano al primer sonido,
 * y se extrapola hacia atrás y adelante para cubrir todas las notas.
 */
export function alignBeats(beats: number[], firstOnset: number, lastTime: number, bpm: number): number[] {
  const fallback = 60 / bpm;
  const out = beats.length >= 2 ? [...beats] : [firstOnset, firstOnset + fallback];

  const firstPeriod = (out[1] ?? 0) - (out[0] ?? 0) || fallback;
  while ((out[0] ?? 0) > firstOnset - firstPeriod / 2) out.unshift((out[0] ?? 0) - firstPeriod);

  let nearest = 0;
  for (let i = 0; i < out.length; i++) {
    if (Math.abs((out[i] ?? 0) - firstOnset) < Math.abs((out[nearest] ?? 0) - firstOnset)) nearest = i;
  }
  const aligned = out.slice(nearest);

  const lastPeriod =
    (aligned[aligned.length - 1] ?? 0) - (aligned[aligned.length - 2] ?? 0) || fallback;
  while ((aligned[aligned.length - 1] ?? 0) < lastTime + lastPeriod) {
    aligned.push((aligned[aligned.length - 1] ?? 0) + lastPeriod);
  }
  return aligned;
}

/** Tempo representativo (mediana de los intervalos entre pulsos), en negras por minuto. */
export function medianBpm(beats: number[]): number {
  const intervals = beats.slice(1).map((b, i) => b - (beats[i] ?? 0)).sort((a, b) => a - b);
  const mid = intervals[Math.floor(intervals.length / 2)];
  return mid ? 60 / mid : PREFERRED_BPM;
}
