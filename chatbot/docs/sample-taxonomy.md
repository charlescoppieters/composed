# Sample Taxonomy

Controlled vocabulary for sample categorization. Every sample has one `category` and optional `attributes`.

## Categories by Role Group

### Percussion (one-shots, rhythmic)
| Category | Description | Examples |
|----------|-------------|---------|
| `kick` | Kick drums | acoustic, electronic, 808 kick, layered |
| `snare` | Snare drums | acoustic, electronic, clap-snare |
| `clap` | Claps and snaps | layered claps, finger snaps |
| `hat` | Hi-hats | closed, open, pedal, roll |
| `perc` | Misc percussion | shaker, tambourine, conga, bongo |
| `tom` | Toms | floor, rack, electronic |
| `crash` | Crash cymbals | |
| `ride` | Ride cymbals | |
| `rimshot` | Rimshots | |
| `shaker` | Shakers | |
| `snap` | Finger snaps | |

### Bass (one-shots, low-frequency pitched)
| Category | Description | Examples |
|----------|-------------|---------|
| `808` | 808 sub bass | short, sustained, distorted |
| `bass` | Synth/acoustic bass | FM, saw, reese, upright, slap |

### Melodic (one-shots, pitched)
| Category | Description | Examples |
|----------|-------------|---------|
| `keys` | Piano and keyboard | grand piano, electric piano, organ |
| `lead` | Lead synths | saw, square, supersaw, acid |
| `pad` | Pads and atmospheres | analog, digital, evolving, choir |
| `pluck` | Plucked sounds | pizzicato, harp, kalimba, marimba |
| `synth` | General synth sounds | stabs, textures, effects |
| `bell` | Bells and chimes | tubular, wind chime, glockenspiel |
| `instrument` | Acoustic instruments | guitar, flute, koto, woodwind |

### Loops (tempo-locked, repeating patterns)
| Category | Description | Key Properties |
|----------|-------------|---------------|
| `loop_drum` | Full drum patterns | BPM |
| `loop_melody` | Melodic phrases | BPM, key |
| `loop_guitar` | Guitar loops | BPM, key |
| `loop_hihat` | Hi-hat patterns | BPM |
| `loop_perc` | Percussion patterns | BPM |
| `loop_vocal` | Vocal loops/chops | BPM, key |

### FX & Texture
| Category | Description | Examples |
|----------|-------------|---------|
| `impact` | Hits and booms | sub drops, orchestra hits |
| `riser` | Build-ups | pitch sweeps, reverse cymbals |
| `transition` | Section transitions | sweeps, whooshes |
| `texture` | Ambient layers | vinyl crackle, tape hiss, noise |
| `foley` | Real-world sounds | footsteps, rain, room tone |
| `whoosh` | Whoosh effects | fast sweeps |

### Vocals
| Category | Description | Examples |
|----------|-------------|---------|
| `vocal` | Vocal samples | chops, phrases, adlibs, harmonies |

### Stems & MIDI (utility, deprioritized in search)
| Category | Description |
|----------|-------------|
| `stem_drum` | Isolated drum elements from loops |
| `stem_melody` | Isolated melodic elements from loops |
| `stem_guitar` | Isolated guitar elements from loops |
| `midi` | MIDI files |

## Attribute Axes

| Axis | Values | What it describes |
|------|--------|-------------------|
| `tone` | bright, dark, warm, cold, punchy, smooth | Tonal character |
| `envelope` | short, tight, long, boomy | Amplitude shape |
| `texture` | clean, dirty, gritty, crisp | Surface quality |
| `space` | dry, roomy, wet | Reverb/room feel |
| `sourceFeel` | acoustic, electronic, foley, cinematic, synthetic | Origin character |

## Vibe-to-Technical Translation

For AI agent use — maps beginner language to searchable terms:

| Vibe Word | Maps To |
|-----------|---------|
| dark | low-pass, minor, sub, deep, warm |
| bright | high-frequency, crisp, airy, clean |
| punchy | tight, short attack, compressed, dry |
| smooth | long release, warm, clean, soft |
| gritty | dirty, distorted, bitcrushed, saturated |
| spacey | wet, reverb, long tail, wide |
| heavy | sub, bass, loud, thick |
| chill | slow, warm, smooth, soft |
| crispy | high-end, short, bright, crackle |
| fat | wide, layered, thick, sub |

## Authoring Rules

- One stable `category` per sample — never changes.
- `tags` are short, searchable keywords.
- `freeTextDescription` carries broader vibe language and context.
- `userNotes` accumulate from user feedback over time.
- `attributes` use the controlled vocabulary above.
- `sourceRef.pack` tracks which sample pack it came from.
