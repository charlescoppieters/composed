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
  drums: "#EF4444",
  bass: "#F97316",
  chords: "#EAB308",
  melody: "#22C55E",
  vocals: "#3B82F6",
  fx: "#A855F7",
};
