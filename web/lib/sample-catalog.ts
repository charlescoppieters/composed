export interface SampleKit {
  id: string;
  name: string;
  /** null = use Tone.js synths (no samples) */
  samples: Record<string, string> | null;
}

/** Sampler preset for pitched instruments (bass, melody, keys/chords) */
export interface SamplerPreset {
  id: string;
  name: string;
  /** null = use Tone.js synths. Keys are note names (e.g. "C3"), values are URLs */
  samples: Record<string, string> | null;
}

function enc(path: string): string {
  return `/api/samples/${encodeURIComponent(path).replace(/%2F/g, "/")}`;
}

function samplerPreset(
  id: string,
  name: string,
  /** Map of note name -> file path under samples/ */
  noteFiles: Record<string, string> | null
): SamplerPreset {
  if (!noteFiles) return { id, name, samples: null };
  const samples: Record<string, string> = {};
  for (const [note, file] of Object.entries(noteFiles)) {
    samples[note] = enc(file);
  }
  return { id, name, samples };
}

/** Maps drum row labels to sample file paths under /api/samples/drums/one-shots/ */
function drumKit(
  id: string,
  name: string,
  files: {
    Kick: string;
    Snare: string;
    CH: string;
    OH: string;
    Clap: string;
    Rim: string;
    "Lo Tom": string;
    "Hi Tom": string;
  }
): SampleKit {
  const samples: Record<string, string> = {};
  for (const [label, file] of Object.entries(files)) {
    samples[label] = enc(`drums/one-shots/${file}`);
  }
  return { id, name, samples };
}

export const DRUM_KITS: SampleKit[] = [
  { id: "synth", name: "Synth", samples: null },

  drumKit("808", "808", {
    Kick: "kicks/Kick 808 Deep.wav",
    Snare: "snares/Snare 808.wav",
    CH: "hihats/Hihat Closed 808.wav",
    OH: "hihats/Hihat Open 808.wav",
    Clap: "claps/Clap 808.wav",
    Rim: "percussion/Clave 808.wav",
    "Lo Tom": "toms/Tom 808 Low.wav",
    "Hi Tom": "toms/Tom 808 Hi.wav",
  }),

  drumKit("909", "909", {
    Kick: "kicks/Kick 909 1.wav",
    Snare: "snares/Snare 909 Hard 1.wav",
    CH: "hihats/Hihat Closed 909.wav",
    OH: "hihats/Hihat Open 909.wav",
    Clap: "claps/Clap 909.wav",
    Rim: "percussion/Conga 808 Hi.wav",
    "Lo Tom": "toms/Tom 909 Low.wav",
    "Hi Tom": "toms/Tom 909 Hi.wav",
  }),

  drumKit("acoustic", "Acoustic", {
    Kick: "kicks/Kick Acoustic Room.wav",
    Snare: "snares/Snare Acoustic Crystal.wav",
    CH: "hihats/Hihat Closed Acoustic Fast.wav",
    OH: "hihats/Hihat Open Acoustic Core.wav",
    Clap: "claps/Clap Acoustified Dry.wav",
    Rim: "percussion/Rim 505.wav",
    "Lo Tom": "toms/Tom 505 Low.wav",
    "Hi Tom": "toms/Tom 505 Hi.wav",
  }),

  drumKit("lofi", "Lo-Fi", {
    Kick: "kicks/Kick Vinyl 45 1.wav",
    Snare: "snares/Snare 70s Vinyl.wav",
    CH: "hihats/Hihat Closed 45 Vinyl.wav",
    OH: "hihats/Hihat Open Gritty.wav",
    Clap: "claps/Clap LoFi Processed.wav",
    Rim: "percussion/Rim 808.wav",
    "Lo Tom": "toms/Tom 606 Low.wav",
    "Hi Tom": "toms/Tom 606 Hi.wav",
  }),

  drumKit("707", "707", {
    Kick: "kicks/Kick 707 1.wav",
    Snare: "snares/Snare 707.wav",
    CH: "hihats/Hihat Closed 707.wav",
    OH: "hihats/Hihat Open 707.wav",
    Clap: "claps/Clap 707.wav",
    Rim: "percussion/Cowbell 707.wav",
    "Lo Tom": "toms/Tom 707 Low.wav",
    "Hi Tom": "toms/Tom 707 Hi.wav",
  }),

  drumKit("606", "606", {
    Kick: "kicks/Kick 606.wav",
    Snare: "snares/Snare 606.wav",
    CH: "hihats/Hihat Closed 606.wav",
    OH: "hihats/Hihat Open 606.wav",
    Clap: "claps/Clap 505 ASR.wav",
    Rim: "percussion/Rim 909.wav",
    "Lo Tom": "toms/Tom 606 Low.wav",
    "Hi Tom": "toms/Tom 606 Hi.wav",
  }),

  drumKit("505", "505", {
    Kick: "kicks/Kick 505.wav",
    Snare: "snares/Snare 505.wav",
    CH: "hihats/Hihat Closed 505.wav",
    OH: "cymbals/Crash 505.wav",
    Clap: "claps/Clap 505 ASR.wav",
    Rim: "percussion/Rim 505.wav",
    "Lo Tom": "toms/Tom 505 Low.wav",
    "Hi Tom": "toms/Tom 505 Hi.wav",
  }),

  drumKit("dmx", "DMX", {
    Kick: "kicks/Kick DMX.wav",
    Snare: "snares/Snare DMX Analog.wav",
    CH: "hihats/Hihat Closed 707.wav",
    OH: "hihats/Hihat Open 707.wav",
    Clap: "claps/Clap Trap Layer.wav",
    Rim: "percussion/Rim 707.wav",
    "Lo Tom": "toms/Tom 808 Low.wav",
    "Hi Tom": "toms/Tom 808 Hi.wav",
  }),

  drumKit("breakbeat", "Breakbeat", {
    Kick: "kicks/Kick Jungle SP 1.wav",
    Snare: "snares/Snare Jungle.wav",
    CH: "hihats/Hihat Closed Bluesbreak.wav",
    OH: "hihats/Hihat Open Bluesbreak.wav",
    Clap: "claps/Clap Abstract 3.wav",
    Rim: "percussion/Rim Jungle.wav",
    "Lo Tom": "toms/Tom 707 Low.wav",
    "Hi Tom": "toms/Tom 707 Hi.wav",
  }),
];

