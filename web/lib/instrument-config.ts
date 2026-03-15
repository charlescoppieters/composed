import { StemType } from "@/lib/types";
import { STEM_COLORS } from "@/lib/constants";

export interface RowConfig {
  label: string;
  note?: string;       // for drum/chromatic triggers
  color?: string;
}

export interface InstrumentConfig {
  stemType: StemType;
  label: string;
  color: string;
  availableModes: ("generate" | "sequence" | "live")[];
  sequencer: {
    type: "drum" | "chromatic" | "chord" | "sample-slot";
    rows: RowConfig[];
    defaultOctave?: number;
    octaveRange?: [number, number];
  };
  live: {
    inputType: "pads" | "keyboard" | "microphone";
  };
  generate: {
    promptPrefix: string;
    presets: string[];
  };
}

const DRUM_ROWS: RowConfig[] = [
  { label: "Kick", color: "#C46B5A" },
  { label: "Snare", color: "#B8805A" },
  { label: "CH", color: "#6B8FC4" },
  { label: "OH", color: "#7BAF6B" },
  { label: "Clap", color: "#C49B6B" },
  { label: "Rim", color: "#CFA24B" },
  { label: "Lo Tom", color: "#7B9E84" },
  { label: "Hi Tom", color: "#9B8EC4" },
];

export const INSTRUMENT_CONFIGS: Record<StemType, InstrumentConfig> = {
  drums: {
    stemType: "drums",
    label: "Drums",
    color: STEM_COLORS.drums,
    availableModes: ["generate", "sequence", "live"],
    sequencer: {
      type: "drum",
      rows: DRUM_ROWS,
    },
    live: { inputType: "pads" },
    generate: {
      promptPrefix: "seamless looping drum pattern, percussive, loop",
      presets: [
        "four on the floor kick loop",
        "boom bap hip hop drum loop",
        "trap hi-hat rolls with 808 kick loop",
        "jazz brush drum loop",
        "breakbeat drum loop with heavy snare",
      ],
    },
  },
  bass: {
    stemType: "bass",
    label: "Bass",
    color: STEM_COLORS.bass,
    availableModes: ["generate", "sequence", "live"],
    sequencer: {
      type: "chromatic",
      rows: [], // dynamically generated from octave range
      defaultOctave: 2,
      octaveRange: [1, 3],
    },
    live: { inputType: "keyboard" },
    generate: {
      promptPrefix: "seamless looping bass line, loop",
      presets: [
        "deep sub bass groove loop",
        "funky slap bass loop",
        "808 bass pattern loop",
        "walking bass jazz loop",
        "synth bass wobble loop",
      ],
    },
  },
  chords: {
    stemType: "chords",
    label: "Chords",
    color: STEM_COLORS.chords,
    availableModes: ["generate", "sequence", "live"],
    sequencer: {
      type: "chord",
      rows: [], // dynamically generated from key/scale
      defaultOctave: 3,
    },
    live: { inputType: "keyboard" },
    generate: {
      promptPrefix: "seamless looping chord progression, loop",
      presets: [
        "warm pad chord progression loop",
        "piano chord loop",
        "lo-fi jazzy chord loop",
        "ambient synth pad chord loop",
        "acoustic guitar strumming loop",
      ],
    },
  },
  melody: {
    stemType: "melody",
    label: "Melody",
    color: STEM_COLORS.melody,
    availableModes: ["generate", "sequence", "live"],
    sequencer: {
      type: "chromatic",
      rows: [], // dynamically generated from octave range
      defaultOctave: 4,
      octaveRange: [3, 6],
    },
    live: { inputType: "keyboard" },
    generate: {
      promptPrefix: "seamless looping melody, loop",
      presets: [
        "catchy synth lead melody loop",
        "piano melody loop",
        "flute melody loop",
        "pluck synth arpeggio loop",
        "whistling melody loop",
      ],
    },
  },
  vocals: {
    stemType: "vocals",
    label: "Vocals",
    color: STEM_COLORS.vocals,
    availableModes: ["live"],
    sequencer: {
      type: "sample-slot",
      rows: [], // user adds samples
    },
    live: { inputType: "microphone" },
    generate: {
      promptPrefix: "seamless looping vocal, loop",
      presets: [
        "vocal chop loop",
        "choir vocal pad loop",
        "vocal ad-lib loop",
        "rhythmic spoken word loop",
        "humming melody loop",
      ],
    },
  },
  fx: {
    stemType: "fx",
    label: "FX",
    color: STEM_COLORS.fx,
    availableModes: ["generate", "sequence", "live"],
    sequencer: {
      type: "sample-slot",
      rows: [], // user adds samples
    },
    live: { inputType: "pads" },
    generate: {
      promptPrefix: "seamless looping sound effect, loop",
      presets: [
        "riser build up loop",
        "vinyl crackle texture loop",
        "ambient atmosphere pad loop",
        "glitch transition loop",
        "rhythmic foley percussion loop",
      ],
    },
  },
};
