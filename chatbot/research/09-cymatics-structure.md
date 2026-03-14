# Cymatics Sample Pack Structure Analysis

## Overview

| Pack | Files | Audio | MIDI | Format |
|------|-------|-------|------|--------|
| Orchid Sample Pack | 510 total | 434 .wav | 20 .mid | WAV (all packs) |
| Venom One Shot Collection | 54 total | 53 .wav | 0 | WAV |
| INFINITY Beta Pack 2.0 | 365 total | 291 .wav | 26 .mid | WAV |

All three packs use WAV format exclusively for audio. MIDI files appear alongside stems in Orchid and INFINITY.

---

## 1. Cymatics - Orchid - Sample Pack

### Folder Tree
```
Cymatics - Orchid - Sample Pack/
├── 808s & Basses/              (15 files)
├── Drum Loops/                 (15 files)
├── Drum One Shots/             (55 files)
├── FX/                         (17 files)
├── Guitar Loops/               (6 files)
├── Hihat Loops/                (8 files)
├── Melody Loops/               (20 files)
├── One Shots/                  (13 files - melodic)
├── Percussion Loops/           (14 files)
├── Stems & MIDI/               (279 files)
│   ├── Drum Loop Stems/        (93 files)
│   ├── Guitar Loop Stems/      (33 files)
│   └── Melody Loop Stems and MIDI/ (153 files)
└── Vocal Loops/                (12 files)
```

### File Counts by Category

| Folder | Count | Subcategories |
|--------|-------|---------------|
| 808s & Basses | 15 | 808 (6), REESE (5), BASS (4) |
| Drum Loops | 15 | Full drum loops with BPM |
| Drum One Shots | 55 | Clap (5), Crash (2), Hihat (11), Kick (4), Percussion (12), Ride (2), Rimshot (4), Shaker (4), Snap (3), Snare (7) |
| FX | 17 | Atmosphere (4), Impact FX (3), Live Recording (3), Reverse Crash (2), Reverse Impact (3), Transition FX (2) |
| Guitar Loops | 6 | Named loops with BPM + key |
| Hihat Loops | 8 | Loops with BPM |
| Melody Loops | 20 | Named loops with BPM + key |
| One Shots (melodic) | 13 | KEYS (4), LEAD (3), PAD (2), PLUCK (3), SYNTH (1) |
| Percussion Loops | 14 | Loops with BPM |
| Stems & MIDI | 279 | Drum stems (93), Guitar stems (33), Melody stems + MIDI (153) |
| Vocal Loops | 12 | Named vocal loops with BPM + key |

### Naming Conventions

- **One shots (drums):** `Cymatics - Orchid {Type} - {Name}.wav` or `{Type} - {Name} ({Note}).wav`
  - Examples: `Kick - Clean (F).wav`, `Snare - Arrow (G#).wav`, `Clap - Basic.wav`
  - Note in parentheses indicates root pitch when tonal
- **One shots (melodic):** `Cymatics - Orchid {TYPE} {Name} (C).wav`
  - Examples: `KEYS Classic (C).wav`, `LEAD Serenity (C).wav`, `PAD Humility (C).wav`
  - Type is UPPERCASE, always tuned to C
- **808s/Basses:** `Cymatics - Orchid {TYPE} {Name} (C).wav`
  - Types: `808`, `BASS`, `REESE` -- all tuned to C
- **Loops:** `Cymatics - {Name} - {BPM} BPM {Key}.wav`
  - Examples: `Cymatics - All I Ever Wanted - 90 BPM E Min.wav`
- **FX:** Mixed naming -- `Atmosphere - {BPM} BPM {Key}.wav`, `Impact FX {N}.wav`, `Transition FX {N} - {Key}.wav`
- **Stems:** Same name as parent loop + stem label (e.g., `Kick`, `Hihat`, `Bass`)

---

## 2. Cymatics - Venom - One Shot Collection

### Folder Tree
```
Cymatics - Venom - One Shot Collection/
├── (flat structure - no subfolders)
└── 53 .wav files, categorized by filename prefix
```

### File Counts by Category (from prefix)

