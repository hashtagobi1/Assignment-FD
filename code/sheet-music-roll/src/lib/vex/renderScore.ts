import { VexFlow } from "vexflow";
import type { MusicData } from "../types/musicTypes";

export interface MeasureMeta {
  index: number;
  xStart: number;
  xEnd: number;
  width: number;
}

export interface NoteRenderInfo {
  x: number;
  time: number;
  // you can add svgGroup, components, etc. later
}

interface RenderResult {
  measures: MeasureMeta[];
  notes: NoteRenderInfo[];
  totalWidth: number;
}

const durationToBeats: Record<string, number> = {
  w: 4,
  h: 2,
  q: 1,
  "8": 0.5,
  "16": 0.25,
};

export function renderScoreInto(
  container: HTMLDivElement,
  musicData: MusicData
): RenderResult {
  const {
    Renderer,
    Stave,
    Voice,
    Formatter,
    Accidental,
    StaveConnector,
    Beam,
    Annotation,
    Articulation,
    Curve,
  } = VexFlow;

  container.innerHTML = "";

  const partMeasures = musicData.parts.map((part) => {
    const measures: any[][] = [];
    let current: any[] = [];
    let beats = 0;
    const bpm = musicData.beatsPerMeasure || 4;

    part.notes.forEach((n) => {
      const nb = durationToBeats[n.duration] ?? 1;
      if (beats + nb > bpm && current.length > 0) {
        measures.push(current);
        current = [];
        beats = 0;
      }
      current.push(n);
      beats += nb;
      if (beats >= bpm) {
        measures.push(current);
        current = [];
        beats = 0;
      }
    });
    if (current.length) measures.push(current);
    return measures;
  });

  const maxMeasures = Math.max(...partMeasures.map((m) => m.length));

  const calcWidth = (notes: any[]) => Math.max(180, 80 + notes.length * 40);

  let totalWidth = 100;
  const measuresMeta: MeasureMeta[] = [];

  const staveWidths: number[] = [];
  for (let i = 0; i < maxMeasures; i++) {
    let w = 180;
    partMeasures.forEach((ms) => {
      if (ms[i]) w = Math.max(w, calcWidth(ms[i]));
    });
    staveWidths.push(w);
    totalWidth += w;
  }

  const stavesHeight = 100;
  const canvasHeight = musicData.parts.length * stavesHeight + 100;

  const renderer = new Renderer(container, Renderer.Backends.SVG);
  renderer.resize(totalWidth, canvasHeight);
  const ctx = renderer.getContext();
  ctx.setFont("Arial", 10);

  const noteInfos: NoteRenderInfo[] = [];
  const allStaves: any[][] = [];
  let globalIdx = 0;

  musicData.parts.forEach((part, partIdx) => {
    const y = 60 + partIdx * stavesHeight;
    let x = 150;
    const measures = partMeasures[partIdx];
    const stavesForPart: any[] = [];

    measures.forEach((measureNotes, measureIdx) => {
      const width = staveWidths[measureIdx];
      const stave = new Stave(x, y, width);

      if (measureIdx === 0) {
        stave.addClef(part.clef);
        stave.addKeySignature(musicData.keySignature);
        stave.addTimeSignature(musicData.timeSignature);
      }

      stave.setContext(ctx).draw();
      stavesForPart.push(stave);

      if (partIdx === 0) {
        measuresMeta.push({
          index: measureIdx,
          xStart: x,
          xEnd: x + width,
          width,
        });
      }

      const vfNotes: any[] = [];

      measureNotes.forEach((noteData) => {
        const sortedKeys = [...noteData.keys].sort();
        const sn = new VexFlow.StaveNote({
          keys: sortedKeys,
          duration: noteData.duration,
          clef: part.clef,
        });

        if (noteData.accidentals && noteData.accidentals.length) {
          noteData.accidentals.forEach((acc) => {
            sn.addModifier(new Accidental(acc.accidental), acc.key);
          });
        } else if (noteData.accidental) {
          sn.addModifier(new Accidental(noteData.accidental), 0);
        }

        if (noteData.dynamic) {
          sn.addModifier(
            new Annotation(noteData.dynamic.toUpperCase())
              .setVerticalJustification(Annotation.VerticalJustify.BOTTOM)
              .setFont("Times", 12, "italic")
          );
        }

        if (noteData.articulation) {
          const map: Record<string, string> = {
            staccato: "a.",
            accent: "a>",
            tenuto: "a-",
            staccatissimo: "av",
            marcato: "a^",
          };
          const code = map[noteData.articulation];
          if (code) sn.addModifier(new Articulation(code));
        }

        vfNotes.push(sn);

        noteInfos.push({
          x, // updated after format
          time: noteData.time,
        });

        globalIdx++;
      });

      if (vfNotes.length) {
        const voice = new Voice({
          numBeats: musicData.beatsPerMeasure,
          beatValue: musicData.beatUnit,
        });

        voice.setMode(Voice.Mode.SOFT);

        try {
          voice.addTickables(vfNotes);
          const beams = Beam.generateBeams(vfNotes);

          const formatter = new Formatter();
          formatter.joinVoices([voice]).formatToStave([voice], stave);
          voice.draw(ctx, stave);
          beams.forEach((b) => b.setContext(ctx).draw());

          vfNotes.forEach((sn, idx) => {
            const nx = sn.getAbsoluteX();
            const infoIndex = noteInfos.length - vfNotes.length + idx;
            noteInfos[infoIndex].x = nx;
          });
        } catch (e) {
          console.error("Error formatting measure", e);
        }
      }

      x += width;
    });

    allStaves.push(stavesForPart);
  });

  if (musicData.parts.length === 2 && allStaves.length === 2) {
    const num = Math.min(allStaves[0].length, allStaves[1].length);
    for (let i = 0; i < num; i++) {
      const top = allStaves[0][i];
      const bottom = allStaves[1][i];

      if (i === 0) {
        new StaveConnector(top, bottom)
          .setType(StaveConnector.type.BRACE)
          .setContext(ctx)
          .draw();
      }

      new StaveConnector(top, bottom)
        .setType(StaveConnector.type.SINGLE_LEFT)
        .setContext(ctx)
        .draw();

      new StaveConnector(top, bottom)
        .setType(StaveConnector.type.SINGLE_RIGHT)
        .setContext(ctx)
        .draw();
    }
  }

  return { measures: measuresMeta, notes: noteInfos, totalWidth };
}
