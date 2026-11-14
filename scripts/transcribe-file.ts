/**
 * Transcribe un archivo desde la terminal (útil para probar ajustes sin abrir el navegador).
 *
 *   npm run transcribe -- "<archivo de audio o video>" [--bpm 80] [--beats 4] [--sub 2] [--first 1] [--key -4] [--sensitivity 0.5]
 *
 * Necesita ffmpeg instalado. Deja en out/ el .musicxml, el .mid y un caché de la salida
 * del modelo, para que las corridas siguientes con el mismo archivo sean instantáneas.
 */
import { execFileSync } from 'node:child_process';
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { basename, extname, join } from 'node:path';
import type { io } from '@tensorflow/tfjs';
import { buildMidi } from '../src/music/midi';
import { buildScore } from '../src/music/score';
import type { BeatsPerMeasure, Subdivision } from '../src/music/types';
import { extractNotes, MODEL_SAMPLE_RATE, runModel, type ModelOutput } from '../src/transcription/basicPitch';
import { decodeModelOutput, encodeModelOutput } from '../src/transcription/modelOutputBinary';

const args = process.argv.slice(2);
const input = args.find((a) => !a.startsWith('--') && !/^-?[\d.]+$/.test(a));
if (!input || !existsSync(input)) {
  console.error('Uso: npm run transcribe -- "<archivo>" [--bpm N] [--beats 2|3|4] [--sub 2|4] [--first N] [--key -6..6] [--sensitivity 0-1]');
  process.exit(1);
}
const flag = (name: string): number | undefined => {
  const i = args.indexOf(`--${name}`);
  const value = i >= 0 ? Number(args[i + 1]) : NaN;
  return Number.isFinite(value) ? value : undefined;
};

const root = join(import.meta.dirname, '..');
const outDir = join(root, 'out');
mkdirSync(outDir, { recursive: true });
const name = basename(input, extname(input));
const cachePath = join(outDir, `${name}.model.bin`);

function modelHandler(): io.IOHandler {
  const dir = join(root, 'public', 'model');
  const manifest = JSON.parse(readFileSync(join(dir, 'model.json'), 'utf8'));
  const weights = readFileSync(join(dir, 'group1-shard1of1.bin'));
  return {
    load: async () => ({
      modelTopology: manifest.modelTopology,
      format: manifest.format,
      generatedBy: manifest.generatedBy,
      convertedBy: manifest.convertedBy,
      weightSpecs: manifest.weightsManifest[0].weights,
      weightData: weights.buffer.slice(weights.byteOffset, weights.byteOffset + weights.byteLength),
    }),
  };
}

function decode(file: string): Float32Array {
  const pcm = execFileSync(
    'ffmpeg',
    ['-loglevel', 'error', '-i', file, '-ac', '1', '-ar', String(MODEL_SAMPLE_RATE), '-f', 'f32le', '-'],
    { maxBuffer: 1024 * 1024 * 1024 },
  );
  return new Float32Array(pcm.buffer, pcm.byteOffset, pcm.byteLength / 4);
}

let output: ModelOutput;
if (existsSync(cachePath)) {
  console.log('Usando caché del modelo:', cachePath);
  output = decodeModelOutput(readFileSync(cachePath));
} else {
  const audio = decode(input);
  console.log(`Audio: ${(audio.length / MODEL_SAMPLE_RATE).toFixed(1)} s. Procesando…`);
  const started = Date.now();
  let lastLogged = -1;
  output = await runModel(audio, modelHandler(), (p) => {
    const pct = Math.floor(p * 10) * 10;
    if (pct !== lastLogged) {
      lastLogged = pct;
      console.log(`  ${pct}%`);
    }
  });
  console.log(`Modelo: ${((Date.now() - started) / 1000).toFixed(1)} s`);
  writeFileSync(cachePath, encodeModelOutput(output));
}

const notes = extractNotes(output, flag('sensitivity') ?? 0.5);
const score = buildScore(notes, {
  bpm: flag('bpm'),
  beatsPerMeasure: (flag('beats') ?? 4) as BeatsPerMeasure,
  subdivision: (flag('sub') ?? 2) as Subdivision,
  firstBeat: flag('first') ?? 1,
  keyFifths: flag('key'),
  title: name,
});

writeFileSync(join(outDir, `${name}.musicxml`), score.musicXml);
writeFileSync(join(outDir, `${name}.mid`), buildMidi(notes, name));
console.log(
  `${notes.length} notas · ${score.key.name} · ${Math.round(score.bpm)} bpm (detectado ${Math.round(score.detectedBpm)}) · ${score.measureCount} compases`,
);
const suggestion = score.tempoSuggestion;
if (suggestion) {
  const meter = suggestion.beatsPerMeasure ? ` --beats ${suggestion.beatsPerMeasure} --first ${suggestion.firstBeat}` : '';
  console.log(`Sugerencia: el tempo real parece ${suggestion.factor === 2 ? 'el doble' : 'el triple'}, probá --bpm ${suggestion.bpm}${meter}`);
}
console.log(`Listo: out/${name}.musicxml y out/${name}.mid`);
