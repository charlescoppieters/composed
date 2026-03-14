# Composed AI Layer — Research Synthesis & POC Blueprint

> Definitive planning document synthesized from all research (01-05) and both synthesis docs (06a, 06b).
> Last updated: 2026-03-14

---

## 1. Executive Summary

Composed is an AI-powered layer for a collaborative music jamming app that helps musicians find, create, and iterate on sounds through natural language. It bridges the gap between how beginners describe sounds ("something dark and heavy") and how sample libraries are organized (technical metadata, folder hierarchies), using a tool-calling agent backed by hybrid semantic/lexical search and on-demand audio generation.

**The market gap:** No existing tool combines low-latency collaborative jamming with AI-powered sample discovery. Splice has similarity search but no collaboration. BandLab has collaboration but no AI discovery. DAW browsers are single-user, keyword-only, and break creative flow. Composed sits at the intersection.

**What we're building for the POC:** A chat-based agent with 3 core tools (lexical search, semantic search, sound generation) that can find samples from a curated library via natural language, translate vibes to technical parameters, generate new sounds when nothing fits, and learn from user selections over time.

---

## 2. Consensus Technology Stack

| Component | Technology | Why | Alternative Considered |
|-----------|-----------|-----|----------------------|
| **LLM** | Claude Sonnet (`claude-sonnet-4-20250514`) | Best tool-use accuracy, fast (sub-second), cost-effective (~$0.03/session) | GPT-4o (comparable but we're building on Anthropic) |
| **Agent framework** | Vercel AI SDK v6 | TypeScript-native, streaming, clean Zod tool schemas, built-in agent loop, model-agnostic | Raw Claude tool use (viable fallback, ~50 lines of code) |
| **Audio generation** | ElevenLabs Sound Effects API v2 | 48kHz WAV, 2-5s latency, loop mode, up to 30s, production-ready API | Stable Audio 2.5 via fal.ai (better for longer musical phrases, add post-POC) |
| **Text embeddings** | `all-MiniLM-L6-v2` (sentence-transformers) | 384-d, 80MB, local, ~5ms/query, free, offline-capable | OpenAI text-embedding-3-small (marginal quality gain, adds API dependency) |
| **Audio embeddings** | None for POC; LAION-CLAP `larger_clap_music` post-POC | 512-d shared text-audio space; deferred to avoid 2.5GB dependency | Microsoft CLAP 2023 (smaller community, benchmark only if LAION fails) |
| **Vector + hybrid search** | LanceDB (embedded) | Multi-vector columns, built-in BM25 FTS, zero config, fastest local option | ChromaDB (no hybrid search), sqlite-vec (immature) |
| **Search strategy** | RRF over text vectors + BM25 (expanding to 3 signals with CLAP) | Simple, robust, no weight tuning needed | Weighted linear combination (requires eval data to tune) |
| **Metadata / app DB** | SQLite (single file) | User prefs, events, session state. Joins and transactions. Zero infra. | PostgreSQL (overkill for local-first POC) |
| **Frontend** | Next.js + Tailwind CSS | Fast to build, streaming support, good DX | — |
| **Audio storage** | Local filesystem | Simplest option. Cache generated audio locally. | S3 (add when multi-device sync needed) |

---

## 3. System Architecture

```
                          ┌──────────────────────────┐
                          │     Next.js Frontend      │
                          │  Chat UI + Audio Player   │
                          │  + Mood Grid (beginners)  │
                          └────────────┬──────────────┘
                                       │ streaming text + audio URLs
                                       │
                          ┌────────────▼──────────────┐
                          │    API Route /api/chat     │
                          │    (Vercel AI SDK v6)      │
                          └────────────┬──────────────┘
                                       │
                          ┌────────────▼──────────────┐
                          │       Agent Loop           │
                          │  Claude Sonnet + Tools     │
                          │  System prompt w/ vibe     │
                          │  translation table         │
                          └────────────┬──────────────┘
                                       │
             ┌─────────────────────────┼─────────────────────────┐
             │                         │                         │
  ┌──────────▼──────────┐  ┌──────────▼──────────┐  ┌───────────▼──────────┐
  │ search_samples       │  │  generate_sound      │  │  save_sample /       │
  │  _lexical            │  │                      │  │  refine_search /     │
  │  _semantic           │  │                      │  │  get_user_prefs      │
  └───┬──────────┬───────┘  └──────────┬───────────┘  └───────────┬──────────┘
      │          │                     │                          │
      │          │                     │                          │
 ┌────▼────┐ ┌──▼──────────┐   ┌──────▼──────────┐       ┌──────▼───────┐
 │ LanceDB │ │ LanceDB     │   │  ElevenLabs     │       │   SQLite     │
 │ BM25    │ │ Vector      │   │  SFX API v2     │       │  (prefs,     │
 │ FTS     │ │ (text_vec)  │   │                 │       │   events,    │
 │ Index   │ │             │   │                 │       │   aliases)   │
 └────┬────┘ └──┬──────────┘   └──────┬──────────┘       └──────┬───────┘
      │         │                     │                         │
      └────┬────┘                     │                         │
           │                          │                         │
    ┌──────▼──────┐            ┌──────▼──────┐          ┌──────▼───────┐
    │  RRF Merge  │            │ Audio Cache │          │ Selection    │
    │  + Re-rank  │            │ (local fs)  │          │ Log (JSONL)  │
    └─────────────┘            └─────────────┘          └──────────────┘

GENERATION PATH:
  User: "Make a vinyl crackle rain texture"
    → Agent calls generate_sound
    → ElevenLabs SFX API (2-5s)
    → Audio cached locally
    → User previews, optionally saves to library

RETRIEVAL PATH:
  User: "dusty lo-fi snare"
    → Agent calls search_samples_semantic (and/or _lexical)
    → MiniLM embeds query text (5ms)
    → LanceDB vector search on text_vector (5ms)
    → LanceDB FTS search on full_text (5ms)
    → RRF merges ranked lists (1ms)
    → Agent presents top 5 with descriptions
    → Total: ~16ms search latency
```

---

## 4. Core Interaction Model

### The 5 POC Interaction Patterns (Priority Order)

1. **Natural Language Query → Results.** User types a description (vibe or technical), agent returns matching samples. The fundamental interaction. Target: sub-500ms to first result.

2. **"More Like This" Refinement.** User clicks a button or says "more like #3 but darker." Agent uses Rocchio-style refinement (average liked embeddings, subtract disliked) with additive constraint accumulation.

3. **Vibe-to-Technical Translation.** Transparent bridging in the system prompt. "Dark" → low-passed, minor key, sub-heavy. "Crispy" → high-frequency, bit-crushed, short decay. No UI needed — the LLM handles it.

4. **Sound Generation When Nothing Fits.** Agent recognizes weak search results and offers to generate via ElevenLabs. Returns 2 variations, 2-5s latency. Generated sounds are temporary until saved.

5. **Save / Name / Describe.** User saves a sample with a personal name and tags. Name becomes a user-scoped alias. Selection feeds the learning loop.

### End-to-End Session Walkthrough

```
0:00  Jordan taps "Chill" on mood grid. Alex types "lo-fi midnight vibes."
      → Agent combines inputs, pre-loads 15-20 samples grouped by role.

0:30  Jordan previews kicks. Skips "Dusty Kick 04" (0.5s dwell).
      Selects "Vinyl Thump" (3s dwell).
      → Selection logged. Taste profile: +warm, +dry.

      Jordan: "What about snares?"
      → Agent shows snare results filtered for chill/lo-fi.

1:00  Jordan picks "Lo-Fi Rim 02". Alex: "Too bright. Duller."
      → Agent refines: liked=[Lo-Fi Rim 02], adjustment="duller"
      → Alex picks "Tape Snare 07" from refined results.

1:30  Alex: "I need a bass that sounds like a pillow"
      → Agent translates: pillow = soft attack, sine-wave, sub-focused
      → Alex picks "Sub Pillow Bass" after 6s audition dwell.

2:30  Jordan: "We need vinyl crackle mixed with rain"
      → Library has vinyl crackle but no rain combo.
      → Agent: "Want me to generate that?" → Jordan: "Yeah"
      → ElevenLabs generates 2 variations (3s wait)
      → Alex: "Save variation 2 as 'Rain Vinyl Bed'"

4:00  Jordan: "The hat is too regular. Something with swing?"
      → Agent finds "Drunken Hat Loop". Selected.

5:00  Session ends. System captured: 6 searches, 12 previews,
      4 selections, 2 refinements, 1 generation, 1 save.
      Both users' taste profiles updated. Co-usage graph recorded.
```

---

## 5. Agent Design

### System Prompt Structure

| Section | Purpose |
|---------|---------|
| **Identity** | "You are Composed, a music production assistant..." Brief, decisive, no pretension. |
| **Music Knowledge** | Drum machines, synthesis types, effects, genre signatures, tempo ranges. Static reference. |
| **Vibe-to-Technical Translation Table** | 8+ mappings (dark, bright, punchy, warm, ethereal, crunchy, fat, tight). Baked in, not retrieved. |
| **Tool Usage Guidelines** | When to use each tool: lexical for specific terms, semantic for vibes, generate when library fails. |
| **Response Format** | Show top 3-5 results with name, description, match reason. For generation: describe + ask preference. |

### Tool Definitions

| Tool | Purpose | Key Inputs | Key Outputs |
|------|---------|-----------|-------------|
| `search_samples_lexical` | Exact text match on metadata, tags, paths | `query`, `tags[]`, `category`, `limit` | Ranked sample list with scores |
| `search_samples_semantic` | Vector similarity for vibes/descriptions | `query`, `limit`, `filter{category, bpm, key}` | Ranked sample list with similarity scores |
| `generate_sound` | Create new audio via ElevenLabs SFX | `prompt`, `duration_seconds`, `variations` | Array of audio URLs + metadata |
| `refine_search` | Iterate on previous results | `liked_ids[]`, `disliked_ids[]`, `adjustment`, `previous_query` | Re-ranked sample list |
| `save_sample` | Persist to user library | `source_url`, `name`, `tags[]`, `description`, `category` | Saved sample ID |
| `get_user_preferences` | Load user context | `aspect` (naming, favorites, recent, genre, all) | User preference data |

**POC ships with first 3 tools.** `refine_search`, `save_sample`, and `get_user_preferences` are added immediately after core search works.

### Context Engineering

- **Vibe translation**: Write context (always in system prompt). The model needs this every turn.
- **User preferences**: Select context (injected via tool call at session start, not every turn).
- **Conversation compression**: After 20+ turns, summarize older messages, keep last 6 verbatim.
- **Tool results**: Structured JSON, not prose. Model parses structured data more reliably.
- **Numbered references**: Agent numbers results. "#3" resolved server-side against `lastSearchResults` before sending to LLM.

### Multi-Turn Refinement Strategy

The conversation history IS the agent's memory. No external state machine.

- **Constraints are additive**: "kick" → "dark kick" → "dark kick short decay" accumulates. Display as removable chips.
- **Parallel tool calls**: Agent can call lexical + semantic search simultaneously via `Promise.all`.
- **Max 10 steps per turn**: Safety valve. Most queries resolve in 2-3 steps.
- **Stream final text only**: Tool calls execute server-side. Users see the answer, not intermediate steps.

---

## 6. Data Model

### Sample Metadata Schema

```json
{
  "id": "kick-808-01",
  "title": "808 Kick 01",
  "category": "kick",
  "audioPath": "samples/library/drums/kick_808_01.wav",
  "freeTextDescription": "Deep 808 kick with long sub tail",
  "tags": ["808", "sub", "deep", "trap"],
  "attributes": {
    "tone": ["warm", "deep"],
    "envelope": ["boomy", "sustained"],
    "texture": ["clean"],
    "space": ["dry"],
    "sourceFeel": ["electronic", "classic"]
  },
  "aliases": [
    {
      "name": "that deep thump",
      "userId": "jordan",
      "context": "lo-fi beat session",
      "createdAt": "2026-03-14T00:00:00Z"
    }
  ],
  "selectionCount": 7,
  "sourceType": "sample-pack",
  "userNotes": ["Great layered under acoustic kicks"],
  "embeddingRefs": {
    "textHash": "sha256-of-concatenated-metadata-text",
    "audioHash": "sha256-of-audio-file",
    "indexedAt": "2026-03-14T00:00:00Z"
  }
}
```

### User Preference Schema

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
  },
  "recentSearches": ["lo-fi kick", "dusty snare", "ambient texture"],
  "lastUpdated": "2026-03-14T00:00:00Z"
}
```

### Personal Naming / Tagging

- **Canonical title stays stable** across users. Never overwritten by aliases.
- **Aliases are user-scoped**: stored in the sample sidecar, tagged with userId. Searchable by that user.
- **Alias promotion**: If 3+ users create similar aliases (fuzzy match), promote to shared `tags`.
- **Personal layer** (`aliases`, `userNotes`, `affinities`) stored separately from shared metadata in `samples/_profiles/{userId}/`.

### LanceDB Index Schema

```
Table: samples
  - id (string)
  - text_vector (float32[384])     -- MiniLM embedding of metadata
  - audio_vector (float32[512])    -- CLAP embedding (post-POC, nullable)
  - category (string, filterable)
  - tags (list[string])
  - source_type (string, filterable)
  - full_text (string, FTS indexed) -- concatenated metadata for BM25
  - metadata_hash (string)
  - audio_path (string)
  - title (string)
