export type NoteDuration = "w" | "h" | "q" | "8" | "16";

export interface ParsedNote {
  keys: string[];
  duration: NoteDuration;
  accidental?: string;
  time: number;
  dynamic?: string;
  articulation?: string;
  slur?: "start" | "stop" | "continue";
  accidentals?: { key: number; accidental: string }[];
}

export interface PartData {
  id: string;
  name: string;
  clef: "treble" | "bass" | "alto" | "tenor";
  notes: ParsedNote[];
  directions: Array<{
    measure: number;
    text: string;
    placement: "above" | "below";
    time: number;
  }>;
}

export interface MusicData {
  keySignature: string;
  timeSignature: string;
  beatsPerMeasure: number;
  beatUnit: number;
  workTitle: string;
  composer: string;
  parts: PartData[];
}
