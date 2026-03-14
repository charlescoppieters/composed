# Sample Taxonomy & Phased Build Plan

> Addresses the gap in the synthesis doc: how samples are categorized, and how to phase the POC into viable milestones.

---

## 1. Sample Taxonomy

Samples have two orthogonal classification axes: **role** (what it does musically) and **format** (how it's used technically).

### Axis 1: Role (what it does)

```
PERCUSSION (rhythmic, non-pitched or semi-pitched)
├── Kicks          # 808, acoustic, electronic, layered
├── Snares         # acoustic, clap, rim, electronic
├── Hi-Hats        # open, closed, pedal
├── Cymbals        # crash, ride, splash
├── Toms           # floor, rack, electronic
├── Percussion     # shaker, tambourine, conga, bongo, cowbell
└── Full Drum      # complete patterns (usually loops)

BASS (low-frequency, pitched)
├── Sub Bass       # 808 sub, sine, reese
├── Synth Bass     # FM, saw, square, pluck bass
└── Acoustic Bass  # upright, electric, slap

MELODY (pitched, foreground)
├── Keys           # piano, electric piano, organ, clavinet
├── Synth Lead     # saw, square, supersaw, acid
├── Pluck          # pizzicato, harp, kalimba, marimba
├── Guitar         # clean, distorted, acoustic, nylon
├── Strings        # violin, cello, orchestral section
├── Brass/Wind     # trumpet, sax, flute, horn section
└── Vocal          # chops, phrases, adlibs, harmonies

HARMONY (pitched, background/texture)
├── Pads           # analog, digital, evolving, choir
├── Chords         # stabs, progressions, arpeggiated
└── Drones         # sustained, evolving, dark, bright

TEXTURE (non-pitched, atmospheric)
├── Ambience       # room tone, field recordings, cityscapes
├── Foley          # footsteps, cloth, water, mechanical
├── Noise          # white, pink, vinyl crackle, tape hiss
└── FX             # risers, downlifters, impacts, sweeps, glitch

TRANSITION (structural, used between sections)
├── Risers         # build-ups, pitch sweeps
├── Downlifters    # energy drops, reverse cymbal
├── Impacts        # hits, booms, drops
└── Fills          # drum fills, rolls, stutters
```

### Axis 2: Format (how it's used)

| Format | Description | Key Property |
|--------|-------------|-------------|
| **One-shot** | Single hit, no inherent tempo. Triggered by MIDI/pads. | Duration (ms) |
| **Loop** | Rhythmic pattern, tempo-locked. Repeats seamlessly. | BPM, bars, key (if pitched) |
| **Stem** | Isolated track from a mix (e.g., just the drums). | BPM, key, duration |
| **Phrase** | Musical phrase, not necessarily loopable. | BPM, key, duration |
| **Multi-sample** | Multiple velocity layers of same instrument. | Note range, velocity layers |

### Combined: The Category Matrix

Every sample sits at the intersection:

```
                  One-shot    Loop        Stem        Phrase
Kick              ✓ common    ✓ pattern   rare        —
Snare             ✓ common    ✓ pattern   rare        —
Hi-Hat            ✓ common    ✓ pattern   rare        —
Sub Bass          ✓ common    ✓ common    ✓           ✓
Synth Lead        ✓           ✓           ✓           ✓ common
Pad               ✓ (stab)   ✓ evolving  ✓           —
Vocal             ✓ chop      ✓           ✓ common    ✓ common
Riser             ✓ common    —           —           —
Ambience          —           ✓ common    —           —
```

### Updated Metadata Schema

The synthesis doc's flat `category: "kick"` should become:

```json
{
  "id": "kick-808-01",
  "title": "808 Kick 01",
  "role": "kick",
  "roleGroup": "percussion",
  "format": "one-shot",
  "audioPath": "samples/library/percussion/kicks/kick_808_01.wav",
  "freeTextDescription": "Deep 808 kick with long sub tail, warm and boomy",
  "tags": ["808", "sub", "deep", "trap"],
  "attributes": {
    "tone": ["warm", "deep"],
    "envelope": ["boomy", "sustained"],
    "texture": ["clean"],
    "space": ["dry"],
    "sourceFeel": ["electronic", "classic"]
  },
  "musicalProperties": {
    "bpm": null,
    "key": null,
    "durationMs": 850,
    "bars": null
  }
}
```

Key changes:
- `category` → split into `role` (kick) + `roleGroup` (percussion) + `format` (one-shot)
- Added `musicalProperties` — BPM/key/duration/bars relevant for loops, null for one-shots
- `audioPath` reflects hierarchy: `{roleGroup}/{role_plural}/{filename}`

### Why This Matters for the Agent

The agent needs taxonomy awareness to:
1. **Filter intelligently** — "I need drums" → filter `roleGroup: percussion`, not search for the word "drums"
2. **Suggest by role** — after user picks a kick, suggest snares/hats (same roleGroup, different role)
3. **Distinguish format** — "give me a bass loop" vs "give me a bass hit" → different `format` filter
4. **Handle beginners** — "I need something rhythmic" → `roleGroup: percussion`, "I need background vibes" → `roleGroup: harmony OR texture`

This should be baked into the system prompt's knowledge and the tool filter parameters.

---

## 2. Phased Build Plan

### Phase 0: Foundation (1-2 days)
**Goal:** Scaffold runs, agent responds, no tools yet.

- [ ] Next.js project scaffold + Tailwind
- [ ] Vercel AI SDK v6 + Anthropic provider wired up
- [ ] `/api/chat` route with basic agent loop
- [ ] System prompt v1 (identity, music knowledge, vibe table, taxonomy awareness)
- [ ] Minimal chat UI (text input, message history)
- [ ] **Deliverable:** You can chat with the agent about music. It knows terminology but can't search.

### Phase 1: Sample Library + Search (3-5 days)
**Goal:** Agent can find real samples from a curated library.

- [ ] Curate 200-500 samples across taxonomy (focus on percussion + bass + texture)
- [ ] Write metadata JSON sidecars with role/roleGroup/format/attributes/descriptions
- [ ] `build-index` script: read sidecars → compute MiniLM text embeddings → write LanceDB table with BM25 FTS
- [ ] `search_samples_lexical` tool (LanceDB BM25 over full_text + filters on role/roleGroup/format)
- [ ] `search_samples_semantic` tool (MiniLM embed query → LanceDB vector search + filters)
- [ ] RRF merge of lexical + semantic results
- [ ] Wire tools into agent loop
- [ ] Inline `<audio>` preview in chat UI
- [ ] **Deliverable:** "Give me a dark kick" → agent returns ranked samples you can listen to. **This is the core value prop.** If this doesn't feel good, nothing else matters.

### Phase 2: Generation + Refinement (2-3 days)
**Goal:** Agent can create sounds and iterate on search results.

- [ ] `generate_sound` tool (ElevenLabs SFX API → cache locally → return audio URL)
- [ ] Agent recognizes weak search results and offers generation
- [ ] `refine_search` tool (Rocchio: average liked embeddings, subtract disliked, apply text adjustment)
- [ ] "More like this but darker" works end-to-end
- [ ] Numbered result references ("#3") resolved server-side
- [ ] **Deliverable:** Full search → refine → generate loop works. User never hits a dead end.

### Phase 3: Save + Personalize (2-3 days)
**Goal:** System learns from usage and samples persist.

- [ ] `save_sample` tool (download/move audio, write sidecar, upsert LanceDB index)
- [ ] Selection event logging (`selection_log.jsonl`)
- [ ] Selection count boost + recency boost in re-ranking
- [ ] User alias support (personal sample names)
- [ ] `get_user_preferences` tool (load taste profile, recent searches, favorites)
- [ ] User taste profile (attribute affinities updated on each selection)
- [ ] **Deliverable:** Saved sounds are findable by personal names. Agent gets better the more you use it.

### Phase 4: Polish + Jam-Ready (2-3 days)
**Goal:** Good enough to actually jam with.

- [ ] Mood grid UI for beginners (6-8 vibe buttons → pre-built queries)
- [ ] Role-based result grouping ("Here are kicks... and here are snares that match")
- [ ] BPM/key display on loop results
- [ ] Session context persistence (agent remembers what you've picked this session)
- [ ] Conversation compression for long sessions (>20 turns)
- [ ] Error handling (ElevenLabs quota, empty results, network failures)
- [ ] **Deliverable:** Someone who's never produced music can open this and find sounds they like within 30 seconds.

### Phase 5: Audio Intelligence (post-POC, 1-2 weeks)
**Goal:** The system understands audio, not just text about audio.

- [ ] CLAP audio embeddings (`larger_clap_music`, 512-d)
- [ ] Add `audio_vector` column to LanceDB index
- [ ] 3-signal hybrid search (text vector + audio vector + BPM25)
- [ ] "More like this [plays audio]" — similarity from audio, not just description
- [ ] Audio-to-audio generation (Stable Audio 2.5 via fal.ai)
- [ ] Collaborative filtering (item-item co-selection when 10+ users)
- [ ] **Deliverable:** Find sounds by sound, not just by words.

---

## 3. What's Viable at Each Phase

| Phase | Can you demo it? | Can you jam with it? | Can a beginner use it? |
|-------|-------------------|---------------------|----------------------|
| 0     | Yes (chat only)   | No                  | No (no sounds)       |
| 1     | **Yes (core demo)**| Barely (manual)     | Partially            |
| 2     | Yes (impressive)  | Yes (basic)         | Yes (with guidance)  |
| 3     | Yes (sticky)      | Yes (gets better)   | Yes                  |
| 4     | **Yes (jam-ready)**| **Yes (smooth)**    | **Yes (intuitive)**  |
| 5     | Yes (wow factor)  | Yes (intelligent)   | Yes (magical)        |

**Phase 1 is your first viable demo.** Phase 4 is your first viable jam session. Phase 5 is the moat.

---

## 4. Sample Library Curation Strategy (Phase 1)

For the POC, curate **~500 samples** with this distribution:

| Role Group | Target Count | Priority Roles | Formats |
|------------|-------------|----------------|---------|
| Percussion | 150-200 | kicks (40), snares (40), hats (40), percussion (30), full drum loops (30) | One-shots + loops |
| Bass | 60-80 | sub bass (30), synth bass (30), acoustic bass (15) | One-shots + loops |
| Melody | 60-80 | keys (20), synth lead (20), pluck (15), vocal chops (15) | One-shots + phrases |
| Harmony | 40-60 | pads (25), chords (20), drones (10) | Loops + one-shots |
| Texture | 40-60 | ambience (15), noise (15), FX (15), foley (10) | Loops + one-shots |
| Transition | 30-40 | risers (10), impacts (10), downlifters (10), fills (10) | One-shots |

**Sources (royalty-free):**
- Freesound.org (CC0/CC-BY, needs quality curation)
- Cymatics free packs (high quality, common in tutorials)
- Splice Sounds free tier samples
- Self-generated via ElevenLabs SFX (fill gaps, auto-generate metadata via LLM)

**Metadata quality is more important than sample count.** 200 well-described samples with rich attributes will outperform 2000 with just filenames.
