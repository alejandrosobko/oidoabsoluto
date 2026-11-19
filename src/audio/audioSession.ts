/**
 * Sesión de audio de Safari (iOS 17+). Con `playback` suena aunque la llave de silencio esté
 * puesta, pero no deja abrir el micrófono: para grabar hay que pasar a `play-and-record`.
 * En navegadores sin `navigator.audioSession` no hace nada.
 */
type AudioSessionType = 'playback' | 'play-and-record';

export function setAudioSession(type: AudioSessionType) {
  const session = (navigator as Navigator & { audioSession?: { type: string } }).audioSession;
  if (session && session.type !== type) session.type = type;
}
