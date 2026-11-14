import { OpenSheetMusicDisplay } from 'opensheetmusicdisplay';
import { decodeToModelAudio } from './audio/decode';
import { RecorderError, startRecording, type Recording } from './audio/recorder';
import { KEY_SIGNATURE_RANGE, keySignatureFromFifths } from './music/key';
import { buildMidi } from './music/midi';
import { buildScore, type ScoreResult } from './music/score';
import type { BeatsPerMeasure, PerformedNote, Subdivision } from './music/types';
import { extractNotes, runModel, type ModelOutput } from './transcription/basicPitch';
import { setupInstallBanner } from './ui/installBanner';
import { createPlaybackControls } from './ui/playbackControls';
import './style.css';

const MODEL_URL = new URL('model/model.json', document.baseURI).href;
const PIANO_SAMPLES_URL = new URL('piano/', document.baseURI).href;

function el<T extends HTMLElement>(id: string): T {
  const node = document.getElementById(id);
  if (!node) throw new Error(`Falta el elemento #${id}`);
  return node as T;
}

const ui = {
  file: el<HTMLInputElement>('file'),
  fileLabel: document.querySelector<HTMLLabelElement>('label[for="file"]'),
  fileName: el<HTMLParagraphElement>('file-name'),
  record: el<HTMLButtonElement>('record'),
  recordLabel: el<HTMLSpanElement>('record-label'),
  recordTime: el<HTMLParagraphElement>('record-time'),
  status: el<HTMLElement>('status'),
  statusText: el<HTMLParagraphElement>('status-text'),
  statusHint: el<HTMLParagraphElement>('status-hint'),
  progressBar: el<HTMLDivElement>('progress-bar'),
  error: el<HTMLParagraphElement>('error'),
  result: el<HTMLElement>('result'),
  summary: el<HTMLParagraphElement>('summary'),
  tempoHint: el<HTMLDivElement>('tempo-hint'),
  tempoHintText: el<HTMLParagraphElement>('tempo-hint-text'),
  tempoHintAction: el<HTMLButtonElement>('tempo-hint-action'),
  options: el<HTMLFormElement>('options'),
  bpm: el<HTMLInputElement>('bpm'),
  beats: el<HTMLSelectElement>('beats'),
  subdivision: el<HTMLSelectElement>('subdivision'),
  firstBeat: el<HTMLSelectElement>('first-beat'),
  key: el<HTMLSelectElement>('key'),
  sensitivity: el<HTMLInputElement>('sensitivity'),
  downloadXml: el<HTMLButtonElement>('download-xml'),
  downloadMidi: el<HTMLButtonElement>('download-midi'),
  print: el<HTMLButtonElement>('print'),
  score: el<HTMLDivElement>('score'),
  play: el<HTMLButtonElement>('play'),
  rewind: el<HTMLButtonElement>('rewind'),
  playProgress: el<HTMLDivElement>('play-progress'),
  playTime: el<HTMLSpanElement>('play-time'),
};

interface State {
  title: string;
  output: ModelOutput | null;
  notes: PerformedNote[];
  score: ScoreResult | null;
  /** Si se aplicó la sugerencia de tempo: el tempo de antes y el puesto, para poder volver. */
  appliedTempo: { from: number; to: number } | null;
}

const state: State = { title: '', output: null, notes: [], score: null, appliedTempo: null };

const osmd = new OpenSheetMusicDisplay(ui.score, {
  backend: 'svg',
  autoResize: true,
  drawTitle: true,
  drawComposer: false,
  drawPartNames: false,
  drawingParameters: 'compacttight',
  disableCursor: false,
  followCursor: true,
  cursorsOptions: [{ type: 0, color: '#2f6fed', alpha: 0.35, follow: true }],
});

function showError(message: string | null) {
  ui.error.hidden = !message;
  ui.error.textContent = message ?? '';
}

const playback = createPlaybackControls(
  osmd,
  { play: ui.play, rewind: ui.rewind, progress: ui.playProgress, time: ui.playTime },
  PIANO_SAMPLES_URL,
  showError,
);

function setBusy(busy: boolean) {
  ui.file.disabled = busy;
  ui.fileLabel?.setAttribute('aria-disabled', String(busy));
  ui.record.disabled = busy;
}

function setStatus(text: string, fraction: number | null) {
  ui.status.hidden = false;
  ui.statusText.textContent = text;
  ui.progressBar.style.width = `${Math.round((fraction ?? 0) * 100)}%`;
}

function fillFirstBeatOptions() {
  const beats = Number(ui.beats.value);
  const previous = Math.min(Number(ui.firstBeat.value) || 1, beats);
  ui.firstBeat.replaceChildren(
    ...Array.from({ length: beats }, (_, i) => new Option(String(i + 1), String(i + 1), false, i + 1 === previous)),
  );
}

