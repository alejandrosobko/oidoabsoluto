import type { OpenSheetMusicDisplay, VexFlowGraphicalNote } from 'opensheetmusicdisplay';
import type { SpelledPitch } from '../music/key';
import { describeNote, type Clef } from '../music/noteName';

export interface NoteTooltip {
  /** Llamar después de cada render de la partitura. */
  refresh(): void;
}

/** Nota de OSMD (NoteEnum, en semitonos desde Do) → letra de MusicXML. */
const STEP_BY_HALFTONE: Partial<Record<number, SpelledPitch['step']>> = {
  0: 'C', 2: 'D', 4: 'E', 5: 'F', 7: 'G', 9: 'A', 11: 'B',
};
/** OSMD cuenta las octavas 3 por debajo de MusicXML (su octava 1 es la del Do central). */
const OSMD_OCTAVE_OFFSET = 3;
/** Distancia máxima (px) entre el toque y la cabeza de nota que se elige. */
const NEAR_TAP_PX = 24;

interface Labeled {
  note: VexFlowGraphicalNote;
  label: string;
  height: number;
}

/**
 * Al pasar el mouse sobre una cabeza de nota (o tocarla en el celular) muestra su nombre,
 * en qué clave está y en qué compás.
 */
export function createNoteTooltip(osmd: OpenSheetMusicDisplay, container: HTMLElement): NoteTooltip {
  const tip = document.createElement('div');
  tip.className = 'note-tooltip';
  tip.setAttribute('role', 'tooltip');
  tip.hidden = true;
  document.body.append(tip);

  let labels = new WeakMap<Element, string>();
  /** SVG para el que se armó `labels`: OSMD lo reemplaza al redibujar (por ejemplo, al girar el celular). */
  let builtFor: Element | null = null;
  let current: Element | null = null;

  function label(note: VexFlowGraphicalNote, measureNumber: number): Labeled | null {
    const source = note.sourceNote;
    if (source.isRest()) return null;
    const pitch = source.Pitch;
    const step = STEP_BY_HALFTONE[pitch.FundamentalNote];
    if (!step) return null;
    const spelled: SpelledPitch = {
      step,
      alter: pitch.AccidentalHalfTones,
      octave: pitch.Octave + OSMD_OCTAVE_OFFSET,
    };
    const clefType = note.Clef()?.ClefType;
    // ClefEnum: G = 0, F = 1. Si no hay clave, el pentagrama de arriba es el de sol.
    const clef: Clef =
      clefType === 1 || (clefType === undefined && source.ParentStaff.idInMusicSheet > 0) ? 'bass' : 'treble';
    return { note, label: describeNote(spelled, clef, measureNumber), height: pitch.getHalfTone() };
  }

  function refresh() {
    hide();
    labels = new WeakMap();
    builtFor = container.querySelector('svg');
    const sheet = osmd.GraphicSheet;
    if (!sheet) return;
    for (const row of sheet.MeasureList) {
      for (const measure of row) {
        if (!measure) continue;
        for (const staffEntry of measure.staffEntries) {
          for (const voiceEntry of staffEntry.graphicalVoiceEntries) {
            const notes = (voiceEntry.notes as VexFlowGraphicalNote[])
              .map((n) => label(n, measure.MeasureNumber))
              .filter((n): n is Labeled => n !== null);
            const first = notes[0];
            if (!first) continue;
            // Un acorde es un solo grupo SVG con varias cabezas: se emparejan por altura,
            // la de más arriba en pantalla con la nota más aguda.
            // (getNoteheadSVGs() de OSMD no las encuentra: están anidadas dentro de .vf-note).
            const heads = [...(first.note.getSVGGElement()?.querySelectorAll('.vf-notehead') ?? [])];
            if (heads.length === notes.length) {
              const byScreen = heads
                .map((head) => ({ head, y: (head as unknown as SVGGraphicsElement).getBBox().y }))
                .sort((a, b) => a.y - b.y);
              const byPitch = [...notes].sort((a, b) => b.height - a.height);
              byScreen.forEach(({ head }, i) => {
                const match = byPitch[i];
                if (match) labels.set(head, match.label);
              });
            } else {
              const chord = notes.map((n) => n.label.split(' · ')[0]).join(', ');
              for (const head of heads) labels.set(head, chord);
            }
          }
        }
      }
    }
  }

  function show(head: Element, text: string) {
    current = head;
    tip.textContent = text;
    tip.hidden = false;
    const box = head.getBoundingClientRect();
    const width = tip.offsetWidth;
    const left = Math.min(window.innerWidth - width - 8, Math.max(8, box.left + box.width / 2 - width / 2));
    const above = box.top - tip.offsetHeight - 8;
    tip.style.left = `${left}px`;
    tip.style.top = `${above > 8 ? above : box.bottom + 8}px`;
  }

  function hide() {
    current = null;
    tip.hidden = true;
  }

  function ensureFresh() {
    if (builtFor !== container.querySelector('svg')) refresh();
  }

  function headAt(target: EventTarget | null): [Element, string] | null {
    const head = target instanceof Element ? target.closest('.vf-notehead') : null;
    if (head) ensureFresh();
    const text = head ? labels.get(head) : undefined;
    return head && text ? [head, text] : null;
  }

  container.addEventListener('pointerover', (event) => {
    if (event.pointerType !== 'mouse') return;
    const found = headAt(event.target);
    if (found) show(...found);
    else if (current) hide();
  });
  container.addEventListener('pointerleave', (event) => {
    if (event.pointerType === 'mouse') hide();
  });
  /** Cabeza de nota más cercana al punto, para no tener que acertarle a una de 5 px con el dedo. */
  function nearestHead(x: number, y: number): [Element, string] | null {
    let best: [Element, string] | null = null;
    let bestDistance = NEAR_TAP_PX;
    for (const head of container.querySelectorAll('.vf-notehead')) {
      const text = labels.get(head);
      if (!text) continue;
      const box = head.getBoundingClientRect();
      const distance = Math.hypot(Math.max(box.left - x, 0, x - box.right), Math.max(box.top - y, 0, y - box.bottom));
      if (distance <= bestDistance) {
        best = [head, text];
        bestDistance = distance;
      }
    }
    return best;
  }

  // En pantallas táctiles no hay "pasar por encima": se muestra al tocar cerca de la nota.
  // El listener va en la partitura y no en document porque Safari de iOS no manda el click
  // si el elemento tocado (o alguno de sus padres) no lo escucha.
  container.addEventListener('click', (event) => {
    ensureFresh();
    const found = headAt(event.target) ?? nearestHead(event.clientX, event.clientY);
    if (found) show(...found);
    else hide();
  });
  document.addEventListener('click', (event) => {
    if (current && !container.contains(event.target as Node)) hide();
  });
  // Al desplazar la página (a mano o porque sigue al cursor) el cartel acompaña a la nota.
  window.addEventListener(
    'scroll',
    () => {
      if (current && !tip.hidden) show(current, tip.textContent ?? '');
    },
    { passive: true },
  );

  return { refresh };
}
