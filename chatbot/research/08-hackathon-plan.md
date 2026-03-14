# Hackathon Plan — 2 Days

> Scope: Search + Generate + Preview. OpenAI (GPT-4o). Demo-ready in 48 hours.

---

## Stack (Updated for OpenAI)

| Component | Technology |
|-----------|-----------|
| LLM | GPT-4o via OpenAI API |
| Agent framework | Vercel AI SDK v6 + `@ai-sdk/openai` |
| Audio generation | ElevenLabs Sound Effects API v2 |
| Text embeddings | `all-MiniLM-L6-v2` via `@xenova/transformers` (in-process JS) or Python sidecar |
| Vector + hybrid search | LanceDB (embedded) |
| Metadata DB | SQLite |
| Frontend | Next.js + Tailwind |
| Audio preview | Inline `<audio>` elements |

---

## Day 1: Search Works

### Morning (4h): Scaffold + Sample Library

**Hour 1-2: Project scaffold**
- `npx create-next-app` + Tailwind + Vercel AI SDK
- Wire `/api/chat` route with OpenAI provider
- System prompt v1 (identity, vibe table, taxonomy)
- Basic chat UI (input + messages)

**Hour 2-4: Sample library**
- Download samples via Freesound API (script)
  - Target: 300-500 samples across percussion, bass, melody, texture, transition
  - Auto-generate metadata sidecars via GPT-4o (batch: filename + audio description → structured JSON)
- Organize into `samples/{roleGroup}/{role}/` filesystem structure
- Write `build-catalog.ts` to collect all sidecars into a JSONL catalog

### Afternoon (4h): Search Pipeline

**Hour 5-6: Indexing**
- `build-index.ts`: read catalog → MiniLM embeddings → LanceDB table with BM25 FTS
- Verify: query LanceDB from CLI, results make sense

**Hour 7-8: Agent tools + UI**
- `search_samples_lexical` tool (LanceDB BM25 + role/format filters)
- `search_samples_semantic` tool (MiniLM + LanceDB vector search + filters)
- RRF merge
- Wire into agent loop
- Add `<audio>` preview in chat messages
- **End of Day 1 milestone:** "Give me a dark kick" → agent returns samples you can play

---

## Day 2: Generate + Polish + Demo

### Morning (4h): Generation + Refinement

**Hour 1-2: Sound generation**
- `generate_sound` tool (ElevenLabs SFX API)
- Agent detects weak results and offers to generate
- Cache generated audio locally
- Preview generated sounds in chat

**Hour 3-4: Refinement + Save**
- `refine_search` tool (Rocchio-lite: re-query with liked/disliked context)
- `save_sample` tool (persist generated audio + metadata to library + re-index)
- Numbered references ("#3") for easy selection

### Afternoon (4h): Polish + Demo Prep

**Hour 5-6: UI polish**
- Mood grid for beginners (6 buttons: Dark, Bright, Chill, Hype, Smooth, Gritty)
- Role-based result grouping in responses
- Loading states for generation (2-5s wait)
- Error handling (graceful failures)

**Hour 7-8: Demo prep**
- End-to-end test: search → refine → generate → save → re-find
- Prepare demo script (the 5-minute session walkthrough)
- Edge cases: empty results, weird queries, long conversations
- **End of Day 2 milestone:** Demo-ready product

---

## Sample Download Strategy

### Freesound.org API

Freesound has a REST API with search, filtering, and direct download:
- **API key:** Free, register at freesound.org/apiv2/apply
- **Search:** `GET /apiv2/search/text/?query=kick&filter=duration:[0 TO 2]&fields=id,name,tags,description,previews`
- **Download:** `GET /apiv2/sounds/{id}/download/` (requires OAuth or API key)
- **Metadata:** Returns tags, description, duration, samplerate, channels, license
- **Rate limit:** 60 requests/minute on free tier
- **Licensing:** Filter for CC0 (public domain) to avoid attribution issues

### Download Script Plan

```
download-samples.ts (or .py)
├── Define target queries per role:
│   ├── percussion: ["kick drum", "snare hit", "hi-hat closed", "hi-hat open", ...]
│   ├── bass: ["bass synth", "808 bass", "sub bass", ...]
│   ├── melody: ["piano chord", "synth lead", "guitar riff", ...]
│   ├── texture: ["ambient texture", "vinyl crackle", "rain", ...]
│   └── transition: ["riser", "impact hit", "reverse cymbal", ...]
├── For each query:
│   ├── Search Freesound API (page through results)
│   ├── Filter: CC0 license, duration < 10s for one-shots / < 30s for loops
│   ├── Download top N results per query
│   ├── Save to samples/{roleGroup}/{role}/{filename}.wav
│   └── Write metadata sidecar: {role, roleGroup, format, tags, description, ...}
├── Supplement gaps with ElevenLabs SFX generation
│   ├── Generate samples for underrepresented categories
│   └── Use GPT-4o to write generation prompts from category descriptions
└── Output: catalog.jsonl with all sample metadata
```

### Metadata Enrichment via GPT-4o

Freesound metadata is inconsistent. After download, run a batch enrichment:
```
For each sample:
  Input: filename, freesound tags, freesound description, duration, role category
  GPT-4o prompt: "Given this audio sample metadata, produce structured JSON with:
    role, roleGroup, format (one-shot/loop), tone[], envelope[], texture[], space[],
    sourceFeel[], freeTextDescription (2 sentences, vivid and searchable)"
  Output: enriched sidecar JSON
```

This costs ~$0.50-1.00 for 500 samples (GPT-4o mini, ~200 tokens per sample).

---

## What's CUT for Hackathon

- ❌ Personalization / taste profiles / user preferences
- ❌ CLAP audio embeddings
- ❌ Collaborative multi-user features
- ❌ Session mood tracking
- ❌ Vocabulary teaching
- ❌ BPM/key sync preview
- ❌ Waveform visualization
- ❌ Multi-device sync
- ❌ Conversation compression (sessions won't be long enough)

---

## Risk Mitigation

| Risk | Mitigation |
|------|-----------|
| Freesound API rate limits | Download samples in advance (tonight/early), not during demo |
| Sample quality inconsistent | Hand-review top picks, have 50 "golden" samples ready |
| ElevenLabs latency > 5s | Show loading animation, have pre-generated fallbacks |
| LanceDB/MiniLM setup issues | Fallback: pure BM25 text search (no embeddings) still works |
| OpenAI function calling flaky | Vercel AI SDK handles retries; system prompt includes examples |