| Prefix | Count | Description |
|--------|-------|-------------|
| KEYS | 12 | Piano/keyboard one shots |
| PAD | 9 | Pad/atmosphere one shots |
| SYNTH | 8 | Synthesizer one shots |
| INSTR | 8 | Instrument samples (guitar, flute, koto, woodwind) |
| BELL | 7 | Bell/chime one shots |
| PLUCK | 5 | Pluck synth one shots |
| LEAD | 4 | Lead synth one shots |

### Naming Convention

- **All files:** `Cymatics - {TYPE} {Name} (C).wav`
  - Examples: `Cymatics - BELL Aquatic (C).wav`, `Cymatics - KEYS Glass Piano (C).wav`
  - TYPE is always UPPERCASE
  - All tuned to C
  - Entirely melodic one shots -- no drums in this pack

---

## 3. Cymatics - INFINITY Beta Pack 2.0

### Folder Tree
```
Cymatics - Infinity Beta Pack 2.0/
├── Infinity Drum Collection (Preview)/           (79 files)
│   └── Loop Stems and MIDI/                      (stems + MIDI)
├── Infinity Guitar Collection (Preview)/         (47 files)
│   └── Loop Stems and MIDI/                      (stems + MIDI)
├── Infinity Melody Collection (Preview)/         (148 files)
│   └── Loop Stems and MIDI/                      (stems + MIDI, 113 files)
└── Infinity Vocal Collection (Preview)/          (33 files)
    └── Dry/                                      (dry vocal variants)
```

### File Counts by Category

| Folder | Total | Loops | Stems | MIDI |
|--------|-------|-------|-------|------|
| Drum Collection | 79 | ~11 loops | ~68 stems | included |
| Guitar Collection | 47 | ~12 loops | ~35 stems | included |
| Melody Collection | 148 | ~19 loops | ~113 stems | ~16 MIDI |
| Vocal Collection | 33 | ~20 loops | ~13 dry variants | 0 |

### Naming Conventions

- **Drum loops:** `Cymatics - {Name} Drum Loop - {BPM} BPM.wav`
  - Example: `Cymatics - Bop Drum Loop - 109 BPM.wav`
- **Drum stems:** `Cymatics - {Name} Drum Loop - {BPM} BPM {Element}.wav`
  - Elements: `Kick`, `Clap`, `Hihat`, `Open Hihat`, `Percussion`, `Shaker`, `Rimshot`
- **Melody/Guitar loops:** `Cymatics - {Name} - {BPM} BPM {Key}.wav`
  - Example: `Cymatics - 4 AM Thoughts - 92 BPM G Min.wav`
- **Vocal loops:** Multiple subtypes with different naming:
  - `{Name} Vocal {N} Wet - {BPM} BPM {Key}.wav` (wet vocals)
  - `Infinity Vocal Ambience - {Name} - {Note}.wav` (ambience)
  - `Reverse Vocal - {Name} - {BPM} BPM {Key}.wav` (reverse)
  - `Vocal Chop - {Name} - {BPM} BPM {Key}.wav` (chops)
  - `Vocal Loop - {Name} - {BPM} BPM {Key}.wav` (standard loops)
  - Dry variants in subfolder

---

## Recommended Taxonomy Mapping

### One Shots (single hits)

| Cymatics Category | Our Taxonomy | Source Packs | Notes |
|-------------------|-------------|--------------|-------|
| Kick | `kick` | Orchid | Root note in filename |
| Snare | `snare` | Orchid | Root note in filename |
| Clap | `clap` | Orchid | Some tonal (C) |
| Hihat (Closed/Open/Roll) | `hat` | Orchid | Subtypes: closed, open, roll |
| Crash | `crash` | Orchid | |
| Ride | `ride` | Orchid | |
| Rimshot | `rimshot` | Orchid | |
| Percussion | `perc` | Orchid | Dry/Wet variants |
| Shaker | `shaker` | Orchid | |
| Snap | `snap` | Orchid | |
| 808 | `808` | Orchid | Tuned to C |
| BASS | `bass` | Orchid | Tuned to C |
| REESE | `bass` (subtype: reese) | Orchid | Tuned to C |
| KEYS | `keys` | Orchid, Venom | Tuned to C |
| LEAD | `lead` | Orchid, Venom | Tuned to C |
| PAD | `pad` | Orchid, Venom | Tuned to C |
| PLUCK | `pluck` | Orchid, Venom | Tuned to C |
| SYNTH | `synth` | Orchid, Venom | Tuned to C |
| BELL | `bell` | Venom | Tuned to C |
| INSTR | `instrument` | Venom | Guitar, flute, koto, etc. |

