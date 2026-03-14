# Tech Stack Synthesis

> Unified technology recommendations for the Composed POC, synthesized from research docs 01 (Audio Generation APIs), 02 (Embeddings & Retrieval), and 03 (Agent Architecture).
> Last updated: 2026-03-14

---

## 1. Conflicts & Tensions

The three research documents were written independently and propose incompatible choices in several areas. Here is each conflict and its resolution.

### Vector / Search Storage: LanceDB vs. SQLite vs. sqlite-vec

- **Doc 02** recommends **LanceDB** for vector storage, with built-in BM25 hybrid search and multi-vector column support.
- **Doc 03** recommends **SQLite FTS5 + sqlite-vec** for everything -- lexical search, vector search, user preferences, metadata -- in a single SQLite database.

**Resolution: LanceDB for vector + hybrid search. SQLite for metadata, preferences, and event logging.**

Rationale: Doc 03's "SQLite for everything" philosophy is appealing for simplicity, but sqlite-vec is immature compared to LanceDB and lacks built-in hybrid search. LanceDB is equally zero-config (`pip install lancedb`) and natively supports the three-signal hybrid retrieval pipeline that Doc 02 designs in detail. Meanwhile, SQLite remains the right choice for structured relational data (user preferences, interaction events, session state) where you need joins and transactions, not vector search. Two embedded databases is not meaningfully more complex than one -- both are local files with no background processes.

### Text Embedding Model: MiniLM (local) vs. OpenAI text-embedding-3-small (API)

- **Doc 02** recommends **all-MiniLM-L6-v2** (local, 384-d, free) for the POC, calling OpenAI embeddings "overkill."
- **Doc 03** recommends **text-embedding-3-small** (API, 1536-d) or Voyage for text embeddings in the semantic search tool.

**Resolution: all-MiniLM-L6-v2 for the POC.**

Rationale: The project philosophy is local-first. MiniLM runs in 5ms on CPU, costs nothing, and works offline. The metadata strings are short and structured (30-60 tokens) -- the quality gap between MiniLM and OpenAI's model is negligible for this input. Switching to OpenAI embeddings later is a one-line change if needed. Do not add an API dependency for marginal gain.

### Audio Embeddings: CLAP (full audio embedding pipeline) vs. Text-only embeddings

- **Doc 02** designs a full pipeline with **LAION-CLAP audio embeddings** (embed the actual .wav files) as the primary retrieval signal.
- **Doc 03** says to embed only **text descriptions** of samples, deferring audio embeddings (CLAP) to a future enhancement.

**Resolution: Start with text-only embeddings for semantic search. Add CLAP audio embeddings as the first post-POC upgrade.**

Rationale: Doc 03 is right that text-based semantic search over rich metadata is sufficient for a POC and dramatically simpler -- no 2.5GB model download, no audio processing pipeline, no 60ms-per-clip indexing. The metadata in Composed is already descriptive enough (title, freeTextDescription, tags, attributes). However, Doc 02's CLAP pipeline is the clear next step for "find something that sounds like this" queries and should be the first enhancement after the core agent works. The architecture should leave room for a second vector column in LanceDB.

### Agent Framework: Vercel AI SDK vs. Raw Claude Tool Use

- **Doc 03** recommends **Vercel AI SDK v6** as the primary framework, with raw Claude tool use as a fallback.

**Resolution: Vercel AI SDK v6.**

No conflict here -- Doc 03's recommendation stands. It provides streaming, clean Zod-based tool schemas, and a built-in agent loop. The app is TypeScript/Next.js, making this the natural fit.

### LLM Model: Claude Sonnet vs. other options

- **Doc 03** recommends **Claude Sonnet** for the agent (best tool use, fast, cost-effective).

**Resolution: Claude Sonnet (claude-sonnet-4-20250514).**

No conflict. Sonnet is the right balance of capability, speed, and cost for a tool-calling agent in a real-time music app. Opus would be slower and more expensive with no benefit for this use case.

### Sound Generation: ElevenLabs primary vs. multi-provider routing

- **Doc 01** recommends starting with ElevenLabs SFX as the primary, adding Stable Audio 2.5 as a secondary for longer musical content.
- **Doc 03** only mentions ElevenLabs SFX.

**Resolution: ElevenLabs SFX v2 only for the POC. Add Stable Audio via fal.ai post-POC.**

Rationale: One API integration is enough for the POC. ElevenLabs covers the core use case (one-shots, loops, textures) at 2-5s latency. Stable Audio's strength is longer musical phrases (up to 3 min), which is a Tier 2 feature. The prompt router described in Doc 01 is good architecture but premature for a POC.

---

## 2. Unified Tech Stack

