import { xml2js } from "xml-js";
import { MusicData, PartData, ParsedNote } from "../types/musicTypes";

export function parseMusicXML(xmlText: string): MusicData {
//   const jsonData = xml2js(xmlText, { compact: true, spaces: 2 }) as any;
  const parser = new DOMParser();
  const xmlDoc = parser.parseFromString(xmlText, "text/xml");

  const workTitle =
    xmlDoc.querySelector("work > work-title")?.textContent?.trim() ||
    xmlDoc.querySelector("movement-title")?.textContent?.trim() ||
    "Untitled Piece";

  let composer = "Unknown composer";
  const creatorNodes = Array.from(
    xmlDoc.querySelectorAll("identification > creator")
  );
  const composerNode =
    creatorNodes.find(
      (c) => (c.getAttribute("type") || "").toLowerCase() === "composer"
    ) || creatorNodes[0];

  if (composerNode?.textContent) composer = composerNode.textContent.trim();

  const fifths = parseInt(
    xmlDoc.querySelector("key fifths")?.textContent || "0",
    10
  );
  const keyMap: Record<string, string> = {
    "-7": "Cb",
    "-6": "Gb",
    "-5": "Db",
    "-4": "Ab",
    "-3": "Eb",
    "-2": "Bb",
    "-1": "F",
    "0": "C",
    "1": "G",
    "2": "D",
    "3": "A",
    "4": "E",
    "5": "B",
    "6": "F#",
    "7": "C#",
  };
  const keySignature = keyMap[String(fifths)] ?? "C";

  const beatsStr = xmlDoc.querySelector("time beats")?.textContent || "4";
  const beatTypeStr =
    xmlDoc.querySelector("time beat-type")?.textContent || "4";

  const beatsPerMeasure = parseInt(beatsStr, 10) || 4;
  const beatUnit = parseInt(beatTypeStr, 10) || 4;
  const timeSignature = `${beatsPerMeasure}/${beatUnit}`;

  const parts: PartData[] = [];
  const partNodes = xmlDoc.querySelectorAll("part");

  partNodes.forEach((partNode, partIdx) => {
    const divisions = parseInt(
      partNode.querySelector("divisions")?.textContent || "4",
      10
    );

    const clefs = partNode.querySelectorAll("clef");
    const uniqueStaves = new Set<string>();
    clefs.forEach((c) => uniqueStaves.add(c.getAttribute("number") || "1"));

    const parseStaff = (staffNum: string, clef: PartData["clef"]) => {
      const partNotes: ParsedNote[] = [];
      const measureDirections: PartData["directions"] = [];
      let currentTime = 0;

      const measures = partNode.querySelectorAll("measure");

      measures.forEach((measure, measureIdx) => {
        // directions
        const directions = measure.querySelectorAll("direction");
        directions.forEach((dir) => {
          const dirStaff = dir.querySelector("staff")?.textContent || "1";
          if (dirStaff !== staffNum) return;

          const words = dir.querySelector("direction-type words");
          if (words?.textContent) {
            const placement =
              (dir.getAttribute("placement") as "above" | "below") || "above";
            measureDirections.push({
              measure: measureIdx,
              text: words.textContent,
              placement,
              time: currentTime,
            });
          }
        });

        const noteNodes = measure.querySelectorAll("note");

        noteNodes.forEach((noteEl) => {
          const noteStaff = noteEl.querySelector("staff")?.textContent || "1";
          if (noteStaff !== staffNum) return;

          const duration = parseInt(
            noteEl.querySelector("duration")?.textContent || String(divisions),
            10
          );
          const noteDuration = duration / divisions;

          if (noteEl.querySelector("rest")) {
            currentTime += noteDuration;
            return;
          }

          const pitch = noteEl.querySelector("pitch");
          if (!pitch) return;

          const step = pitch.querySelector("step")?.textContent;
          const octave = pitch.querySelector("octave")?.textContent;
          const alter = pitch.querySelector("alter")?.textContent;

          if (!step || !octave) return;

          let noteName = `${step.toLowerCase()}/${octave}`;
          let accidental: string | undefined;

          if (alter === "1") {
            accidental = "#";
            noteName = `${step.toLowerCase()}#/${octave}`;
          } else if (alter === "-1") {
            accidental = "b";
            noteName = `${step.toLowerCase()}b/${octave}`;
          }

          let durationSymbol: ParsedNote["duration"] = "q";
          if (noteDuration >= 4) durationSymbol = "w";
          else if (noteDuration >= 2) durationSymbol = "h";
          else if (noteDuration >= 1) durationSymbol = "q";
          else if (noteDuration >= 0.5) durationSymbol = "8";
          else if (noteDuration >= 0.25) durationSymbol = "16";

          const isChord = noteEl.querySelector("chord") !== null;

          if (isChord && partNotes.length > 0) {
            const prev = partNotes[partNotes.length - 1];
            prev.keys.push(noteName);
            if (accidental) {
              prev.accidentals = prev.accidentals || [];
              prev.accidentals.push({
                key: prev.keys.length - 1,
                accidental,
              });
            }
          } else {
            const newNote: ParsedNote = {
              keys: [noteName],
              duration: durationSymbol,
              accidental,
              time: currentTime,
            };

            const dynamics = noteEl.querySelector("notations dynamics");
            if (dynamics) {
              const dynType = dynamics
                .querySelector("*")
                ?.tagName?.toLowerCase();
              if (dynType) newNote.dynamic = dynType;
            }

            const arts = noteEl.querySelector("notations articulations");
            if (arts) {
              const artType = arts.querySelector("*")?.tagName?.toLowerCase();
              if (artType) newNote.articulation = artType;
            }

            const slur = noteEl.querySelector("notations slur");
            if (slur) {
              newNote.slur = slur.getAttribute("type") as any;
            }

            partNotes.push(newNote);
            currentTime += noteDuration;
          }
        });
      });

      const partId = partNode.getAttribute("id") || `P${partIdx + 1}`;
      const partNameEl = xmlDoc.querySelector(
        `score-part[id="${partId}"] part-name`
      );
      const partName = partNameEl?.textContent || `Part ${partIdx + 1}`;
      const staffName =
        uniqueStaves.size > 1 ? `${partName} Staff ${staffNum}` : partName;

      const partData: PartData = {
        id: `${partId}_${staffNum}`,
        name: staffName,
        clef,
        notes: partNotes,
        directions: measureDirections,
      };

      parts.push(partData);
    };

    if (uniqueStaves.size > 1) {
      Array.from(uniqueStaves)
        .sort()
        .forEach((staffNum) => {
          const clefForStaff =
            partNode.querySelector(`clef[number="${staffNum}"]`) ||
            partNode.querySelector("clef");

          const sign = clefForStaff?.querySelector("sign")?.textContent || "G";
          const line = clefForStaff?.querySelector("line")?.textContent || "2";

          let clef: PartData["clef"] = "treble";
          if (sign === "G" && line === "2") clef = "treble";
          else if (sign === "F" && line === "4") clef = "bass";
          else if (sign === "C") clef = line === "3" ? "alto" : "tenor";

          parseStaff(staffNum, clef);
        });
    } else {
      const clefSign = partNode.querySelector("clef sign")?.textContent || "G";
      const clefLine = partNode.querySelector("clef line")?.textContent || "2";
      let clef: PartData["clef"] = "treble";
      if (clefSign === "G" && clefLine === "2") clef = "treble";
      else if (clefSign === "F" && clefLine === "4") clef = "bass";
      else if (clefSign === "C") clef = clefLine === "3" ? "alto" : "tenor";

      parseStaff("1", clef);
    }
  });

  return {
    keySignature,
    timeSignature,
    beatsPerMeasure,
    beatUnit,
    workTitle,
    composer,
    parts,
  };
}
