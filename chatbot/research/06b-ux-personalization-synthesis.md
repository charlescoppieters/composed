# UX & Personalization Synthesis

Unified recommendations for the Composed POC, synthesized from UX research (04) and personalization/learning research (05), with technical constraints from audio generation APIs (01) and agent architecture (03).

---

## 1. Core Interaction Patterns (Ranked by Impact)

### 1. Natural Language Query → Results

**The entry point for everything.** User types or speaks a description, agent returns matching samples.

- Beginner: `"something dark and heavy for a beat"` → agent translates to low-pass, minor key, sub-heavy, searches semantic index
- Expert: `"909 closed hat, 16th note pattern, 130 BPM"` → agent hits lexical search with exact tags
- The agent uses `search_samples_lexical` for precise terms and `search_samples_semantic` for vibes, potentially calling both in parallel

**Why #1:** This is the fundamental interaction. Everything else builds on it. If text-to-results is slow or inaccurate, nothing else matters.

**POC requirement:** Sub-500ms from query to first result displayed. Pre-computed embeddings + SQLite FTS5 make this achievable.

---

### 2. "More Like This" Refinement

**The most natural follow-up.** User found something close, wants variations.

- User clicks "more like this" on a sample → `refine_search` uses Rocchio algorithm (average liked embeddings, subtract disliked) to find neighbors in embedding space
- User says `"like that but darker"` → agent combines original query + adjustment as additive context, re-queries
- Refinement is **sticky**: constraints accumulate as removable chips/tags. "kick" + "dark" + "short decay" builds up, user can remove any constraint

**Concrete example:**
```
User: "I need a snare"
Agent: [shows 5 results]
User: "more like #3 but crunchier"
Agent: [calls refine_search with liked:[#3], adjustment:"crunchier"]
       → returns snares with similar body to #3 but more bit-crush/distortion character
```

**POC requirement:** Expose a one-click "more like this" button on every sample result. The refinement sliders (brightness, energy, complexity) are V1 — skip for POC.

---

### 3. Vibe-to-Technical Translation

**The bridge between beginners and the library.** The system prompt contains a translation table that maps affective vocabulary to production parameters:

| User says | System understands |
|---|---|
| "dark" | low-passed, minor key, sparse, sub-heavy |
| "crispy" | high-frequency content, bit-crushed, short decay |
| "spacey" | long reverb tail, stereo width, slow attack |
| "warm" | analog character, slight saturation, rolled-off highs |
| "fat" | layered, detuned, wide stereo, sub-present |
| "tight" | short decay, minimal reverb, quantized |

**Why this matters:** Beginners say "I want something that sounds like driving at night." Experts say "dark pad, Cm, low-pass at 800Hz, long reverb." The agent must serve both from the same interface.

**POC requirement:** Baked into the system prompt. No UI needed — the LLM handles translation transparently. The vibe-to-technical table should be tested against real beginner queries to ensure coverage.

---

### 4. Sound Generation When Nothing Fits

**The escape hatch.** When the library has no match, the agent offers to generate via ElevenLabs SFX API.

- Agent recognizes weak search results (low similarity scores) and proactively suggests: `"Nothing in the library quite matches. Want me to generate a custom dark 808 with short decay?"`
- Generation takes 2-5 seconds (ElevenLabs) — acceptable during a jam for a novel sound
- Returns 2 variations by default so user can compare
- Generated sounds are **temporary** until explicitly saved

**Concrete example:**
```
User: "I want a kick that sounds like a car door slamming in a parking garage"
Agent: [searches, finds nothing close]
Agent: "I don't have anything like that in the library. Let me generate it."
       [calls generate_sound with "car door slam in parking garage, reverberant,
        percussive impact, low-mid frequency"]
Agent: "Here are 2 variations. Preview them — the first has more low-end thump,
        the second has more metallic ring."
```

**POC requirement:** ElevenLabs SFX API integration. Prompt the user before generating (never auto-generate). Show a "generating..." indicator during the 2-5s wait.

---

### 5. Save / Name / Describe for Future Use

