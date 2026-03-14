import { MusicalKey, Scale, StemType } from "@/lib/types";

export const MUSICAL_KEYS: MusicalKey[] = [
  "C", "C#", "D", "D#", "E", "F", "F#", "G", "G#", "A", "A#", "B",
];

export const SCALES: Scale[] = ["major", "minor"];

export const STEM_TYPES: StemType[] = [
  "drums", "bass", "chords", "melody", "vocals", "fx",
];

export const BPM_RANGE = { min: 60, max: 200 };

export const BAR_COUNTS = [4, 8, 16] as const;

export const DEFAULT_SETTINGS = {
  bpm: 120,
  key: "C" as MusicalKey,
  scale: "minor" as Scale,
  barCount: 4 as 4 | 8 | 16,
};

export const STEM_COLORS: Record<StemType, string> = {
  drums: "#C46B5A",
  bass: "#6B8FC4",
  chords: "#7BAF6B",
  melody: "#C49B6B",
  vocals: "#B87A56",
  fx: "#9B8EC4",
};

// User avatar color palette — each user gets one
export const USER_COLORS = [
  { bg: "rgba(207,162,75,0.15)", text: "#CFA24B", border: "rgba(207,162,75,0.25)" },
  { bg: "rgba(123,158,132,0.15)", text: "#7B9E84", border: "rgba(123,158,132,0.20)" },
  { bg: "rgba(196,107,90,0.15)", text: "#C46B5A", border: "rgba(196,107,90,0.30)" },
  { bg: "rgba(107,143,196,0.15)", text: "#6B8FC4", border: "rgba(107,143,196,0.30)" },
  { bg: "rgba(196,155,107,0.15)", text: "#C49B6B", border: "rgba(196,155,107,0.30)" },
  { bg: "rgba(184,128,90,0.15)", text: "#B87A56", border: "rgba(184,128,90,0.30)" },
];

export function getUserColor(index: number) {
  return USER_COLORS[index % USER_COLORS.length];
}