### Loops

| Cymatics Category | Our Taxonomy | Source Packs | Notes |
|-------------------|-------------|--------------|-------|
| Drum Loop | `loop_drum` | Orchid, INFINITY | BPM in filename |
| Melody Loop | `loop_melody` | Orchid, INFINITY | BPM + key in filename |
| Guitar Loop | `loop_guitar` | Orchid, INFINITY | BPM + key in filename |
| Hihat Loop | `loop_hihat` | Orchid | BPM in filename |
| Percussion Loop | `loop_perc` | Orchid | BPM in filename |
| Vocal Loop | `loop_vocal` | Orchid, INFINITY | BPM + key; subtypes: wet, dry, chop, reverse, ambience |

### FX / Textures

| Cymatics Category | Our Taxonomy | Source Packs | Notes |
|-------------------|-------------|--------------|-------|
| Atmosphere | `texture` | Orchid | BPM + key |
| Impact FX | `impact` | Orchid | |
| Reverse Crash | `riser` | Orchid | |
| Reverse Impact | `impact` (subtype: reverse) | Orchid | |
| Transition FX | `transition` | Orchid | Key in filename |
| Live Recording | `foley` | Orchid | Nature/ambient recordings |
| Vocal Ambience | `texture` (subtype: vocal) | INFINITY | |

### Stems & MIDI

| Cymatics Category | Our Taxonomy | Notes |
|-------------------|-------------|-------|
| Drum Loop Stems | `stem_drum` | Individual elements of drum loops |
| Melody Loop Stems | `stem_melody` | Individual layers of melody loops |
| Guitar Loop Stems | `stem_guitar` | Individual layers of guitar loops |
| MIDI files | `midi` | Corresponding MIDI for melody/guitar stems |

---

## Key Parsing Rules for Ingest Script

### Filename Pattern: `Cymatics - {PackName} {Type} {Name} ({Note}).wav`

1. **Pack name** is always after `Cymatics - ` (e.g., `Orchid`, `Venom`, `Infinity`)
2. **BPM** extraction: regex `(\d+)\s*BPM` -- present in all loops
3. **Key** extraction: regex `(BPM\s+)([A-G]#?\s*(?:Min|Maj|min|Maj)?)` -- present in melodic loops
4. **Root note** for one shots: regex `\(([A-G]#?)\)` -- in parentheses at end of filename
5. **Type prefix** for one shots: UPPERCASE word(s) before the name (e.g., `808`, `BASS`, `KEYS`, `LEAD`)
6. **Drum type** for Orchid drum one shots: first word before ` - ` (e.g., `Kick`, `Snare`, `Clap`)
7. **Stem element**: last word before `.wav` when file is in a Stems folder (e.g., `Kick`, `Hihat`, `Bass`)
8. **Folder path** is the primary category signal; filename prefix is secondary

### Special Cases
- Venom has NO subfolders -- category comes entirely from filename prefix
- INFINITY drum stems share the loop name but append the element name
- Some Orchid FX have BPM+key, others are just numbered
- Vocal collection in INFINITY has multiple subtypes identifiable by prefix: `Vocal Chop`, `Vocal Loop`, `Reverse Vocal`, `Vocal Ambience`
- `.DS_Store` files present (filter these out)

### Extended Taxonomy Categories Needed

Beyond the originally proposed categories (`kick`, `snare`, `clap`, `hat`, `perc`, `tom`, `impact`, `riser`, `whoosh`, `texture`, `foley`), these packs require:

**New one-shot categories:** `808`, `bass`, `keys`, `lead`, `pad`, `pluck`, `synth`, `bell`, `instrument`, `snap`, `shaker`, `rimshot`, `crash`, `ride`

**New loop categories:** `loop_drum`, `loop_melody`, `loop_guitar`, `loop_hihat`, `loop_perc`, `loop_vocal`

**New FX categories:** `transition` (distinct from riser/impact)

**New utility categories:** `stem_drum`, `stem_melody`, `stem_guitar`, `midi`