**How the library grows and personalizes.** When a user saves a sample, they create labeled data that improves future retrieval.

- User says `"save that as 'midnight kick'"` → `save_sample` stores with user-chosen name + auto-generated tags
- The user's name becomes an **alias** on the sample metadata — searchable by that user but doesn't overwrite canonical title
- AI auto-suggests tags based on audio analysis (instrument, BPM, key, mood descriptors) — user can accept/edit
- Saved samples feed the **selection log** (query → selected sample mapping) which trains re-ranking over time

**POC requirement:** `save_sample` tool with name, tags, description, and category. Store aliases per-user. Auto-tag generation is V1 — for POC, agent suggests tags in the save confirmation message.

---

### 6. Collaborative Propose-to-Group

**The social layer for jamming.** One person finds a sound and proposes it to the group.

- Proposer clicks "share with group" → sound plays for all participants, synced to session BPM/key
- Other participants hear it in context and react: thumbs up (keep) / thumbs down (skip) / no action (neutral)
- Quick undo: if someone vetoes, revert to previous sound in that slot instantly
- No menus, no dialogs — **"Tinder for samples"**

**POC feasibility: Medium-Low.** Requires real-time audio sync infrastructure (WebRTC or similar) and multi-user session state. The interaction pattern is essential to the product vision but the infrastructure cost is high.

**POC recommendation:** Implement a simplified version — single-device group mode where multiple people gather around one screen/speaker. Parallel independent search (each person has their own search lane) is achievable. Full remote propose-to-group with audio sync is V1.

---

### 7. Session Vibe Drift Detection (Bonus)

**The AI notices patterns.** As the group selects sounds over a session, the agent builds a "session mood vector" — an aggregate of the sonic attributes of accepted sounds. Future suggestions across all instrument slots skew toward the detected vibe.

**Concrete example:** Over 10 minutes, the group has picked 3 dark samples, 1 warm pad, and rejected 2 bright sounds. The agent now weights "dark" and "warm" attributes higher in all searches, without anyone asking.

**POC recommendation:** Skip for POC. Implement in V1 using the session profile approach from personalization research (Option 4: temporary "session user" whose preferences accumulate from group selections).

---

## 2. Beginner vs Expert Paths

The same interface serves both through **progressive disclosure** and **the agent as translator**.

### Entry Points

| Beginner | Expert |
|---|---|
| Sees a **mood/vibe grid**: Dark, Bright, Chill, Hype, Weird, Warm, Heavy, Airy | Sees a **text search bar** with filter dropdowns (BPM, key, category, format) |
| Taps "Dark" → immediately gets dark samples grouped by role (drums, bass, pads) | Types `"909 hat open 16th 128BPM"` → gets exact matches |
| Types `"something that sounds like rain"` → semantic search handles it | Types `"granular texture, high spectral centroid, >8kHz"` → lexical search handles it |

### Same Feature, Two Depths

**Search results:**
- Beginner sees: sample name, one-line vibe description, play button, "more like this" button
- Expert sees: sample name, BPM, key, format (one-shot/loop), duration, full tag list, waveform preview

**How to implement:** Default to beginner view. Detect expertise over time (if user types technical terms like "808", "sidechain", "LFO", show expert details automatically). Also offer a toggle: "Show details" / "Simple view".

**Refinement:**
- Beginner: `"darker"` → agent translates and re-queries
- Expert: adjusts BPM range slider, toggles key filter to minor keys only

**Vocabulary teaching (V1, not POC):**
When a beginner selects a sound tagged "dark," the agent can optionally explain: `"This pad uses a minor key (Cm) with a low-pass filter at 800Hz — that's what gives it the dark character."` Over time, beginners absorb production vocabulary naturally. This should be opt-in and subtle — never lecture during a jam.

### Expertise Detection Signals

| Signal | Indicates |
|---|---|
| Uses technical terms (808, BPM, sidechain) | Expert vocabulary |
| Searches by filename or pack name | Power user |
| Uses vibe words exclusively | Beginner |
| Adjusts technical filters | Expert workflow |
| Time spent per search (fast = expert) | Familiarity |

