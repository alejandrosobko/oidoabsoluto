/**
 * Genera un WAV con sonido parecido a un piano (armónicos que se apagan), para probar
 * la app de punta a punta sin depender de grabaciones con derechos de autor.
 */
const SAMPLE_RATE = 22050;

interface SynthNote {
  pitch: number;
  start: number;
  duration: number;
}

export function synthPianoWav(notes: SynthNote[], totalSeconds: number): Buffer {
  const samples = new Float32Array(Math.ceil(totalSeconds * SAMPLE_RATE));
  for (const n of notes) {
    const freq = 440 * 2 ** ((n.pitch - 69) / 12);
    const from = Math.floor(n.start * SAMPLE_RATE);
    const to = Math.min(samples.length, Math.floor((n.start + n.duration) * SAMPLE_RATE));
    for (let i = from; i < to; i++) {
      const t = (i - from) / SAMPLE_RATE;
      const attack = Math.min(1, t / 0.005);
      const release = Math.min(1, (to - i) / (0.03 * SAMPLE_RATE));
      const envelope = attack * release * Math.exp(-2.5 * t);
      let value = 0;
      for (let h = 1; h <= 6; h++) value += Math.sin(2 * Math.PI * freq * h * t) / h ** 1.5;
      samples[i] = (samples[i] ?? 0) + 0.15 * envelope * value;
    }
  }

  const data = Buffer.alloc(samples.length * 2);
  samples.forEach((s, i) => data.writeInt16LE(Math.round(Math.max(-1, Math.min(1, s)) * 32767), i * 2));
  const header = Buffer.alloc(44);
  header.write('RIFF', 0);
  header.writeUInt32LE(36 + data.length, 4);
  header.write('WAVE', 8);
  header.write('fmt ', 12);
  header.writeUInt32LE(16, 16);
  header.writeUInt16LE(1, 20);
  header.writeUInt16LE(1, 22);
  header.writeUInt32LE(SAMPLE_RATE, 24);
  header.writeUInt32LE(SAMPLE_RATE * 2, 28);
  header.writeUInt16LE(2, 32);
  header.writeUInt16LE(16, 34);
  header.write('data', 36);
  header.writeUInt32LE(data.length, 40);
  return Buffer.concat([header, data]);
}

/** Cuatro compases en Do mayor a 100 bpm: melodía en negras y bajo en redondas. */
export function cMajorExercise(): Buffer {
  const beat = 0.6;
  const melody = [72, 74, 76, 77, 79, 77, 76, 74, 72, 76, 79, 84, 79, 76, 74, 72];
  const bass = [48, 41, 43, 48];
  const notes: SynthNote[] = [
    ...melody.map((pitch, i) => ({ pitch, start: 0.5 + i * beat, duration: beat * 0.95 })),
    ...bass.map((pitch, i) => ({ pitch, start: 0.5 + i * 4 * beat, duration: 4 * beat * 0.97 })),
  ];
  return synthPianoWav(notes, 0.5 + 16 * beat + 1);
}
