/** Una grabación del micrófono en curso. `stop()` la termina y devuelve el audio grabado. */
export interface Recording {
  stop(): Promise<Blob>;
  cancel(): void;
}

export class RecorderError extends Error {}

export function canRecord(): boolean {
  return typeof MediaRecorder !== 'undefined' && !!navigator.mediaDevices?.getUserMedia;
}

/**
 * Empieza a grabar del micrófono. Se apagan la cancelación de eco, la supresión de ruido y el
 * control automático de volumen: están pensados para voz y le cortan notas y dinámica al piano.
 */
export async function startRecording(): Promise<Recording> {
  if (!canRecord()) {
    throw new RecorderError(
      window.isSecureContext
        ? 'Este navegador no permite grabar audio.'
        : 'Para grabar, el navegador pide abrir la app con https (o en localhost).',
    );
  }

  let stream: MediaStream;
  try {
    stream = await navigator.mediaDevices.getUserMedia({
      audio: { echoCancellation: false, noiseSuppression: false, autoGainControl: false },
    });
  } catch (error) {
    const name = error instanceof DOMException ? error.name : '';
    if (name === 'NotAllowedError' || name === 'SecurityError') {
      throw new RecorderError('Necesito permiso para usar el micrófono.');
    }
    if (name === 'NotFoundError' || name === 'OverconstrainedError') {
      throw new RecorderError('No encontré un micrófono.');
    }
    throw error;
  }

  const recorder = new MediaRecorder(stream);
  const chunks: Blob[] = [];
  recorder.addEventListener('dataavailable', (event) => {
    if (event.data.size > 0) chunks.push(event.data);
  });
  const releaseMic = () => stream.getTracks().forEach((track) => track.stop());
  // Pedir datos cada segundo evita perder todo si el navegador corta la grabación de golpe.
  recorder.start(1000);

  return {
    stop() {
      return new Promise<Blob>((resolve, reject) => {
        recorder.addEventListener(
          'stop',
          () => {
            releaseMic();
            const blob = new Blob(chunks, { type: recorder.mimeType || chunks[0]?.type });
            if (blob.size === 0) reject(new RecorderError('La grabación quedó vacía. Probá de nuevo.'));
            else resolve(blob);
          },
          { once: true },
        );
        if (recorder.state === 'inactive') recorder.dispatchEvent(new Event('stop'));
        else recorder.stop();
      });
    },
    cancel() {
      if (recorder.state !== 'inactive') recorder.stop();
      releaseMic();
    },
  };
}