Store as part of user profile. Update incrementally. Never hard-lock someone into a skill tier — always allow switching.

---

## 3. Personalization Roadmap

### POC: Minimum Personalization That Shows Value

**Goal:** The system feels slightly smarter after 15 minutes of use.

1. **Selection count boost:** Samples that get picked more often rank higher. Cap at 10 selections, weight 0.5 per count. Prevents the system from always showing the same things.

2. **Recency boost:** Recently used/viewed samples get a small ranking bump. Simple `last_used_timestamp` comparison.

3. **Active-user-wins search:** Whoever typed the query gets their personal context applied. No blending logic needed.

4. **Numbered references:** Agent numbers results, user says "#3" — resolved server-side against `lastSearchResults`. This isn't personalization per se but it makes the experience feel responsive and personal.

**Implementation:** ~50 lines of scoring logic in `search_catalog`. No new infrastructure.

---

### V1: Learning Signals to Capture From Day 1

Even before building learning models, **instrument everything**. Every interaction is training data for later.

**Selection log** (`selection_log.jsonl`):
```jsonl
{"timestamp":"2026-03-14T12:00:00Z","userId":"jordan","query":"tight punchy snare","results":["snare-001","snare-003","snare-005"],"selected":"snare-003","sessionId":"abc123"}
```

**Signals to capture:**

| Signal | Storage | Effort |
|---|---|---|
| Search query text | Selection log | Trivial |
| Which results were shown | Selection log | Trivial |
| Which result was selected | Selection log | Trivial |
| Audition dwell time (how long they previewed) | Event log | Small |
| Skip (scrolled past without previewing) | Event log | Small |
| Favorites / bookmarks | User profile | Small |
| "More like this" clicks (which sample was the anchor) | Refinement log | Small |

**User taste profile** (JSON, per user):
```json
{
  "userId": "jordan",
  "attributeAffinities": {
    "tone:warm": 7,
    "tone:punchy": 4,
    "envelope:tight": 5,
    "space:dry": 6
  },
  "categoryAffinities": {
    "kick": 12,
    "snare": 8
  }
}
```

Updated on every selection: increment counters for the selected sample's attribute values. At query time, add a small affinity boost.

**Alias support:** Users name samples personally. `"that deep thump"` becomes an alias on `kick-808-01`, scoped to that user, searchable in future queries.

---

### V2: Embeddings and Preference Learning

**When:** After accumulating 100+ preference pairs (roughly 2-4 weeks of active use by a few users).

1. **Text embeddings for all samples** (Gemini or text-embedding-3-small). Store in SQLite via sqlite-vec. Enables true semantic search — `"underwater piano"` finds reverb-heavy piano samples even if no sample is literally tagged "underwater."

2. **User-specific embedding offset:** One learned vector per user that shifts query embeddings toward their taste. Updated via exponential moving average on each selection. Dead simple, one vector per user.

3. **Retrieval-augmented re-ranking:**
   ```
   final_score = embedding_sim * 0.6 + attribute_affinity * 0.2 + recency * 0.1 + co_selection * 0.1
   ```

4. **Simple knowledge graph:** JSON adjacency list tracking co-usage edges ("kick-808-01 is always used with hat-closed-02 in trap beats"). Boosts co-used samples when the user has already selected a complementary sound.

5. **Logistic regression re-ranker** trained on accumulated (query, winner, loser) triples. Features: embedding cosine similarity, attribute overlap, user affinity score, selection count, co-usage count.

---

## 4. Session Flow: A 5-Minute Jamming Session

**Setting:** Jordan and Alex are at a table with a laptop, building a lo-fi beat together. They open Composed.

---

**0:00 — Session Start**

The agent greets with a low-friction entry point:

> "What vibe are you going for?"

Jordan taps **"Chill"** from the mood grid. Alex types `"lo-fi midnight vibes"` in the search bar.