| Component | Choice | Details |
|-----------|--------|---------|
| **LLM** | Claude Sonnet (`claude-sonnet-4-20250514`) | Anthropic API. Best tool use among frontier models. ~$0.03/session. |
| **Agent framework** | Vercel AI SDK v6 | `generateText` with tool loop. TypeScript. Streaming to frontend. |
| **Audio generation** | ElevenLabs Sound Effects API v2 | 48kHz WAV, up to 30s, loop mode. Pro plan ($99/mo). |
| **Audio embedding model** | None for POC. LAION-CLAP `larger_clap_music` post-POC. | 512-d shared text-audio space. Deferred to avoid 2.5GB dependency. |
| **Text embedding model** | `all-MiniLM-L6-v2` (sentence-transformers) | 384-d, 80MB, local, ~5ms/query. Free. |
| **Vector + hybrid search** | LanceDB (embedded) | Multi-vector columns, built-in BM25 FTS, zero config. |
| **Hybrid search strategy** | RRF over 2 signals (text vector + BM25), expanding to 3 when CLAP is added | Reciprocal Rank Fusion with k=60. No tuning needed. |
| **Metadata / preferences DB** | SQLite (single file) | FTS5 for lexical search backup. User prefs, events, session data. |
| **Frontend** | Next.js + Tailwind CSS | Chat UI with inline audio preview. Streaming responses. |
| **Audio storage** | Local filesystem | Samples stored on disk. Cache generated audio locally. |

---

## 3. Architecture Diagram

```
                         ┌──────────────────────┐
                         │    Next.js Frontend   │
                         │  Chat UI + Audio      │
                         │  Player + Waveforms   │
                         └──────────┬────────────┘
                                    │ streaming text + audio URLs
                                    │
                         ┌──────────▼────────────┐
                         │   API Route /api/chat  │
                         │   (Vercel AI SDK v6)   │
                         └──────────┬────────────┘
                                    │
                         ┌──────────▼────────────┐
                         │     Agent Loop         │
                         │  Claude Sonnet +       │
                         │  Tool Definitions      │
                         └──────────┬────────────┘
                                    │
              ┌─────────────────────┼─────────────────────┐
              │                     │                     │
   ┌──────────▼──────────┐  ┌──────▼───────┐  ┌─────────▼─────────┐
   │  search_samples      │  │ generate_    │  │  save_sample /    │
   │  _lexical            │  │ sound        │  │  get_user_prefs   │
   │  _semantic           │  │              │  │                   │
   └──────┬───────┬───────┘  └──────┬───────┘  └────────┬──────────┘
          │       │                 │                    │
          │       │                 │                    │
   ┌──────▼───┐ ┌─▼──────────┐  ┌──▼──────────┐  ┌─────▼──────┐
   │ LanceDB  │ │ LanceDB    │  │ ElevenLabs  │  │  SQLite    │
   │ BM25 FTS │ │ Vector     │  │ SFX API v2  │  │  (prefs,   │
   │ Index    │ │ Search     │  │             │  │  events,   │
   │          │ │ (text_vec) │  │             │  │  metadata) │
   └──────────┘ └────────────┘  └─────────────┘  └────────────┘
          │            │               │                 │
          └────────┬───┘               │                 │
                   │                   │                 │
            ┌──────▼──────┐     ┌──────▼──────┐   ┌─────▼──────┐
            │   RRF       │     │  Audio      │   │  User      │
            │   Merge     │     │  Cache      │   │  Feedback  │
            │   + Rank    │     │  (local fs) │   │  Loop      │
            └─────────────┘     └─────────────┘   └────────────┘

User query flow:
  "dusty lo-fi snare"
    -> Agent decides: call search_samples_semantic
    -> MiniLM embeds query (5ms)
    -> LanceDB vector search on text_vector column (5ms)
    -> LanceDB FTS search on full_text column (5ms)
    -> RRF merges ranked lists (1ms)
    -> Agent presents top 5 results with descriptions
    -> User: "none of those, make me one"
    -> Agent calls generate_sound
    -> ElevenLabs generates audio (2-5s)
    -> Agent returns audio URL for preview
    -> User: "save it"
    -> Agent calls save_sample -> SQLite + LanceDB + local fs
```

---

## 4. What to Skip

