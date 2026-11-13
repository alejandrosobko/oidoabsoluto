import { MODEL_SAMPLE_RATE } from '../transcription/basicPitch';

/**
 * Lee un archivo de audio o video y lo deja mono a 22050 Hz, que es lo que espera el modelo.
 * Usa el decodificador del navegador, así que sirve cualquier formato que el navegador reproduzca
 * (MP3, M4A, WAV, MP4, MOV en Safari).
 */
export async function decodeToModelAudio(file: Blob): Promise<Float32Array> {
  const data = await file.arrayBuffer();
  const context = new AudioContext();
  let decoded: AudioBuffer;
  try {
    decoded = await context.decodeAudioData(data);
  } finally {
    void context.close();
  }

  const length = Math.ceil(decoded.duration * MODEL_SAMPLE_RATE);
  const offline = new OfflineAudioContext(1, length, MODEL_SAMPLE_RATE);
  const source = offline.createBufferSource();
  source.buffer = decoded;
  source.connect(offline.destination);
  source.start();
  const rendered = await offline.startRendering();
  return rendered.getChannelData(0);
}