**What the system does:** Combines both inputs. Runs semantic search for "chill lo-fi midnight vibes." Pre-loads a palette of 15-20 samples grouped by role: drums (kicks, snares, hats), bass, pads/keys, textures/fx.

**What the system learns:** Logs the initial vibe selection. Session mood vector initialized to: chill, lo-fi, dark-adjacent.

---

**0:30 — Drum Selection**

Jordan scrolls through the drum results. Previews `Dusty Kick 04` (1.5 seconds of audition) — skips. Previews `Vinyl Thump` (3 seconds) — likes it.

> Jordan: "This kick is good. What about snares?"

Agent shows snare results, pre-filtered for compatibility with the chill/lo-fi vibe.

Jordan picks `Lo-Fi Rim 02`. Alex says:

> Alex: "That's too bright. More like that but duller."

Agent calls `refine_search` with liked:[Lo-Fi Rim 02], adjustment:"duller, less bright." Returns `Tape Snare 07`, `Muted Rim 01`, `Dusty Crack 03`.

Alex picks `Tape Snare 07`.

**What the system learns:**
- Selection log: Jordan selected `Vinyl Thump` for "chill lo-fi kick" query
- Skip log: Jordan skipped `Dusty Kick 04` (short dwell time)
- Refinement log: Alex refined from `Lo-Fi Rim 02` toward "duller" → selected `Tape Snare 07`
- Jordan's taste profile: increment `tone:warm`, `space:dry`
- Alex's taste profile: increment `tone:warm`, `envelope:soft`

---

**1:30 — Bass Search**

Alex takes over searching:

> Alex: "I need a bass that sounds like a pillow — soft and round"

Agent translates: soft → slow attack, low-pass filtered; round → sine-wave character, sub-focused. Searches semantic index.

Returns `Sub Pillow Bass`, `Warm Sine 808`, `Mellow Sub 03`, `Round Bottom`.

Alex previews `Warm Sine 808` for 4 seconds, then `Sub Pillow Bass` for 6 seconds. Picks `Sub Pillow Bass`.

**What the system learns:**
- "pillow" = soft + round + sub-focused (new vocabulary mapping)
- Dwell time: `Sub Pillow Bass` > `Warm Sine 808` (preference signal even before explicit selection)
- Co-usage: `Sub Pillow Bass` is now co-used with `Vinyl Thump` and `Tape Snare 07` in a lo-fi session

---

**2:30 — Texture Layer**

> Jordan: "We need something ambient. Like vinyl crackle mixed with rain."

Agent searches. Library has `Vinyl Crackle Loop` but nothing with rain character.

> Agent: "I found a vinyl crackle loop that's close. Want me to generate something that combines vinyl crackle with rain texture?"

Jordan: "Yeah, do it."

Agent calls `generate_sound` with prompt: `"Ambient texture loop, vinyl record crackle mixed with soft distant rain, lo-fi aesthetic, warm and muted"`, duration: 10s, loop: true.

**2-4 seconds pass.** Agent returns 2 variations.

> Agent: "Here are 2 options. The first is heavier on the vinyl character, the second has more rain presence."

They preview both. Alex likes variation 2.

> Alex: "Save that as 'Rain Vinyl Bed'"

Agent calls `save_sample` with name: "Rain Vinyl Bed", tags: ["ambient", "texture", "vinyl", "rain", "lo-fi", "loop"], category: "ambient".

**What the system learns:**
- Generation log: prompt → selected variation (training data for prompt engineering)
- New sample enters library with rich metadata from the save action
- Alias: Alex's name "Rain Vinyl Bed" attached to the generated sample
- Co-usage: this texture is now linked to the drum and bass selections in the session graph

---

**4:00 — Refinement**

The beat is playing. Jordan wants to adjust:

> Jordan: "The hat is too regular. Got anything with more swing?"

Agent interprets "swing" as: off-grid timing, unquantized, shuffle feel. Searches for hi-hat patterns with swing/shuffle tags.

Returns `Swing Hat 16th`, `Drunken Hat Loop`, `Shuffled Closed Hat`. Jordan picks `Drunken Hat Loop`.

