# Phase 2 Upgrades

The MVP is intentionally metadata-first, but the schema already leaves room for multimodal retrieval and sound generation.

## Gemini Embeddings 2

Recommended rollout:

1. Embed `title`, `freeTextDescription`, `tags`, and normalized attribute text first.
2. Store vectors in a local index keyed by stable sample `id`.
3. Add audio embeddings later so text-to-audio and audio-to-audio retrieval share the same sample identity.

Why the current schema supports this:

- `id` is stable and catalog-friendly.
- `category`, `tags`, and `attributes` are normalized enough for clean embedding text.
- `sourceType` and `sourceRef` let generated and edited files coexist in one corpus.

Suggested future fields:

- `embeddingRefs.text`
- `embeddingRefs.audio`
- `analysis.durationMs`
- `analysis.sampleRate`
- `analysis.loudnessDb`

## ElevenLabs Generation

Recommended rollout:

1. Run local retrieval first.
2. Only offer generation when local confidence is low or the user asks explicitly.
3. Save outputs under `samples/generated/`.
4. Create the same JSON sidecar shape as local samples.
5. Keep the MVP `catalog.jsonl` local-only unless you intentionally build a broader mixed-source catalog.

Suggested generated provenance:

- `sourceType: "generated"`
- `sourceRef.vendor: "elevenlabs"`
- `sourceRef.model`
- `sourceRef.prompt`
- `sourceRef.requestId`

## ElevenLabs Inpainting Or Editing

Treat edits as derivative samples, not mutations of the original.

Suggested edited provenance:

- `sourceType: "edited"`
- `sourceRef.parentSampleId`
- `sourceRef.vendor: "elevenlabs"`
- `sourceRef.editInstruction`
- `sourceRef.requestId`

This keeps the library auditable and prevents generated history from overwriting curated originals.
