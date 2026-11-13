import type { PlaybackNote } from '../music/score';
import { nearestSample, PIANO_SAMPLES, velocityToGain } from './samples';

/** Cuánto antes se programan las notas en el reloj de audio (evita cortes si el hilo se demora). */
const LOOKAHEAD_SECONDS = 0.25;
const SCHEDULER_INTERVAL_MS = 25;
/** Tiempo que tarda en apagarse una nota al soltarla. */
const RELEASE_SECONDS = 0.12;

interface Voice {
  source: AudioBufferSourceNode;
  gain: GainNode;
}

/**
 * Reproduce la partitura con muestras de piano. Programa las notas un poco por adelantado
 * sobre el reloj de Web Audio, así el ritmo no depende de los timers del navegador.
 */
export class PianoPlayer {
  private context: AudioContext | null = null;
  private output: AudioNode | null = null;
  private buffers = new Map<number, AudioBuffer>();
  private loading: Promise<void> | null = null;
  private notes: PlaybackNote[] = [];
  private totalBeats = 0;
  private secondsPerBeat = 0.5;
  /** Momento (reloj de audio) que corresponde a la negra 0. */
  private origin = 0;
  private nextIndex = 0;
  private timer: number | undefined;
  private voices = new Set<Voice>();
  private pausedAt = 0;
  private playing = false;

  /** Se llama cuando la reproducción llega al final por sí sola. */
  onEnded: (() => void) | null = null;

  constructor(private readonly samplesUrl: string) {}

  get isPlaying(): boolean {
    return this.playing;
  }

  get isLoaded(): boolean {
    return this.buffers.size === PIANO_SAMPLES.length;
  }

  /** Posición actual en negras desde el inicio. */
  get position(): number {
    if (!this.playing || !this.context) return this.pausedAt;
    return Math.max(0, (this.context.currentTime - this.origin) / this.secondsPerBeat);
  }

  get duration(): number {
    return this.totalBeats;
  }

  get beatSeconds(): number {
    return this.secondsPerBeat;
  }

  /**
   * Crea o reactiva el contexto de audio. Hay que llamarlo directo desde el toque del usuario:
   * Safari solo deja sonar audio que arrancó con un gesto.
   */
  unlock(): AudioContext {
    if (!this.context) {
      allowSoundWithSilentSwitch();
      this.context = new AudioContext();
      // Ganancia de entrada para que se oiga bien en el parlante del teléfono;
      // el compresor contiene los picos cuando suenan muchos acordes juntos.
      const input = this.context.createGain();
      input.gain.value = 3.5;
      const compressor = this.context.createDynamicsCompressor();
      compressor.threshold.value = -10;
      compressor.ratio.value = 6;
      input.connect(compressor).connect(this.context.destination);
      this.output = input;
    }
    if (this.context.state !== 'running') void this.context.resume();
    return this.context;
  }

  /** Baja y decodifica las muestras (una sola vez). */
  load(onProgress?: (fraction: number) => void): Promise<void> {
    const context = this.unlock();
    this.loading ??= (async () => {
      let done = 0;
      await Promise.all(
        PIANO_SAMPLES.map(async (sample) => {
          const response = await fetch(`${this.samplesUrl}${sample.name}.mp3`);
          if (!response.ok) throw new Error(`No pude cargar el sonido del piano (${sample.name}).`);
          this.buffers.set(sample.midi, await context.decodeAudioData(await response.arrayBuffer()));
          done += 1;
          onProgress?.(done / PIANO_SAMPLES.length);
        }),
      );
    })().catch((error: unknown) => {
      this.loading = null;
      throw error;
    });
    return this.loading;
  }

  /** Carga una partitura nueva y vuelve al inicio. */
  setScore(notes: PlaybackNote[], bpm: number, totalBeats: number) {
    this.stop();
    this.notes = [...notes].sort((a, b) => a.start - b.start);
    this.secondsPerBeat = 60 / bpm;
    this.totalBeats = totalBeats;
  }

  play() {
    const context = this.unlock();
    if (this.playing || !this.isLoaded) return;
    if (this.pausedAt >= this.totalBeats) this.pausedAt = 0;
    this.origin = context.currentTime + 0.05 - this.pausedAt * this.secondsPerBeat;
    this.nextIndex = this.notes.findIndex((n) => n.start >= this.pausedAt - 1e-6);
    if (this.nextIndex < 0) this.nextIndex = this.notes.length;
    this.playing = true;
    this.schedule();
    this.timer = window.setInterval(() => this.schedule(), SCHEDULER_INTERVAL_MS);
  }

  pause() {
    if (!this.playing) return;
    this.pausedAt = this.position;
    this.halt();
  }

  stop() {
    this.halt();
    this.pausedAt = 0;
  }

  private halt() {
    this.playing = false;
    window.clearInterval(this.timer);
    this.timer = undefined;
    const now = this.context?.currentTime ?? 0;
    for (const voice of this.voices) {
      voice.gain.gain.cancelScheduledValues(now);
      voice.gain.gain.setTargetAtTime(0, now, 0.02);
      voice.source.stop(now + 0.1);
    }
    this.voices.clear();
  }

  private schedule() {
    const context = this.context;
    if (!context || !this.playing) return;
    const horizon = context.currentTime + LOOKAHEAD_SECONDS;
    while (this.nextIndex < this.notes.length) {
      const note = this.notes[this.nextIndex]!;
      const when = this.origin + note.start * this.secondsPerBeat;
      if (when > horizon) break;
      this.playNote(context, note, Math.max(when, context.currentTime));
      this.nextIndex += 1;
    }
    if (this.position >= this.totalBeats) {
      this.stop();
      this.onEnded?.();
    }
  }

  private playNote(context: AudioContext, note: PlaybackNote, when: number) {
    const { sample, playbackRate } = nearestSample(note.pitch);
    const buffer = this.buffers.get(sample.midi);
    if (!buffer || !this.output) return;

    const source = context.createBufferSource();
    source.buffer = buffer;
    source.playbackRate.value = playbackRate;
    const gain = context.createGain();
    gain.gain.setValueAtTime(velocityToGain(note.velocity), when);
    const release = when + note.duration * this.secondsPerBeat;
    gain.gain.setTargetAtTime(0, release, RELEASE_SECONDS / 3);
    source.connect(gain).connect(this.output);
    source.start(when);
    source.stop(release + RELEASE_SECONDS * 2);

    const voice = { source, gain };
    this.voices.add(voice);
    source.onended = () => this.voices.delete(voice);
  }
}

/**
 * En el iPhone, con la llave de silencio puesta, Safari silencia Web Audio. Desde iOS 17
 * se puede declarar que la página reproduce música; en versiones anteriores no hay arreglo limpio.
 */
function allowSoundWithSilentSwitch() {
  const session = (navigator as Navigator & { audioSession?: { type: string } }).audioSession;
  if (session) session.type = 'playback';
}