function fillKeyOptions() {
  const options = [new Option('Automática', 'auto', true, true)];
  for (let fifths: number = KEY_SIGNATURE_RANGE.min; fifths <= KEY_SIGNATURE_RANGE.max; fifths++) {
    const accidentals = fifths === 0 ? 'sin alteraciones' : `${Math.abs(fifths)}${fifths < 0 ? '♭' : '♯'}`;
    options.push(new Option(`${keySignatureFromFifths(fifths).name} (${accidentals})`, String(fifths)));
  }
  ui.key.replaceChildren(...options);
}

/** Evita que el iPhone apague la pantalla (y frene el proceso) mientras transcribe. */
async function keepScreenOn(): Promise<() => void> {
  try {
    const lock = await navigator.wakeLock?.request('screen');
    return () => void lock?.release();
  } catch (error) {
    console.warn('No se pudo mantener la pantalla encendida', error);
    return () => undefined;
  }
}

function formatRemaining(seconds: number): string {
  if (!Number.isFinite(seconds) || seconds <= 0) return '';
  if (seconds < 60) return ' · menos de 1 min';
  return ` · quedan ~${Math.ceil(seconds / 60)} min`;
}

async function handleFile(file: File) {
  showError(null);
  playback.stop();
  ui.result.hidden = true;
  state.output = null;
  // Un tempo puesto por la sugerencia era para el audio anterior: el nuevo arranca en automático.
  if (state.appliedTempo) {
    ui.bpm.value = '';
    state.appliedTempo = null;
  }
  state.title = file.name.replace(/\.[^.]+$/, '');
  ui.fileName.hidden = false;
  ui.fileName.textContent = file.name;
  setBusy(true);
  const releaseScreen = await keepScreenOn();

  try {
    setStatus('Leyendo el archivo…', 0);
    let audio: Float32Array;
    try {
      audio = await decodeToModelAudio(file);
    } catch (error) {
      console.error(error);
      throw new Error('No pude leer ese archivo. Probá con MP3, M4A, WAV o un video MP4/MOV.');
    }

    setStatus('Preparando…', 0);
    const started = performance.now();
    state.output = await runModel(audio, MODEL_URL, (fraction) => {
      const elapsed = (performance.now() - started) / 1000;
      const remaining = fraction > 0.03 ? (elapsed / fraction) * (1 - fraction) : NaN;
      setStatus(`Escuchando… ${Math.round(fraction * 100)}%${formatRemaining(remaining)}`, fraction);
    });

    setStatus('Armando la partitura…', 1);
    await render();
    ui.status.hidden = true;
  } catch (error) {
    console.error(error);
    ui.status.hidden = true;
    showError(error instanceof Error ? error.message : 'Algo salió mal procesando el audio.');
  } finally {
    releaseScreen();
    setBusy(false);
    ui.file.value = '';
  }
}

interface ActiveRecording {
  recording: Recording;
  releaseScreen: () => void;
  timer: number;
}

let activeRecording: ActiveRecording | null = null;

function formatClock(seconds: number): string {
  const whole = Math.floor(seconds);
  return `${Math.floor(whole / 60)}:${String(whole % 60).padStart(2, '0')}`;
}

function setRecordingUi(recording: boolean) {
  ui.record.classList.toggle('recording', recording);
  ui.recordLabel.textContent = recording ? 'Detener y transcribir' : 'Grabar';
  ui.recordTime.hidden = !recording;
  ui.recordTime.textContent = 'Grabando… 0:00';
  ui.file.disabled = recording;
  ui.fileLabel?.setAttribute('aria-disabled', String(recording));
}

async function startMicRecording() {
  showError(null);
  playback.stop();
  ui.record.disabled = true;
  try {
    const recording = await startRecording();
    // Si la pantalla se apaga, el iPhone corta el micrófono: la mantenemos encendida.
    const releaseScreen = await keepScreenOn();
    const started = performance.now();
    const timer = window.setInterval(() => {
      ui.recordTime.textContent = `Grabando… ${formatClock((performance.now() - started) / 1000)}`;
    }, 250);
    activeRecording = { recording, releaseScreen, timer };
    setRecordingUi(true);
  } catch (error) {
    console.error(error);
    showError(error instanceof RecorderError ? error.message : 'No pude empezar a grabar.');
  } finally {
    ui.record.disabled = false;
  }
}

async function stopMicRecording() {
  if (!activeRecording) return;
  const { recording, releaseScreen, timer } = activeRecording;
  activeRecording = null;
  window.clearInterval(timer);
  releaseScreen();
  setRecordingUi(false);

  let blob: Blob;
  try {
    blob = await recording.stop();
  } catch (error) {
    console.error(error);
    showError(error instanceof RecorderError ? error.message : 'No pude terminar la grabación.');
    return;
  }

  const now = new Date();
  const name = `Grabación ${now.getHours()}h${String(now.getMinutes()).padStart(2, '0')}`;
  await handleFile(new File([blob], name, { type: blob.type }));
}