// ── Bass presets ──

export const BASS_PRESETS: SamplerPreset[] = [
  samplerPreset("synth", "Synth", null),
  samplerPreset("sub", "Sub", {
    D1: "bass/one-shots/Bass Deep Money D1.wav",
  }),
  samplerPreset("electric", "Electric", {
    C2: "bass/one-shots/Bass Electric Raw C2.wav",
  }),
  samplerPreset("upright", "Upright", {
    C1: "bass/one-shots/Bass Upright C1.wav",
  }),
  samplerPreset("pluck", "Pluck", {
    B1: "bass/one-shots/Bass Pluck B1.wav",
  }),
  samplerPreset("electric-taka", "Taka", {
    C2: "bass/one-shots/Bass Electric Taka C.wav",
  }),
];

// ── Melody presets ──

export const MELODY_PRESETS: SamplerPreset[] = [
  samplerPreset("synth", "Synth", null),
  samplerPreset("acid", "Acid", {
    C3: "melody/one-shots/synth-leads/Acid Meltdown - C3.wav",
  }),
  samplerPreset("flute", "Flute", {
    C4: "melody/one-shots/winds/Clay Flute C4.wav",
  }),
  samplerPreset("indian-flute", "Indian Flute", {
    C4: "melody/one-shots/winds/Indian Flute C4.wav",
  }),
  samplerPreset("guitar", "Guitar", {
    C3: "melody/one-shots/guitar/Guitar Acoustic C3.wav",
  }),
  samplerPreset("strings", "Strings", {
    C4: "melody/one-shots/strings/Strings Orch C4.wav",
  }),
];

// ── Chords/Keys presets ──

export const CHORDS_PRESETS: SamplerPreset[] = [
  samplerPreset("synth", "Synth", null),
  samplerPreset("piano", "Piano", {
    C2: "keys/one-shots/multisamples/GrandPiano C2 mf.wav",
    C4: "keys/one-shots/multisamples/GrandPiano C4 mf.wav",
    C5: "keys/one-shots/multisamples/GrandPiano C5 mf.wav",
  }),
  samplerPreset("vibraphone", "Vibraphone", {
    C3: "keys/one-shots/mallets/Vibraphone C3.wav",
  }),
  samplerPreset("marimba", "Marimba", {
    C2: "keys/one-shots/mallets/Marimba Maple C2.wav",
  }),
  samplerPreset("music-box", "Music Box", {
    C4: "keys/one-shots/mallets/Music Box C4.wav",
  }),
  samplerPreset("bells", "Bells", {
    C5: "keys/one-shots/mallets/Bell Brooklyn C5.wav",
  }),
];