```

---

## 7. Personalization Strategy

### POC: Selection Boost + Recency

Ships immediately. ~50 lines of scoring logic.

- **Selection count boost**: Samples picked more often rank higher. Cap at 10, weight 0.5 per count.
- **Recency boost**: Recently used samples get small ranking bump via `last_used_timestamp`.
- **Active-user-wins**: Whoever typed the query gets their personal context. No blending.
- **Numbered references**: "#3" resolved server-side. Feels responsive and personal.

### V1: Taste Profiles + Aliases + Event Logging

Ships after POC validation. New `user_profile.py` module.

- **User taste profile**: JSON per user tracking attribute affinities. Updated on every selection.
- **Alias support**: Personal sample names searchable in future queries.
- **Selection log** (`selection_log.jsonl`): Every search + selection logged as training data.
- **Implicit signals**: Audition dwell time, skips, "more like this" anchor samples.
- **Re-ranking formula**: `base_score * 1.0 + affinity * 0.2 + popularity * 0.1 + recency * 0.1`

### V2: Embeddings + Learned Models

Ships after accumulating 100+ preference pairs (~2-4 weeks of active use).

- **CLAP audio embeddings**: Text-to-audio and audio-to-audio retrieval. 3-signal hybrid search.
- **User embedding offset**: One vector per user, updated via exponential moving average.
- **Logistic regression re-ranker**: Trained on (query, winner, loser) triples.
- **Simple knowledge graph**: JSON adjacency list for co-usage and replacement edges.
- **Collaborative filtering**: Item-item co-selection matrix when 10+ users are active.

---

## 8. What We're NOT Building (POC Scope Guard)

| Deferred Feature | Why Not Yet |
|-----------------|-------------|
| **Remote multi-user audio sync** | Requires WebRTC infrastructure. High complexity. POC targets single-device group mode. |
| **Stable Audio / Suno / Udio integration** | One audio gen API is enough. ElevenLabs covers 80% of use cases. |
| **CLAP audio embeddings** | 2.5GB model, 60ms/clip indexing. Text embeddings sufficient for curated library. First post-POC upgrade. |
| **Refinement sliders** (brightness/energy/complexity) | Natural language refinement covers 90% of cases. Sliders need UI design work. |
| **Session mood vector / vibe drift detection** | Needs 10+ selections per session to be meaningful. |
| **Vocabulary teaching** | Educational but interrupts jam flow. Opt-in in V1. |
| **A/B side-by-side comparison** | Users can preview sequentially. Polish, not function. |
| **Collaborative filtering** | Needs 10+ active users. POC has fewer. |
| **Embedding fine-tuning** | Needs 500+ pairs. Pre-trained embeddings are good enough. |
| **Contextual bandits** (explore/exploit) | Needs tuning. Simple popularity + affinity is safer. |
| **Full graph database** (Neo4j/KuzuDB) | JSON adjacency list handles POC scale. |
| **Waveform visualization** | Nice for experts, not required for core flow. |
| **Auto-expertise detection** | Manual toggle (simple/detailed) is enough. |
| **Multi-device sync** | Local-first is fine for POC. Evaluate Turso/LanceDB Cloud later. |

---

## 9. Open Questions for Planning

### Must Decide Before Building

| Question | Options | Recommended Default |
|----------|---------|-------------------|
| **Where does the POC run?** | (a) Local dev server, (b) Vercel deployment | **(a) Local dev server.** SQLite and LanceDB need filesystem access. Deploy to Vercel only after validating locally. If deploying, switch to Turso (hosted SQLite). |
| **Sample library source** | (a) Freesound.org CC samples, (b) Hand-curated royalty-free packs, (c) Generated via ElevenLabs + LLM metadata | **(b) Hand-curate 500-1000 samples** from royalty-free packs. Richest metadata, no licensing ambiguity. Supplement with (c) for gaps. |
| **Audio preview in chat UI** | (a) Inline `<audio>` elements, (b) WaveSurfer.js waveform player | **(a) Inline `<audio>`** for POC. Simple and functional. Add WaveSurfer in V1. |
| **TypeScript or Python for backend?** | (a) TypeScript (Next.js API routes), (b) Python (FastAPI) with TS frontend | **(a) TypeScript throughout.** Vercel AI SDK is TS-native. Use `sentence-transformers` via a Python sidecar or port to `@xenova/transformers` for in-process JS embeddings. |

### Can Defer

| Question | Notes |
|----------|-------|
| CLAP integration timeline | Add after text-based search is validated with real users |
| Streaming audio generation | Loading spinner is fine for 2-5s. Stream only if generating 15-30s clips |
| Credit management for ElevenLabs | Let it fail gracefully. Agent can catch errors and say "generation unavailable" |
| BPM/key sync for preview | Essential for jamming but can be a fast-follow. Initial previews without sync. |

---

## 10. Build Order

| # | What | Complexity | Dependencies | Description |
|---|------|-----------|-------------|-------------|
| 1 | **Project scaffold** | S | None | Next.js app, Tailwind, Vercel AI SDK, Anthropic provider, API route `/api/chat` |
| 2 | **System prompt** | S | None | Vibe-to-technical table, personality, tool usage guidelines, response format |
| 3 | **Sample library + catalog** | M | None | Curate 500-1000 samples. Create metadata JSON sidecars. Build `catalog.jsonl`. |
| 4 | **LanceDB index + BM25** | M | #3 | `build-index` script: read catalog, compute MiniLM text embeddings, write to LanceDB with FTS index |
| 5 | **`search_samples_lexical` tool** | S | #4 | LanceDB FTS query over `full_text` column with metadata filters |
| 6 | **`search_samples_semantic` tool** | S | #4 | MiniLM embed query → LanceDB vector search on `text_vector` column |
| 7 | **RRF merge** | S | #5, #6 | Reciprocal Rank Fusion combining lexical + semantic results |
| 8 | **Agent loop integration** | M | #1, #2, #5, #6, #7 | Wire tools into Vercel AI SDK `generateText` with `maxSteps: 10`. End-to-end query → results. |
| 9 | **Chat UI** | M | #8 | Chat interface with message history, inline `<audio>` preview for results |
| 10 | **`generate_sound` tool** | M | #8 | ElevenLabs SFX API integration. Prompt → audio URL. Cache locally. |
| 11 | **`refine_search` tool** | M | #6, #7 | Rocchio refinement with liked/disliked samples + adjustment text |
| 12 | **`save_sample` tool** | S | #4, #8 | Download generated audio, write sidecar JSON, upsert into LanceDB index |
| 13 | **Selection logging** | S | #8 | Append (query, results, selected) to `selection_log.jsonl` on every selection |
| 14 | **User preferences + re-ranking** | M | #13 | User taste profile (JSON), selection count boost, recency boost, affinity scoring |
| 15 | **Alias support** | S | #12, #14 | User-scoped sample naming. Aliases searchable in both lexical and semantic paths. |
| 16 | **CLAP audio embeddings** | L | #4 | Post-POC. Add audio_vector column to LanceDB. 3-signal hybrid search. "More like this [audio]" |

**Critical path:** 1 → 2 → 3 → 4 → 5+6 → 7 → 8 → 9+10 (parallel) → 11 → 12 → 13

**Milestone 1 (core search):** Steps 1-9. User can chat with agent and find samples.
**Milestone 2 (generation):** Step 10. User can generate sounds when library fails.
**Milestone 3 (learning loop):** Steps 11-15. System gets smarter with use.
**Milestone 4 (audio intelligence):** Step 16. Audio-based similarity search.

---

## 11. Cost Model

### Per-Session Estimates

| Component | Cost |
|-----------|------|
| Claude Sonnet (~5 turns, ~2K tokens/turn) | ~$0.03 |
| MiniLM embeddings (local) | $0.00 |
| LanceDB queries (local) | $0.00 |
| ElevenLabs SFX (1 generation, if triggered) | ~$0.10-0.25 |
| **Average session (50% trigger generation)** | **~$0.08-0.15** |

### Monthly Estimates

| Usage Level | Sessions/mo | LLM Cost | ElevenLabs Plan | Total |
|-------------|-------------|----------|----------------|-------|
| **Solo dev testing** | ~50 | $1.50 | Creator ($11) | **~$13** |
| **Small team (3-5)** | ~200 | $6 | Pro ($99) | **~$105** |
| **Active beta (10-20 users)** | ~1,000 | $30 | Pro ($99) | **~$130** |
| **Growth (50+ users)** | ~5,000 | $150 | Scale ($330) | **~$480** |

The ElevenLabs plan dominates cost at low volume. At scale, LLM costs grow linearly while ElevenLabs is capped by plan tier. The Creator plan ($11/mo, ~100K credits) is sufficient for early POC.

---

## 12. References

Detailed research in companion documents:

- **[01 — Audio Generation APIs](./01-audio-generation-apis.md)**: ElevenLabs SFX, Stable Audio, Suno, Udio, MusicGen, pricing, comparison matrices, prompting best practices
- **[02 — Embeddings & Retrieval](./02-embeddings-retrieval.md)**: CLAP, OpenL3, PANNs, text embedding models, LanceDB/ChromaDB/Qdrant comparison, hybrid search with RRF, indexing and query pipeline architecture
- **[03 — Agent Architecture](./03-agent-architecture.md)**: Vercel AI SDK, tool definitions, system prompt design, context engineering, agent loop implementation, self-improvement loop, session design
- **[04 — Music Production UX](./04-music-production-ux.md)**: DAW sample browsers, AI tools landscape (Splice, COSMOS, Sononym), discovery patterns, beginner/expert mental models, collaborative jamming, iterative refinement
- **[05 — Personalization & Learning](./05-personalization-learning.md)**: User preference learning, dynamic metadata evolution, embedding adaptation techniques, reinforcement from selection, personal knowledge graphs, multi-user privacy
- **[06a — Tech Stack Synthesis](./06a-tech-stack-synthesis.md)**: Conflict resolution between research docs, unified stack, architecture diagram, cost estimates
- **[06b — UX & Personalization Synthesis](./06b-ux-personalization-synthesis.md)**: Ranked interaction patterns, beginner/expert paths, personalization roadmap, full session walkthrough