async function render() {
  if (!state.output) return;
  state.notes = extractNotes(state.output, Number(ui.sensitivity.value));
  const forcedBpm = Number(ui.bpm.value);
  state.score = buildScore(state.notes, {
    bpm: Number.isFinite(forcedBpm) && forcedBpm > 0 ? forcedBpm : undefined,
    beatsPerMeasure: Number(ui.beats.value) as BeatsPerMeasure,
    subdivision: Number(ui.subdivision.value) as Subdivision,
    firstBeat: Number(ui.firstBeat.value) || 1,
    keyFifths: ui.key.value === 'auto' ? undefined : Number(ui.key.value),
    title: state.title,
  });

  const { key, bpm, measureCount, detectedBpm } = state.score;
  ui.summary.textContent = `${key.name} · ♩ = ${Math.round(bpm)} · ${measureCount} compases`;
  ui.bpm.placeholder = `auto (${Math.round(detectedBpm)})`;
  updateTempoHint(state.score);
  ui.result.hidden = false;

  osmd.zoom = window.innerWidth < 600 ? 0.55 : 0.9;
  playback.stop();
  await osmd.load(state.score.musicXml);
  osmd.render();
  playback.setScore(state.score);
}

/** Muestra la sugerencia de tempo, o la opción de deshacerla si ya se aplicó. */
function updateTempoHint(score: ScoreResult) {
  // Si después de aplicarla se escribió otro tempo a mano, la sugerencia ya no corre.
  if (state.appliedTempo && Number(ui.bpm.value) !== state.appliedTempo.to) state.appliedTempo = null;

  if (state.appliedTempo) {
    const { from, to } = state.appliedTempo;
    const meterTip = ui.beats.value === '4' ? ' Si la melodía se repite cada 3 tiempos, probá también Compás 3/4.' : '';
    ui.tempoHintText.textContent = `Tempo cambiado a ♩ = ${to} (antes ${from}).${meterTip}`;
    ui.tempoHintAction.textContent = `Volver a ♩ = ${from}`;
    ui.tempoHint.hidden = false;
  } else if (score.suggestedBpm) {
    ui.tempoHintText.textContent =
      'Hay notas muy seguidas que quedan encimadas. Puede que el tempo real sea el doble.';
    ui.tempoHintAction.textContent = `Probar ♩ = ${score.suggestedBpm}`;
    ui.tempoHint.hidden = false;
  } else {
    ui.tempoHint.hidden = true;
  }
}

function toggleSuggestedTempo() {
  if (state.appliedTempo) {
    ui.bpm.value = '';
    state.appliedTempo = null;
  } else if (state.score?.suggestedBpm) {
    state.appliedTempo = { from: Math.round(state.score.bpm), to: state.score.suggestedBpm };
    ui.bpm.value = String(state.score.suggestedBpm);
  }
  scheduleRender();
}

function download(data: BlobPart, filename: string, type: string) {
  const url = URL.createObjectURL(new Blob([data], { type }));
  const link = document.createElement('a');
  link.href = url;
  link.download = filename;
  document.body.append(link);
  link.click();
  link.remove();
  setTimeout(() => URL.revokeObjectURL(url), 10_000);
}

let rerenderTimer: number | undefined;
function scheduleRender() {
  window.clearTimeout(rerenderTimer);
  rerenderTimer = window.setTimeout(() => {
    render().catch((error: unknown) => {
      console.error(error);
      showError(error instanceof Error ? error.message : 'No pude rearmar la partitura.');
    });
  }, 250);
}

ui.file.addEventListener('change', () => {
  const file = ui.file.files?.[0];
  if (file) void handleFile(file);
});
ui.record.addEventListener('click', () => {
  void (activeRecording ? stopMicRecording() : startMicRecording());
});
ui.beats.addEventListener('change', fillFirstBeatOptions);
ui.options.addEventListener('input', scheduleRender);
ui.options.addEventListener('change', scheduleRender);
ui.options.addEventListener('submit', (event) => event.preventDefault());
ui.downloadXml.addEventListener('click', () => {
  if (state.score) download(state.score.musicXml, `${state.title}.musicxml`, 'application/vnd.recordare.musicxml+xml');
});
ui.downloadMidi.addEventListener('click', () => {
  if (state.notes.length) download(new Uint8Array(buildMidi(state.notes, state.title)), `${state.title}.mid`, 'audio/midi');
});
ui.print.addEventListener('click', () => window.print());
ui.tempoHintAction.addEventListener('click', toggleSuggestedTempo);

fillFirstBeatOptions();
fillKeyOptions();

setupInstallBanner({
  banner: el('install-banner'),
  text: el('install-text'),
  action: el('install-action'),
  close: el('install-close'),
  iosDialog: el('install-ios'),
});

// Guarda la app para usarla sin internet. En desarrollo no: serviría código viejo.
if (import.meta.env.PROD && 'serviceWorker' in navigator) {
  navigator.serviceWorker.register(new URL('sw.js', document.baseURI)).catch((error: unknown) => {
    console.warn('No pude registrar el service worker', error);
  });
}