// ── FX pad presets ──

function fxLabel(file: string): string {
  // "stabs/Stab Brass Blast.wav" -> "Brass Blast"
  // "hits/Riser Whoosh Up.wav" -> "Whoosh Up"
  const base = file.split("/").pop()!.replace(/\.wav$/, "");
  return base.replace(/^(Stab|FX|Impact|Riser|Sweep|Swell|Blip) ?/, "").trim() || base;
}

function fxKit(
  id: string,
  name: string,
  files: string[]
): SampleKit {
  const samples: Record<string, string> = {};
  files.forEach((file) => {
    samples[fxLabel(file)] = enc(`fx/one-shots/${file}`);
  });
  return { id, name, samples };
}

export const FX_KITS: SampleKit[] = [
  fxKit("stabs", "Stabs", [
    "stabs/Stab Brass Blast.wav",
    "stabs/Stab House DMaj7.wav",
    "stabs/Stab Synth Bend.wav",
    "stabs/Stab Orchestra Hit Vinyl 1.wav",
    "stabs/Stab Horn Single.wav",
    "stabs/Stab Dub Techno Emin.wav",
    "stabs/Stab Vinyl Punchy 1.wav",
    "stabs/Stab Jazz Bb.wav",
  ]),

  fxKit("stabs-vinyl", "Vinyl Stabs", [
    "stabs/Stab Vinyl Bell.wav",
    "stabs/Stab Vinyl Bend.wav",
    "stabs/Stab Vinyl Brass F#.wav",
    "stabs/Stab Vinyl Horn.wav",
    "stabs/Stab Vinyl Punchy 1.wav",
    "stabs/Stab Vinyl Punchy 2.wav",
    "stabs/Stab Orchestra Hit Vinyl 2.wav",
    "stabs/Stab Orchestra Hit Vinyl 3.wav",
  ]),

  fxKit("stabs-strings", "String Stabs", [
    "stabs/Stab Strings Bendy.wav",
    "stabs/Stab Strings Phased 1.wav",
    "stabs/Stab Strings Phased 2.wav",
    "stabs/Stab Strings Phased 3.wav",
    "stabs/Stab Strings Phased 4.wav",
    "stabs/Stab Strings Scary Vintage.wav",
    "stabs/Stab String Pizzicato F.wav",
    "stabs/Stab Flute String.wav",
  ]),

  fxKit("impacts", "Impacts", [
    "hits/Impact Slam.wav",
    "hits/Impact Layered.wav",
    "hits/Impact Deep Pad 120 bpm.wav",
    "hits/Impact GE.wav",
    "hits/Impact Flanged.wav",
    "hits/Impact Short Metal.wav",
    "hits/Impact Robotic.wav",
    "hits/Impact Soft Top.wav",
  ]),

  fxKit("risers", "Risers", [
    "hits/Riser Noise Gated.wav",
    "hits/Riser Sine.wav",
    "hits/Riser Synth.wav",
    "hits/Riser Taka Breath.wav",
    "hits/Riser White Noise.wav",
    "hits/Riser Whoosh Up.wav",
    "hits/Sweep White Noise Fall.wav",
    "hits/Swell Rusher.wav",
  ]),

  fxKit("sfx", "SFX", [
    "hits/Airhorn Verb.wav",
    "hits/FX Zap Lo Fi.wav",
    "hits/FX Laser Hit BNYX.wav",
    "hits/FX Scratch Slackjaw.wav",
    "hits/FX Turn On TV.wav",
    "hits/FX Turn Off TV.wav",
    "hits/Video Game.wav",
    "hits/Cash Register.wav",
  ]),

  fxKit("glitch", "Glitch", [
    "hits/FX Click Glitch.wav",
    "hits/FX Glitch Chop.wav",
    "hits/FX Reverse Glitch.wav",
    "hits/FX Stutter Sweep.wav",
    "hits/FX Synth Lofi Chop.wav",
    "hits/FX Combo Chop.wav",
    "hits/FX Noise Short.wav",
    "hits/Blip Impact.wav",
  ]),
];
