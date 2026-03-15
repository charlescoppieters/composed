import { MusicalKey, Scale } from "@/lib/types";

export const NOTES_IN_OCTAVE = ["C", "C#", "D", "D#", "E", "F", "F#", "G", "G#", "A", "A#", "B"];

const MAJOR_INTERVALS = [0, 2, 4, 5, 7, 9, 11];
const MINOR_INTERVALS = [0, 2, 3, 5, 7, 8, 10];

export function buildScale(rootKey: string, scale: Scale, octaveStart: number, octaveCount: number): Set<string> {
  const intervals = scale === "major" ? MAJOR_INTERVALS : MINOR_INTERVALS;
  const rootIndex = NOTES_IN_OCTAVE.indexOf(rootKey);
  const scaleNotes = new Set<string>();
  for (let oct = octaveStart; oct < octaveStart + octaveCount; oct++) {
    for (const interval of intervals) {
      const noteIndex = (rootIndex + interval) % 12;
      const noteOctave = oct + Math.floor((rootIndex + interval) / 12);
      scaleNotes.add(`${NOTES_IN_OCTAVE[noteIndex]}${noteOctave}`);
    }
  }
  return scaleNotes;
}

export function buildKeyboard(octaveStart: number, octaveCount: number): { note: string; isBlack: boolean }[] {
  const keys: { note: string; isBlack: boolean }[] = [];
  for (let oct = octaveStart; oct < octaveStart + octaveCount; oct++) {
    for (const note of NOTES_IN_OCTAVE) {
      keys.push({ note: `${note}${oct}`, isBlack: note.includes("#") });
    }
  }
  keys.push({ note: `C${octaveStart + octaveCount}`, isBlack: false });
  return keys;
}

export function getChromaticNotes(octaveStart: number, octaveEnd: number): string[] {
  const notes: string[] = [];
  for (let oct = octaveStart; oct <= octaveEnd; oct++) {
    for (const note of NOTES_IN_OCTAVE) {
      notes.push(`${note}${oct}`);
    }
  }
  return notes;
}

// Diatonic chord qualities for major scale: I, ii, iii, IV, V, vi, vii°
const MAJOR_CHORD_QUALITIES = ["maj", "min", "min", "maj", "maj", "min", "dim"] as const;
const MINOR_CHORD_QUALITIES = ["min", "dim", "maj", "min", "min", "maj", "maj"] as const;

const MAJOR_NUMERALS = ["I", "ii", "iii", "IV", "V", "vi", "vii°"];
const MINOR_NUMERALS = ["i", "ii°", "III", "iv", "v", "VI", "VII"];

export function getDiatonicChords(key: MusicalKey, scale: Scale): { numeral: string; root: string; quality: string }[] {
  const intervals = scale === "major" ? MAJOR_INTERVALS : MINOR_INTERVALS;
  const qualities = scale === "major" ? MAJOR_CHORD_QUALITIES : MINOR_CHORD_QUALITIES;
  const numerals = scale === "major" ? MAJOR_NUMERALS : MINOR_NUMERALS;
  const rootIndex = NOTES_IN_OCTAVE.indexOf(key);

  return intervals.map((interval, i) => ({
    numeral: numerals[i],
    root: NOTES_IN_OCTAVE[(rootIndex + interval) % 12],
    quality: qualities[i],
  }));
}

export function getChordVoicing(root: string, quality: string, octave: number): string[] {
  const rootIdx = NOTES_IN_OCTAVE.indexOf(root);
  let intervals: number[];
  switch (quality) {
    case "maj": intervals = [0, 4, 7]; break;
    case "min": intervals = [0, 3, 7]; break;
    case "dim": intervals = [0, 3, 6]; break;
    default: intervals = [0, 4, 7]; break;
  }
  return intervals.map(i => {
    const noteIdx = (rootIdx + i) % 12;
    const noteOct = octave + Math.floor((rootIdx + i) / 12);
    return `${NOTES_IN_OCTAVE[noteIdx]}${noteOct}`;
  });
}
