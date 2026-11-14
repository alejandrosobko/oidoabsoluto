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

/**
 * El motivo de Carol of the Bells (Leontovych, 1916, dominio público) en 3/4 a 154 bpm:
 * Si♭ negra, La–Si♭ corcheas, Sol negra, con un bajo por compás. Es rápido: el tempo
 * se detecta a la mitad y la app tiene que sugerir el doble.
 */
export function carolMotif(): Buffer {
  const beat = 60 / 154;
  const motif = [
    { at: 0, pitch: 70, length: 1 },
    { at: 1, pitch: 69, length: 0.5 },
    { at: 1.5, pitch: 70, length: 0.5 },
    { at: 2, pitch: 67, length: 1 },
  ];
  const bass = [43, 41, 39, 38];
  const notes: SynthNote[] = [];
  const bars = 12;
  for (let bar = 0; bar < bars; bar++) {
    const t0 = 0.5 + bar * 3 * beat;
    notes.push({ pitch: bass[bar % bass.length]!, start: t0, duration: 3 * beat * 0.95 });
    for (const m of motif) notes.push({ pitch: m.pitch, start: t0 + m.at * beat, duration: m.length * beat * 0.9 });
  }
  return synthPianoWav(notes, 0.5 + bars * 3 * beat + 1);
}
