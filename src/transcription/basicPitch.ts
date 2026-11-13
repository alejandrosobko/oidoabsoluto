import * as tf from '@tensorflow/tfjs';
import {
  addPitchBendsToNoteEvents,
  BasicPitch,
  noteFramesToTime,
  outputToNotesPoly,
} from '@spotify/basic-pitch';
import type { PerformedNote } from '../music/types';

/** Basic Pitch espera audio mono a esta frecuencia de muestreo. */
export const MODEL_SAMPLE_RATE = 22050;

/** Salida cruda del modelo. Se guarda para poder re-extraer notas con otra sensibilidad sin re-procesar. */
export interface ModelOutput {
  frames: number[][];
  onsets: number[][];
  contours: number[][];
}

const PIANO_LOWEST = 21;
const PIANO_HIGHEST = 108;
/** Largo mínimo de nota en cuadros del modelo (~128 ms, el valor por defecto de Basic Pitch). */
const MIN_NOTE_FRAMES = 11;

let modelPromise: Promise<tf.GraphModel> | undefined;

/**
 * Carga el modelo una sola vez. `source` es la URL de model.json (navegador)
 * o un IOHandler que lee los archivos del disco (Node).
 */
export function loadModel(source: string | tf.io.IOHandler): Promise<tf.GraphModel> {
  modelPromise ??= tf.ready().then(() => tf.loadGraphModel(source));
  return modelPromise;
}

export function activeBackend(): string {
  return tf.getBackend();
}

/** Corre el modelo sobre audio mono a 22050 Hz e informa el avance entre 0 y 1. */
export async function runModel(
  audio: Float32Array,
  source: string | tf.io.IOHandler,
  onProgress: (fraction: number) => void,
): Promise<ModelOutput> {
  const basicPitch = new BasicPitch(loadModel(source));
  const output: ModelOutput = { frames: [], onsets: [], contours: [] };
  await basicPitch.evaluateModel(
    audio,
    (frames, onsets, contours) => {
      output.frames.push(...frames);
      output.onsets.push(...onsets);
      output.contours.push(...contours);
    },
    onProgress,
  );
  onProgress(1);
  return output;
}

/**
 * Convierte la salida del modelo en notas. `sensitivity` va de 0 (solo notas muy claras)
 * a 1 (todo lo que suene, con más riesgo de notas fantasma); 0.5 son los valores por defecto.
 */
export function extractNotes(output: ModelOutput, sensitivity = 0.5): PerformedNote[] {
  const s = Math.min(1, Math.max(0, sensitivity));
  const onsetThreshold = 0.75 - 0.5 * s;
  const frameThreshold = 0.45 - 0.3 * s;
  // Sin el "melodia trick" de Basic Pitch: busca notas sin ataque en la energía sobrante recorriendo
  // la matriz entera por cada nota (en un tema de 3 min tarda ~25 s contra 0,3 s). En piano toda
  // nota real tiene ataque, así que lo que agrega es sobre todo resonancia y pedal.
  const events = outputToNotesPoly(
    output.frames,
    output.onsets,
    onsetThreshold,
    frameThreshold,
    MIN_NOTE_FRAMES,
    true,
    null,
    null,
    false,
  );
  return noteFramesToTime(addPitchBendsToNoteEvents(output.contours, events))
    .filter((n) => n.pitchMidi >= PIANO_LOWEST && n.pitchMidi <= PIANO_HIGHEST)
    .map((n) => ({
      start: n.startTimeSeconds,
      duration: n.durationSeconds,
      pitch: n.pitchMidi,
      velocity: n.amplitude,
    }))
    .sort((a, b) => a.start - b.start || a.pitch - b.pitch);
}
