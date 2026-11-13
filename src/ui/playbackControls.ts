import type { OpenSheetMusicDisplay } from 'opensheetmusicdisplay';
import type { ScoreResult } from '../music/score';
import { PianoPlayer } from '../playback/pianoPlayer';

interface Elements {
  play: HTMLButtonElement;
  rewind: HTMLButtonElement;
  progress: HTMLDivElement;
  time: HTMLSpanElement;
}

export interface PlaybackControls {
  /** Llamar después de cada render de la partitura. */
  setScore(score: ScoreResult): void;
  stop(): void;
}

function formatTime(seconds: number): string {
  const s = Math.max(0, Math.floor(seconds));
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;
}

/**
 * Botón de reproducir/pausa con el cursor de la partitura sincronizado: el cursor avanza
 * acorde por acorde según la posición del audio, y la página se desplaza sola.
 */
export function createPlaybackControls(
  osmd: OpenSheetMusicDisplay,
  elements: Elements,
  samplesUrl: string,
  onError: (message: string) => void,
): PlaybackControls {
  const player = new PianoPlayer(samplesUrl);
  /** Posición (en negras) de cada lugar donde se detiene el cursor. */
  let cursorBeats: number[] = [];
  let cursorIndex = 0;
  let frame = 0;

  const cursor = () => osmd.cursor as OpenSheetMusicDisplay['cursor'] | undefined;

  function setPlayingUi(playing: boolean) {
    elements.play.textContent = playing ? '⏸' : '▶';
    elements.play.setAttribute('aria-label', playing ? 'Pausa' : 'Reproducir');
  }

  function updateTime() {
    const position = player.position;
    const total = player.duration;
    elements.progress.style.width = `${total ? Math.min(100, (position / total) * 100) : 0}%`;
    elements.time.textContent = `${formatTime(position * player.beatSeconds)} / ${formatTime(total * player.beatSeconds)}`;
  }

  function resetCursor() {
    const c = cursor();
    if (!c) return;
    c.reset();
    c.hide();
    cursorIndex = 0;
  }

  /** Recorre la partitura una vez para saber dónde cae cada parada del cursor. */
  function collectCursorBeats() {
    const c = cursor();
    cursorBeats = [];
    if (!c) return;
    c.reset();
    const iterator = c.Iterator;
    while (!iterator.EndReached) {
      cursorBeats.push(iterator.currentTimeStamp.RealValue * 4);
      iterator.moveToNext();
    }
    resetCursor();
  }

  function syncCursor() {
    const c = cursor();
    if (!c || cursorBeats.length === 0) return;
    const position = player.position + 0.01;
    let target = cursorIndex;
    while (target + 1 < cursorBeats.length && (cursorBeats[target + 1] ?? Infinity) <= position) target += 1;
    if ((cursorBeats[cursorIndex] ?? 0) > position) {
      // Se volvió atrás (por ejemplo, al inicio): rearrancar el cursor.
      c.reset();
      cursorIndex = 0;
      target = 0;
      while (target + 1 < cursorBeats.length && (cursorBeats[target + 1] ?? Infinity) <= position) target += 1;
    }
    while (cursorIndex < target) {
      c.next();
      cursorIndex += 1;
    }
  }

  function tick() {
    syncCursor();
    updateTime();
    if (player.isPlaying) frame = requestAnimationFrame(tick);
  }

  player.onEnded = () => {
    cancelAnimationFrame(frame);
    setPlayingUi(false);
    resetCursor();
    updateTime();
  };

  async function togglePlay() {
    if (player.isPlaying) {
      player.pause();
      cancelAnimationFrame(frame);
      setPlayingUi(false);
      return;
    }
    // Se desbloquea el audio dentro del toque, antes de cualquier espera.
    player.unlock();
    if (!player.isLoaded) {
      elements.play.disabled = true;
      try {
        await player.load((fraction) => {
          elements.time.textContent = `Cargando piano… ${Math.round(fraction * 100)}%`;
        });
      } catch (error) {
        console.error(error);
        onError(error instanceof Error ? error.message : 'No pude cargar el sonido del piano.');
        updateTime();
        return;
      } finally {
        elements.play.disabled = false;
      }
    }
    if (player.position === 0) resetCursor();
    cursor()?.show();
    syncCursor();
    player.play();
    setPlayingUi(true);
    frame = requestAnimationFrame(tick);
  }

  elements.play.addEventListener('click', () => void togglePlay());
  elements.rewind.addEventListener('click', () => {
    const wasPlaying = player.isPlaying;
    player.stop();
    resetCursor();
    if (wasPlaying) {
      cursor()?.show();
      player.play();
    }
    updateTime();
  });

  return {
    setScore(score) {
      cancelAnimationFrame(frame);
      player.setScore(score.playback, score.bpm, score.totalBeats);
      setPlayingUi(false);
      collectCursorBeats();
      updateTime();
    },
    stop() {
      cancelAnimationFrame(frame);
      player.stop();
      setPlayingUi(false);
      resetCursor();
      updateTime();
    },
  };
}