| Technology | Researched In | Why Skip for POC |
|-----------|---------------|------------------|
| **Stable Audio 2.5** | Doc 01 | One audio gen API is enough. Add when users need musical phrases > 30s. |
| **Suno / Udio** | Doc 01 | Full-song generators, not sample/loop tools. Wrong paradigm for jamming. |
| **MusicGen / AudioCraft** | Doc 01 | Requires GPU. 36s latency. Non-commercial license on weights. |
| **Bark** | Doc 01 | Speech model, not music. Quality too low for production samples. |
| **Riffusion** | Doc 01 | No API. Mobile-only. Superseded by dedicated audio models. |
| **OpenAI TTS** | Doc 01 | Vocal count-ins are a nice-to-have, not core. Add post-POC. |
| **LAION-CLAP audio embeddings** | Doc 02 | 2.5GB model, 60ms/clip indexing. Text embeddings sufficient for POC. First post-POC upgrade. |
| **Microsoft CLAP** | Doc 02 | Smaller community, marginal improvement over LAION-CLAP. Benchmark only if LAION fails. |
| **OpenL3** | Doc 02 | Audio-only (no text encoder). Only useful for audio-to-audio similarity. |
| **PANNs / VGGish** | Doc 02 | Classification-oriented, not retrieval-oriented. No text encoder. |
| **OpenAI text-embedding-3-small** | Doc 02, 03 | API dependency for marginal quality gain on short metadata strings. Use MiniLM locally. |
| **ChromaDB** | Doc 02 | No built-in hybrid search. LanceDB is strictly better for this use case. |
| **Qdrant** | Doc 02 | Heavier than needed. Embedded mode is newer and less documented. |
| **pgvector / PostgreSQL** | Doc 02 | Requires a running server. Overkill for local-first POC. |
| **Pinecone / Weaviate** | Doc 02 | Cloud-only or Docker-dependent. Not local-first. |
| **LangChain / LangGraph** | Doc 03 | Over-engineered for a single-agent, 6-tool system. |
| **OpenAI Agents SDK** | Doc 03 | Adds abstraction for provider-agnosticism we don't need. Building on Claude. |
| **Anthropic Agent SDK** | Doc 03 | Heavier dependency than Vercel AI SDK for a Next.js app. |

---

## 5. Cost Estimate (~100 sessions/month)

| Service | Plan / Pricing | Monthly Cost | Notes |
|---------|---------------|-------------|-------|
| **Claude Sonnet** | API pay-as-you-go | ~$3 | ~$0.03/session x 100 sessions |
| **ElevenLabs SFX** | Pro plan | $99 | ~12,500s of generated audio. Shared across all sessions. Most sessions won't generate. |
| **MiniLM embeddings** | Free (local) | $0 | Runs on CPU, no API calls |
| **LanceDB** | Free (open source) | $0 | Embedded, local files |
| **SQLite** | Free | $0 | Built into every runtime |
| **Vercel hosting** | Pro plan (if deployed) | $20 | Or $0 if running locally during POC |
| **Total** | | **~$102-122/mo** | Dominated by ElevenLabs Pro plan |

The ElevenLabs Pro plan is the single largest cost. If generation volume is low during early POC, the Creator plan ($11/mo, 100K credits) may suffice, bringing the total to ~$14-34/mo. Upgrade to Pro when users are actively generating.

**Cost per session breakdown:**
- LLM (Claude Sonnet, ~5 turns): $0.03
- Embeddings: $0.00
- Sound generation (if triggered): ~$0.10-0.25
- Average session (50% generate): ~$0.08-0.15

---

## 6. Open Questions

### Must Decide Before Building

1. **Where does the POC run?** Local dev server (Next.js dev mode) or deployed to Vercel? This affects whether SQLite is viable in production (Vercel serverless functions have ephemeral filesystems). If deployed, consider Turso (hosted SQLite) or move metadata to Vercel KV/Postgres.

2. **Sample library source for POC.** We need 500-1000 samples with rich metadata to test retrieval. Options: (a) Freesound.org API with CC-licensed samples, (b) hand-curate a small library from royalty-free packs, (c) generate a synthetic library using ElevenLabs + LLM-generated metadata. Decision affects both legal and quality dimensions.

3. **Audio playback in the chat UI.** How do we handle audio preview? Inline `<audio>` elements are simple but limited. A proper waveform player (WaveSurfer.js) is better UX but more work. This is a UX question but has tech implications.

### Can Defer

4. **CLAP integration timeline.** When do we add audio embeddings? After the text-based pipeline is validated, but before user testing? Or only after user feedback shows text search is insufficient?

5. **Multi-device sync.** The local-first architecture (LanceDB files, SQLite, local audio) does not sync across devices. If this becomes a requirement, we need to evaluate Turso (replicated SQLite), LanceDB Cloud, or a cloud-first pivot.

6. **Streaming audio generation.** ElevenLabs returns the full audio file after generation. For longer clips (15-30s), users may wait 5+ seconds. Should we stream chunks as they generate, or is a loading spinner sufficient for the POC?

7. **Rate limiting and credit management.** The ElevenLabs Pro plan has finite credits. Should the agent be credit-aware (refuse to generate if credits are low) or just let it fail?

---

## Summary

The POC tech stack is deliberately minimal: **Claude Sonnet + Vercel AI SDK + LanceDB + MiniLM + ElevenLabs + SQLite**. Six technologies, no infrastructure, everything runs locally. The agent is a simple tool-calling loop with 3 core tools (lexical search, semantic search, sound generation). Hybrid retrieval uses RRF over text vectors and BM25. Audio embeddings (CLAP) are the planned first upgrade after the core pipeline works.

Total cost: ~$15-120/month depending on ElevenLabs plan tier. Per-session cost: ~$0.08-0.15.