> Alex: "Nice. But can we make the whole thing a bit darker? Like late-night-drive dark."

Agent doesn't re-search. Instead, it notes "darker" as a session-level adjustment. Future suggestions across all slots will weight toward: darker, more reverb, lower register.

**What the system learns:**
- Session mood vector updated: shift toward "darker" based on explicit request
- "late-night-drive" added as a contextual reference for future sessions

---

**5:00 — Session End**

They stop. The system has captured:

- 6 searches, 12 previews, 4 selections, 2 refinements, 1 generation, 1 save
- Updated taste profiles for both Jordan and Alex
- Co-usage graph: which samples were selected together in a lo-fi session
- Session mood trajectory: chill → chill+dark
- One new sample in the library with human-provided metadata

Next time Jordan opens Composed and types `"lo-fi kick"`, the system boosts `Vinyl Thump` because it was selected for a similar query. When Alex searches for `"ambient texture"`, `Rain Vinyl Bed` appears — found via their personal alias.

---

## 5. What to Skip for POC

Features that add value but aren't essential for proving the core experience.

| Feature | Why Skip | When to Add |
|---|---|---|
| **Refinement sliders** (brightness, energy, complexity) | "More like this" + natural language refinement covers 90% of use cases. Sliders require UI design work and parameter tuning. | V1 — after validating that refinement is a common interaction |
| **A/B comparison mode** | Users can toggle between samples manually by previewing sequentially. Side-by-side is polish, not function. | V1 |
| **Vocabulary teaching** ("this is dark because of the minor key and low-pass filter") | Educational but interrupts flow during jams. Beginners learn organically from repeated use. | V1 — as an opt-in tooltip or post-session summary |
| **Session mood vector / vibe drift detection** | Requires enough selections per session to be meaningful (~10+). Early sessions may be too short. | V1 — using accumulated selection data from POC |
| **Remote multi-user audio sync** | Requires WebRTC/WebSocket infrastructure for real-time audio streaming. High complexity. | V1 — after core search+generate loop is solid |
| **Collaborative filtering** (users who liked X also liked Y) | Needs 10+ active users to produce meaningful signals. POC will have <10. | V2 — when user base justifies it |
| **Embedding fine-tuning** | Needs 500+ (query, audio) pairs. Pre-trained embeddings are good enough for POC scale. | V2+ |
| **Contextual bandits** (explore/exploit) | Needs tuning to avoid surfacing bad suggestions. Simple popularity + affinity boost is safer. | V2 |
| **Full knowledge graph database** (Neo4j/KuzuDB) | JSON adjacency list handles <1000 samples and <10 users. No multi-hop queries needed yet. | V2 — when edge count exceeds 10K |
| **Audio-based similarity** (CLAP embeddings) | Text embeddings over descriptions work well for a curated library. Audio embeddings matter more for user-uploaded content with no metadata. | V2 |
| **Waveform visualization** | Nice for experts but not required for core search-and-select flow. | V1 |
| **Undo stack with audio memory** | Simple "go back to previous" is enough. Full scrubbing through history is polish. | V1 |
| **User expertise auto-detection** | Start with a manual toggle (simple/detailed view). Auto-detection is subtle to get right. | V1 |

### The POC Scope in One Sentence

**Text search (lexical + semantic) → preview samples in context → "more like this" refinement → generate when nothing fits → save with personal name/tags.**

Everything else layers on top of this core loop.

---

## Sources

Synthesized from:
- `research/04-music-production-ux.md` — DAW patterns, sample discovery, beginner/expert models, collaborative jamming, iterative refinement
- `research/05-personalization-learning.md` — preference learning, metadata evolution, embedding adaptation, reinforcement from selection, knowledge graphs, privacy
- `research/01-audio-generation-apis.md` — ElevenLabs SFX (2-5s latency, 48kHz, loop mode), Stable Audio (longer content), generation costs
- `research/03-agent-architecture.md` — Vercel AI SDK, tool definitions (search_lexical, search_semantic, generate_sound, refine_search, save_sample), session design, system prompt with vibe translation table
