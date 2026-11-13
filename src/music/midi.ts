import * as toneMidi from '@tonejs/midi';
import type { PerformedNote } from './types';

// Vite expone `Midi` directo; Node (script de terminal) carga el build UMD y lo deja dentro de `default`.
const Midi: typeof toneMidi.Midi =
  toneMidi.Midi ?? (toneMidi as unknown as { default: typeof toneMidi }).default.Midi;

/** MIDI con las notas tal como se tocaron (sin cuantizar), útil para escuchar o importar. */
export function buildMidi(notes: PerformedNote[], title: string): Uint8Array {
  const midi = new Midi();
  midi.header.name = title;
  const track = midi.addTrack();
  track.name = 'Piano';
  for (const n of notes) {
    track.addNote({
      midi: n.pitch,
      time: n.start,
      duration: Math.max(n.duration, 0.05),
      velocity: Math.min(1, Math.max(0.1, n.velocity)),
    });
  }
  return midi.toArray();
}
