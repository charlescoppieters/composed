# Embeddings and Retrieval for Audio Sample Search

Research notes for upgrading the composed sample agent from keyword/token matching to semantic and multimodal retrieval.

---

## 1. Audio Embedding Models

These models produce fixed-size vectors from raw audio waveforms or spectrograms. The vector captures timbral, tonal, and temporal characteristics so that similar-sounding samples land near each other in embedding space.

### 1.1 CLAP (Contrastive Language-Audio Pretraining)

CLAP is the most directly relevant family for this project because it maps **both text and audio into a shared embedding space**. A single cosine-similarity search can answer "find me a dusty lo-fi snare" against raw audio files, even if no metadata exists.

#### LAION-CLAP (laion/larger_clap_music and laion/larger_clap_music_and_speech)

- **Origin**: LAION community, open-source, Apache-2.0.
- **Architecture**: HTSAT (audio encoder) + RoBERTa (text encoder), contrastively trained on AudioCaps, Clotho, FreeSound, and music datasets.
- **Embedding dimension**: 512.
- **Audio input**: Mono, 48 kHz preferred, 10-second chunks (longer audio is windowed and mean-pooled).
- **Model size**: ~630 M parameters total (~300 M audio encoder, ~330 M text encoder). Weights are ~2.5 GB on disk.
- **Inference speed**: ~40-80 ms per 10 s clip on an M1 MacBook Pro (CPU). ~8-15 ms on an A10 GPU.
- **Music variant**: `larger_clap_music` was fine-tuned with music-specific data and performs noticeably better on timbral/genre queries than the general audio variant.
- **Python package**: `pip install laion-clap`. Simple API: `model.get_audio_embedding_from_filelist()`, `model.get_text_embedding()`.
- **Strengths**: Best open-source option for text-to-audio retrieval. Actively maintained. Understands music-specific language ("reverby Rhodes", "808 sub bass").
- **Weaknesses**: 10-second window means very short one-shot samples (< 1 s) get zero-padded, which can dilute the embedding. Performance degrades on very fine-grained timbral distinctions between similar drum hits.

#### Microsoft CLAP (microsoft/msclap)

- **Origin**: Microsoft Research, MIT license.
- **Architecture**: HTSAT + GPT-2 text encoder. Two released checkpoints: `2022` (AudioSet-trained) and `2023` (AudioSet + music + speech).
- **Embedding dimension**: 1024 (2023 checkpoint), 512 (2022 checkpoint).
- **Audio input**: 44.1 kHz, variable length up to ~10 s.
- **Model size**: ~500 M parameters. Weights ~2 GB.
- **Inference speed**: Comparable to LAION-CLAP, slightly slower due to larger text encoder for the 2023 model.
- **Python package**: `pip install msclap`.
- **Strengths**: Higher-dimensional embeddings (1024) may capture finer distinctions. The 2023 checkpoint performs well on music classification benchmarks.
- **Weaknesses**: Smaller community, fewer examples in production systems. GPT-2 text encoder is heavier than RoBERTa for the marginal benefit.

#### Recommendation for composed

**LAION-CLAP `larger_clap_music`** is the best starting point. It is purpose-built for music, has the largest community, and its 512-d embeddings are compact enough for a local-first index. Microsoft CLAP 2023 is worth benchmarking if LAION struggles on edge cases.

### 1.2 OpenL3

- **Origin**: NYU MARL, Apache-2.0.
- **Architecture**: Audio sub-network of an L3-Net (audio-visual correspondence model), trained on AudioSet video+audio pairs.
- **Embedding dimension**: 512 or 6144 (configurable, controlled by `content_type` and `embedding_size` params).
- **Audio input**: 48 kHz, 1-second hop with configurable window.
- **Model size**: ~4.7 M parameters (very small).
- **Inference speed**: ~5-15 ms per 1 s window on CPU. Extremely fast.
- **Python package**: `pip install openl3`.
- **Strengths**: Tiny model, fast inference, good for audio-to-audio similarity. Works well on short samples because it was designed for 1-second windows.
- **Weaknesses**: **No text encoder.** Audio-only embeddings. Cannot do text-to-audio retrieval directly. Would require a separate text embedding model and a learned projection to bridge modalities.
- **Use case for composed**: Good for "find me more samples like this one" (audio-to-audio), but cannot replace CLAP for natural-language queries. Could be a secondary signal.

### 1.3 PANNs (Pretrained Audio Neural Networks)

- **Origin**: KONG Qiuqiang et al., MIT license.
- **Architecture**: CNN14 is the most commonly used variant. Trained on AudioSet for 527-class audio event classification.
- **Embedding dimension**: 2048 (from the penultimate layer of CNN14).
- **Audio input**: 32 kHz, arbitrary length (processes full spectrogram).
- **Model size**: CNN14 is ~80 M parameters (~320 MB on disk). Larger variants (Wavegram-Logmel-CNN) reach ~300 M.
- **Inference speed**: ~20-50 ms per clip on CPU for CNN14.
- **Python package**: `pip install panns-inference`.
- **Strengths**: Strong audio event understanding. Embeddings cluster well by sound category. Well-studied in the audio research community.
- **Weaknesses**: **No text encoder.** Embeddings are classification-oriented, not retrieval-oriented. A "bright snare" and a "dark snare" may land close together because both are "snare drum" events. Less sensitive to timbral subtlety than CLAP.
- **Use case for composed**: Useful as a category-level pre-filter (predict instrument/sound type), but not ideal as the primary retrieval embedding.

### 1.4 VGGish

- **Origin**: Google, Apache-2.0.
- **Architecture**: VGG-like CNN trained on a YouTube-8M-derived AudioSet. The oldest and most legacy option.
- **Embedding dimension**: 128 (after PCA/whitening) or 12288 (raw).
- **Audio input**: 16 kHz, 0.96-second frames.
- **Model size**: ~72 M parameters (~290 MB).
- **Inference speed**: ~10-20 ms per frame on CPU.
- **Python package**: `pip install tensorflow` + manual weight loading, or use `pip install vggish-keras`.
- **Strengths**: Extremely well-studied. Available everywhere.
- **Weaknesses**: Low-dimensional (128-d) embeddings lose timbral detail. 16 kHz sample rate discards high-frequency content relevant to percussion brightness, hat shimmer, etc. Requires TensorFlow. **No text encoder.** Effectively superseded by PANNs and CLAP.
- **Recommendation**: Skip VGGish. It is not competitive for music retrieval in 2025+.

### 1.5 Summary Table

| Model | Dim | Text+Audio? | Music-tuned? | Size | Speed (CPU) | License |
|---|---|---|---|---|---|---|
| LAION-CLAP music | 512 | Yes | Yes | 630 M | ~60 ms/clip | Apache-2.0 |
| Microsoft CLAP 2023 | 1024 | Yes | Partial | 500 M | ~70 ms/clip | MIT |
| OpenL3 | 512/6144 | No | No | 4.7 M | ~10 ms/1s | Apache-2.0 |
| PANNs CNN14 | 2048 | No | No | 80 M | ~35 ms/clip | MIT |
| VGGish | 128 | No | No | 72 M | ~15 ms/frame | Apache-2.0 |

**Winner for composed: LAION-CLAP `larger_clap_music`.** It is the only model that natively supports text-to-audio retrieval with music-specific training.

---

## 2. Multimodal Embeddings: Bridging Text and Audio

### 2.1 The Core Problem

The current retrieval system in `retrieval.py` uses token overlap between the user query and metadata fields. This works for exact terms ("bright", "snare") but fails for:

- Synonyms: "crispy" vs. "crisp", "thumpy" vs. "punchy"
- Vibes: "something that sounds like a rainy afternoon"
- Negation/comparison: "like this but less aggressive"
- Novel descriptions: "that Netflix intro thud"

Semantic embeddings solve this by mapping both the query and the candidate into a continuous space where **meaning proximity equals vector proximity**.

### 2.2 Shared-Space Models (Text + Audio in One Embedding Space)

CLAP models (Section 1.1) are the canonical approach. They train text and audio encoders jointly with a contrastive loss so that:

```
cosine_similarity(embed_text("punchy 808 kick"), embed_audio(kick_808.wav)) ≈ high
cosine_similarity(embed_text("punchy 808 kick"), embed_audio(bird_chirp.wav)) ≈ low
```

This means a single vector index can contain audio embeddings and be queried with text embeddings (or vice versa). No bridging layer is needed.

**How this works in practice for composed:**

1. At index time: compute `embed_audio(sample.wav)` for each sample. Store the 512-d vector alongside the sample ID.
2. At query time: compute `embed_text("dusty snare with short tail")`. Find the top-k nearest audio embeddings by cosine similarity.
3. Optionally: also compute `embed_text(sample.freeTextDescription + " " + sample.tags.join(" "))` at index time and store it as a second vector. This lets you do text-to-text semantic search on metadata as a complement.

### 2.3 Bridging Text-Only Embeddings to Audio

If you want to use a stronger text model (like OpenAI's embeddings) for the metadata side but CLAP for the audio side, you have a **mismatched embedding space** problem. The vectors are not comparable.

Options:

1. **Separate indices, late fusion.** Run two searches (text-to-text on metadata, text-to-audio via CLAP), then combine scores with Reciprocal Rank Fusion (Section 5). This is the simplest and most robust approach.
2. **Learned projection.** Train a small linear layer that maps CLAP text embeddings into OpenAI embedding space (or vice versa). Requires paired training data. Fragile and not worth it for a POC.
3. **LLM-generated descriptions as bridge.** Use an LLM to generate rich text descriptions of each audio sample (from metadata + optional audio analysis), embed those with OpenAI, and query against them. Avoids the projection problem entirely. Works well when metadata is rich.

**Recommendation for composed: Option 1 (separate indices, late fusion)** for the POC. The metadata is already rich enough (title, freeTextDescription, tags, attributes) that a good text embedding model on the metadata side plus CLAP on the audio side gives strong coverage.

### 2.4 OpenAI Embeddings for the Text Side

OpenAI's embedding models are relevant only for the **text-to-text** metadata search component, not for audio.

| Model | Dim | Max tokens | Cost (per 1M tokens) | Notes |
|---|---|---|---|---|
| text-embedding-3-small | 1536 | 8191 | $0.02 | Best cost/quality ratio. Supports Matryoshka dimensionality reduction (truncate to 512 or 256 with minor quality loss). |
| text-embedding-3-large | 3072 | 8191 | $0.13 | Marginal quality improvement over small for short texts like sample descriptions. Overkill for this use case. |
| text-embedding-ada-002 | 1536 | 8191 | $0.10 | Legacy. Strictly worse than text-embedding-3-small at 5x the cost. |

**For composed:** `text-embedding-3-small` at 512 truncated dimensions is the sweet spot. It matches CLAP's 512-d, simplifies the index, and costs almost nothing for a local library of a few thousand samples.

---

## 3. Text Embeddings for Metadata Search

When metadata is well-structured (as it is in composed's sidecar schema), embedding the text fields enables semantic search that catches what keyword matching misses.

### 3.1 What to Embed

Concatenate these fields into a single string per sample before embedding:

```
"{title}. {freeTextDescription}. Category: {category}. Tags: {tags.join(', ')}. Tone: {attributes.tone.join(', ')}. Envelope: {attributes.envelope.join(', ')}. Texture: {attributes.texture.join(', ')}. Space: {attributes.space.join(', ')}. Feel: {attributes.sourceFeel.join(', ')}. Notes: {userNotes.join('. ')}"
```

This gives the embedding model full context in a single pass. Average token count for a composed sample: ~30-60 tokens, well within any model's limits.

### 3.2 Model Comparison

| Model | Dim | Strengths | Weaknesses | Cost | Local? |
|---|---|---|---|---|---|
| OpenAI text-embedding-3-small | 1536 (truncatable) | Excellent quality, Matryoshka support, cheap | Requires API call, no offline mode | $0.02/1M tok | No |
| OpenAI text-embedding-3-large | 3072 (truncatable) | Slightly better on nuanced text | Overkill for short descriptions | $0.13/1M tok | No |
| Cohere embed-v3.0 | 1024 | Strong multilingual, built-in search/classification task modes | Requires API call | $0.10/1M tok | No |
| Voyage AI voyage-3 | 1024 | Strong on code and technical text | Less music/audio domain coverage | $0.06/1M tok | No |
| sentence-transformers/all-MiniLM-L6-v2 | 384 | Fully local, fast (~5 ms/query on CPU), 80 MB model | Lower quality than API models on nuanced queries | Free | Yes |
| BAAI/bge-small-en-v1.5 | 384 | Fully local, strong quality for size, 130 MB | Slightly slower than MiniLM | Free | Yes |
| nomic-ai/nomic-embed-text-v1.5 | 768 | Local, Matryoshka support, strong benchmarks | 550 MB, heavier | Free | Yes |

### 3.3 Local-First Considerations

The composed project philosophy is local-first. For the text embedding layer:

- **If offline operation matters**: Use `all-MiniLM-L6-v2` (384-d, 80 MB) or `bge-small-en-v1.5` (384-d, 130 MB). Both run on CPU in single-digit milliseconds. Quality is good enough for structured metadata where the vocabulary is constrained (your taxonomy is small and specific).
- **If quality matters more and network is available**: Use `text-embedding-3-small` at 512 truncated dimensions. A library of 10,000 samples costs ~$0.01 to embed in full.
- **Hybrid approach**: Embed locally with MiniLM for instant offline search. Re-embed with OpenAI when online for higher quality. Store both vectors.

### 3.4 Embedding Refresh Strategy

Because composed supports `userNotes` and `tags` updates via the feedback command, embeddings must be refreshable:

1. Store a hash of the concatenated text alongside the embedding.
2. On `build-catalog`, check if the hash changed. Re-embed only changed entries.
3. For a library of 5,000 samples, full re-embedding takes ~2 s locally (MiniLM) or ~3 s via OpenAI API.

---

## 4. Vector Databases

### 4.1 Requirements for composed

- **Library size**: 100 to 50,000 samples (not millions).
- **Latency**: < 50 ms query time.
- **Local-first**: Must work offline. Cloud is acceptable as an optional enhancement.
- **Simplicity**: Minimal infrastructure. No Docker containers or background services for the POC.
- **Multi-vector**: Ideally supports storing both audio and text embeddings per sample.
- **Metadata filtering**: Filter by category, tags, sourceType before vector search.

### 4.2 Comparison

#### ChromaDB

- **Type**: Embedded (in-process), SQLite-backed.
- **Install**: `pip install chromadb`. Zero config.
- **Max scale**: ~1 M vectors comfortably. Fine for composed.
- **Query speed**: < 10 ms for 50 K vectors on CPU.
- **Filtering**: Supports metadata filters (`where={"category": "snare"}`).
- **Persistence**: Writes to a local directory. Survives restarts.
- **Multi-vector**: One collection per embedding type (e.g., `audio_embeddings`, `text_embeddings`).
- **Dim support**: Any dimension.
- **Pros**: Simplest possible setup. Python-native. Good docs.
- **Cons**: No built-in hybrid (BM25 + vector) search. In-process means no shared access across multiple apps. Not battle-tested at scale.

#### LanceDB

- **Type**: Embedded (in-process), Lance columnar format.
- **Install**: `pip install lancedb`. Zero config.
- **Max scale**: Millions of vectors. Efficient disk-based index.
- **Query speed**: < 5 ms for 50 K vectors. Excellent for local.
- **Filtering**: SQL-like filters on any column.
- **Persistence**: Local directory, Lance files.
- **Multi-vector**: Store multiple vector columns in the same table natively.
- **Hybrid search**: Built-in BM25 full-text index + vector search with reranking. This is a major advantage.
- **Dim support**: Any dimension.
- **Pros**: Fastest embedded option. Native hybrid search. Multi-vector columns. Apache Arrow integration means easy DataFrame interop.
- **Cons**: Younger project. Smaller community than Chroma. API is still evolving.

#### pgvector (PostgreSQL extension)

- **Type**: Client-server (requires a running PostgreSQL instance).
- **Install**: Requires PostgreSQL + `CREATE EXTENSION vector`.
- **Max scale**: Millions with HNSW indexes.
- **Query speed**: < 20 ms for 50 K vectors with HNSW.
- **Filtering**: Full SQL. Extremely flexible.
- **Persistence**: PostgreSQL data directory.
- **Multi-vector**: Store multiple vector columns per row naturally.
- **Hybrid search**: Combine `tsvector` full-text search with vector similarity in one query.
- **Pros**: Production-grade. SQL is familiar. Can colocate vectors with all other app data.
- **Cons**: Requires running PostgreSQL. Overkill for a local-first POC. Not embedded.

#### Qdrant

- **Type**: Client-server (Rust binary or Docker). Also has an embedded mode via `qdrant-client` with local storage.
- **Install**: `pip install qdrant-client` for embedded mode.
- **Max scale**: Millions. Very efficient HNSW.
- **Query speed**: < 5 ms for 50 K vectors.
- **Filtering**: Rich payload filtering with nested conditions.
- **Persistence**: Local directory in embedded mode.
- **Multi-vector**: Named vectors per point (e.g., `"audio"` and `"text"` vectors on the same point). First-class support.
- **Hybrid search**: Sparse vectors (BM25-like) + dense vectors in same query. Built-in fusion.
- **Pros**: Best multi-vector and hybrid search support of any embedded option. Fast. Well-documented.
- **Cons**: Embedded mode is newer and less documented than server mode. Rust binary is heavier than pure-Python options.

#### Pinecone

- **Type**: Cloud-only managed service.
- **Free tier**: 1 index, 100 K vectors, 1536 dimensions.
- **Query speed**: ~30-80 ms (network round-trip dependent).
- **Filtering**: Metadata filters on stored attributes.
- **Multi-vector**: Separate namespaces or indexes.
- **Hybrid search**: Sparse-dense hybrid via sparse_values parameter.
- **Pros**: Zero ops. Scales effortlessly.
- **Cons**: Cloud-only. Latency includes network. Not local-first. Vendor lock-in. Free tier has limits.

#### Weaviate

- **Type**: Client-server (Go binary or Docker). Embedded mode exists but is experimental.
- **Install**: Docker or `pip install weaviate-client` (client only; server must run separately).
- **Pros**: Built-in vectorizer modules, GraphQL API, hybrid search.
- **Cons**: Heavy infrastructure. Docker dependency. Not suitable for a local-first embedded POC.

### 4.3 Summary Matrix

| DB | Embedded? | Hybrid Search? | Multi-vector? | Setup Effort | Best For |
|---|---|---|---|---|---|
| **LanceDB** | Yes | Yes (native BM25+vector) | Yes (multi-column) | Minimal | Local-first POC with hybrid search |
| **ChromaDB** | Yes | No (vector only) | Via collections | Minimal | Simplest possible vector search |
| **Qdrant** | Yes (embedded mode) | Yes (sparse+dense) | Yes (named vectors) | Low | Production-grade local with advanced features |
| pgvector | No (needs PG) | Yes (tsvector+vector) | Yes (multi-column) | Medium | Teams already using PostgreSQL |
| Pinecone | No (cloud) | Yes | Via namespaces | Low (but cloud) | Cloud-first teams |
| Weaviate | Experimental | Yes | Yes | High (Docker) | Enterprise deployments |

**Winner for composed: LanceDB.** It is embedded, has native hybrid search, supports multiple vector columns per table, and is the fastest local option. ChromaDB is a fine fallback if you want maximum community support and do not need hybrid search.

---

## 5. Hybrid Search: Combining Lexical and Semantic Retrieval

### 5.1 Why Hybrid?

Neither keyword search nor vector search alone is sufficient:

| Query type | Keyword wins | Vector wins |
|---|---|---|
| "snare" | Exact category match | Finds "rimshot" and "cross-stick" too |
| "something dark and industrial" | Misses if metadata says "gritty, aggressive" | Captures semantic similarity |
| "sample-id: snare-001" | Exact match | Might return similar-sounding samples instead |
| "NOT reverb" | Can handle exclusion | Vectors cannot negate well |

Hybrid search runs both and merges the results.

### 5.2 BM25 / Full-Text Search

BM25 is the standard lexical scoring algorithm. It accounts for term frequency, inverse document frequency, and document length normalization.

**For composed's metadata:**

- The existing `_tokenize()` + `_entry_tokens()` logic in `retrieval.py` is a simplified BM25-like scorer. It misses IDF weighting (rare terms should score higher).
- A proper BM25 implementation can be added via:
  - **LanceDB**: Built-in `FTS` (full-text search) index on text columns. No extra library needed.
  - **tantivy-py**: Rust-based full-text search engine with Python bindings. `pip install tantivy`. Fast, local, supports BM25.
  - **rank-bm25**: Pure Python BM25. `pip install rank_bm25`. Simple but slow for large corpora.
  - **SQLite FTS5**: If using ChromaDB (SQLite-backed), you can add FTS5 tables alongside it.

### 5.3 Reciprocal Rank Fusion (RRF)

RRF is the standard method for combining ranked lists from different retrieval systems.

```
RRF_score(doc) = sum over all systems S of: 1 / (k + rank_S(doc))
```

Where `k` is a constant (typically 60) that dampens the influence of high-ranking documents. Documents not returned by a system receive rank = infinity (contributing 0).

**Example:**

- BM25 returns: [snare-003 (rank 1), snare-007 (rank 2), kick-012 (rank 3)]
- Vector search returns: [snare-007 (rank 1), snare-003 (rank 2), hat-005 (rank 3)]
- RRF(snare-003) = 1/(60+1) + 1/(60+2) = 0.0164 + 0.0161 = 0.0325
- RRF(snare-007) = 1/(60+2) + 1/(60+1) = 0.0161 + 0.0164 = 0.0325
- RRF(kick-012) = 1/(60+3) + 0 = 0.0159
- RRF(hat-005) = 0 + 1/(60+3) = 0.0159

Both snare samples tie at the top, which is correct: they were highly ranked by both systems.

**Implementation for composed:**

```python
def reciprocal_rank_fusion(*ranked_lists, k=60):
    """Merge multiple ranked result lists using RRF."""
    scores = {}
    for ranked_list in ranked_lists:
        for rank, item in enumerate(ranked_list, start=1):
            item_id = item["id"]
            scores[item_id] = scores.get(item_id, 0) + 1.0 / (k + rank)
    # Sort by fused score descending
    merged = sorted(scores.items(), key=lambda x: -x[1])
    return [item_id for item_id, score in merged]
```

### 5.4 Blending File-System Search with Embedding Search

For a local sample library, there is a third search modality: **file-system grep**. File names and folder paths carry information ("drums/acoustic/snare_bright_01.wav").

Strategy:

1. **Path tokenization at index time**: Extract tokens from the file path and folder hierarchy. Include these in the BM25 corpus alongside metadata tokens.
2. **Fallback grep**: If the vector DB returns low-confidence results (all cosine similarities < 0.3), fall back to a file-system search using `pathlib.glob` patterns derived from the query.
3. **Zero-metadata samples**: For audio files that have no sidecar JSON yet, file-system grep is the only option. Compute audio embeddings for these files on first access and prompt the user to create a sidecar.

### 5.5 Weighting the Signals

For the composed POC, a three-signal hybrid:

| Signal | Weight | Source |
|---|---|---|
| Audio embedding similarity (CLAP) | 0.4 | Cosine similarity between query text embedding and sample audio embedding |
| Text embedding similarity (metadata) | 0.35 | Cosine similarity between query embedding and metadata embedding |
| Lexical score (BM25) | 0.25 | BM25 over tokenized metadata + path tokens |

These weights should be tunable. Start with RRF (which is weight-free) and move to weighted combination only if you have evaluation data.

---

## 6. Architecture for a Retrieval Pipeline

### 6.1 Indexing Pipeline

```
┌─────────────────────────────────────────────────────────────┐
│  build-catalog (existing)                                    │
│  samples/library/**/*.json  -->  catalog.jsonl               │
└─────────────────┬───────────────────────────────────────────┘
                  │
                  v
┌─────────────────────────────────────────────────────────────┐
│  build-index (new command)                                   │
│                                                              │
│  For each entry in catalog.jsonl:                            │
│    1. Load audio file from audioPath                         │
│    2. Compute CLAP audio embedding (512-d)                   │
│    3. Concatenate metadata text fields                       │
│    4. Compute text embedding (512-d, MiniLM or OpenAI)       │
│    5. Tokenize metadata + path for BM25 corpus               │
│    6. Upsert into LanceDB table:                             │
│       - id (string)                                          │
│       - audio_vector (float32[512])                          │
│       - text_vector (float32[512])                           │
│       - category (string, filterable)                        │
│       - tags (list[string])                                  │
│       - source_type (string, filterable)                     │
│       - metadata_hash (string, for change detection)         │
│       - full_text (string, for BM25 FTS index)               │
│    7. Build FTS index on full_text column                     │
│                                                              │
│  Output: samples/_index/vectors.lance/                       │
└─────────────────────────────────────────────────────────────┘
```

**Incremental updates**: Hash the concatenated metadata + audio file mtime. Only re-embed entries whose hash changed. Audio embedding is the bottleneck (~60 ms each), so skipping unchanged files matters for libraries > 1,000 samples.

**Batch embedding**: CLAP supports batched inference. Process 32 audio files at a time on CPU, 128+ on GPU. This brings indexing of 5,000 samples down to ~2-3 minutes on a MacBook.

### 6.2 Query Pipeline

```
User query: "dusty snare with short tail"
Optional: --reference-sample-id snare-001
Optional: --category snare (auto-extracted or explicit)

       ┌──────────────────────────────────┐
       │  1. Parse query                   │
       │     - Extract category hint       │
       │     - Extract negations           │
       │     - Detect reference sample     │
       └───────────┬──────────────────────┘
                   │
         ┌─────────┼──────────┐
         v         v          v
  ┌──────────┐ ┌────────┐ ┌──────────┐
  │ CLAP     │ │ Text   │ │ BM25     │
  │ text     │ │ embed  │ │ search   │
  │ embed    │ │ query  │ │ on query │
  │ query    │ │ string │ │ tokens   │
  └────┬─────┘ └───┬────┘ └────┬─────┘
       │           │            │
       v           v            v
  ┌──────────┐ ┌────────┐ ┌──────────┐
  │ Vector   │ │ Vector │ │ FTS      │
  │ search   │ │ search │ │ search   │
  │ audio_   │ │ text_  │ │ on       │
  │ vector   │ │ vector │ │ full_text│
  │ col      │ │ col    │ │ col      │
  └────┬─────┘ └───┬────┘ └────┬─────┘
       │           │            │
       └─────────┬─┘────────────┘
                 v
       ┌──────────────────────────────────┐
       │  2. Reciprocal Rank Fusion       │
       │     Merge 3 ranked lists         │
       └───────────┬──────────────────────┘
                   │
                   v
       ┌──────────────────────────────────┐
       │  3. Reference bias (optional)    │
       │     Boost samples sharing        │
       │     category/attributes with     │
       │     reference sample             │
       └───────────┬──────────────────────┘
                   │
                   v
       ┌──────────────────────────────────┐
       │  4. Metadata filter              │
       │     Apply category filter,       │
       │     exclude sourceType if needed  │
       └───────────┬──────────────────────┘
                   │
                   v
       ┌──────────────────────────────────┐
       │  5. Return top-k with scores     │
       │     and explanations             │
       └──────────────────────────────────┘
```

### 6.3 Reference-Biased Retrieval

When the user says "something like snare-001 but brighter", the pipeline should:

1. Look up `snare-001`'s audio embedding.
2. Find the top-50 nearest audio neighbors (audio-to-audio similarity via CLAP).
3. Re-rank those 50 against the text query "brighter" using CLAP text-to-audio similarity.
4. Exclude `snare-001` itself if comparison words ("but", "more", "less") are present.

This is more nuanced than the current `retrieval.py` approach, which only boosts category overlap. The embedding-based version captures timbral similarity that metadata cannot express.

### 6.4 Schema Extension

The `phase-2-upgrades.md` document already proposes `embeddingRefs.text` and `embeddingRefs.audio`. For the vector DB approach, embeddings should live in the index, not in the sidecar JSON. The sidecar should only track:

```json
{
  "embeddingRefs": {
    "textHash": "sha256 of the concatenated text that was embedded",
    "audioHash": "sha256 of the audio file that was embedded",
    "indexedAt": "2025-01-15T00:00:00Z"
  }
}
```

This lets the system detect stale embeddings without loading the vector DB.

---

## 7. Practical Recommendations for a POC

### 7.1 What to Use

| Component | Choice | Why |
|---|---|---|
| Audio embeddings | LAION-CLAP `larger_clap_music` | Only viable open-source text-to-audio model for music |
| Text embeddings | `all-MiniLM-L6-v2` (local) | 80 MB, fast, offline, good enough for structured metadata |
| Vector DB | LanceDB | Embedded, hybrid search, multi-vector, zero config |
| Hybrid search | RRF over 3 signals | Simple, robust, no tuning needed |
| BM25 | LanceDB built-in FTS | No extra dependency |

### 7.2 What Is Overkill for a POC

- **OpenAI embeddings**: Adds API dependency and cost for marginal quality gain on short structured text. Use them in production, not the POC.
- **Pinecone/Weaviate**: Cloud infrastructure for a local sample library is unnecessary. Move to cloud only if you add multi-device sync.
- **Microsoft CLAP 2023**: The 1024-d embeddings are nice but double storage for marginal retrieval improvement. Benchmark it only if LAION-CLAP fails on specific query types.
- **OpenL3 as a second audio embedding**: Adds complexity. CLAP covers both text-to-audio and audio-to-audio. OpenL3 only helps for audio-to-audio and its 1-second window is a better fit for short hits, but this is an optimization, not a necessity.
- **Fine-tuning any model**: You do not have enough labeled data yet. The feedback loop (userNotes, tags) is how you build that dataset over time. Fine-tune later.
- **GPU inference**: CLAP runs at ~60 ms per clip on a modern MacBook CPU. For a library under 50 K samples, CPU is fine. GPU only matters for batch re-indexing of very large libraries.

### 7.3 Implementation Order

1. **Add LanceDB to dependencies.** `pip install lancedb`. Confirm it works in your Python environment.

2. **Add LAION-CLAP.** `pip install laion-clap`. Download the `music_audioset_epoch_15_esc_90.14.pt` checkpoint (~2.5 GB). Verify it can embed a test audio file and a test text string.

3. **Add a local text embedder.** `pip install sentence-transformers`. Load `all-MiniLM-L6-v2`. Verify it embeds a test metadata string.

4. **Create a `build-index` CLI command** that:
   - Reads `catalog.jsonl`.
   - For each entry, computes audio + text embeddings.
   - Writes to a LanceDB table at `samples/_index/vectors.lance`.
   - Builds an FTS index on the concatenated text column.

5. **Create a `semantic-search` CLI command** that:
   - Accepts a natural-language query.
   - Computes CLAP text embedding and MiniLM text embedding.
   - Runs three searches (CLAP vector, MiniLM vector, FTS).
   - Merges with RRF.
   - Returns top-k results.

6. **Integrate with the existing `search` command** as an optional `--semantic` flag. Keep the current keyword search as the default so existing tests pass.

7. **Add the reference-bias pipeline** for "like this but different" queries.

8. **Add incremental re-indexing** using metadata + audio hashes.

### 7.4 Storage Budget

For a 10,000-sample library:

| Component | Size |
|---|---|
| CLAP model weights | ~2.5 GB (one-time download) |
| MiniLM model weights | ~80 MB (one-time download) |
| Audio embeddings (512-d, float32) | 10,000 x 512 x 4 = ~20 MB |
| Text embeddings (384-d, float32) | 10,000 x 384 x 4 = ~15 MB |
| LanceDB overhead + FTS index | ~10-20 MB |
| **Total index size** | **~35-55 MB** (excluding model weights) |

Model weights are downloaded once and cached. The index itself is tiny relative to the audio files it represents (a 10 K sample library is typically 5-50 GB of audio).

### 7.5 Latency Budget

For a single query on a MacBook (CPU, 10 K samples):

| Step | Time |
|---|---|
| CLAP text embedding | ~30 ms |
| MiniLM text embedding | ~5 ms |
| LanceDB vector search (2 queries) | ~10 ms |
| LanceDB FTS search | ~5 ms |
| RRF merge | ~1 ms |
| **Total** | **~50 ms** |

This is well under the 50 ms target and fast enough for real-time interactive search.

### 7.6 Evaluation Strategy

Before committing to the embedding pipeline, establish a small evaluation set:

1. Write 20-30 test queries covering different types (exact category, vibe description, comparison, negation).
2. For each query, manually label the 3-5 best samples from your library.
3. Run the current keyword system and the new semantic system against these queries.
4. Measure **recall@5** (how many of the labeled results appear in the top 5) and **MRR** (reciprocal rank of the first correct result).
5. The semantic system should improve recall@5 by at least 20% on vibe/synonym queries to justify the added complexity.

This evaluation set also becomes the regression test suite for future model upgrades.

---

## Appendix: Key Python Packages

```
# Audio embeddings
pip install laion-clap          # LAION-CLAP (includes model download utilities)
pip install msclap              # Microsoft CLAP (alternative)

# Text embeddings (local)
pip install sentence-transformers  # Wraps MiniLM, BGE, Nomic, etc.

# Text embeddings (API)
pip install openai              # text-embedding-3-small/large

# Vector database
pip install lancedb             # Embedded vector DB with hybrid search

# BM25 (if not using LanceDB FTS)
pip install rank-bm25           # Pure Python BM25
pip install tantivy             # Rust-based full-text search

# Audio utilities
pip install librosa             # Audio loading, resampling (CLAP dependency)
pip install soundfile           # Efficient audio I/O
```

## Appendix: CLAP Embedding Code Sketch

```python
import laion_clap

# Load model once at startup
model = laion_clap.CLAP_Module(enable_fusion=False, amodel='HTSAT-base')
model.load_ckpt('music_audioset_epoch_15_esc_90.14.pt')

# Embed audio files (batched)
audio_embeddings = model.get_audio_embedding_from_filelist(
    x=['samples/library/snare_01.wav', 'samples/library/kick_02.wav'],
    use_tensor=False  # returns numpy array
)
# Shape: (2, 512)

# Embed text queries
text_embeddings = model.get_text_embedding(
    ['dusty snare with short tail', 'deep sub kick']
)
# Shape: (2, 512)

# Cosine similarity for retrieval
import numpy as np
similarities = text_embeddings @ audio_embeddings.T  # (2, 2) matrix
# Higher = more similar
```

## Appendix: LanceDB Table Schema Sketch

```python
import lancedb
import pyarrow as pa

db = lancedb.connect("samples/_index/vectors.lance")

schema = pa.schema([
    pa.field("id", pa.string()),
    pa.field("audio_vector", pa.list_(pa.float32(), 512)),
    pa.field("text_vector", pa.list_(pa.float32(), 384)),
    pa.field("category", pa.string()),
    pa.field("tags", pa.list_(pa.string())),
    pa.field("source_type", pa.string()),
    pa.field("full_text", pa.string()),  # for FTS index
    pa.field("metadata_hash", pa.string()),
    pa.field("audio_path", pa.string()),
    pa.field("title", pa.string()),
])

table = db.create_table("samples", schema=schema)

# Create FTS index
table.create_fts_index("full_text")

# Vector search on audio embeddings
results = (
    table.search(query_clap_embedding, vector_column_name="audio_vector")
    .where("category = 'snare'")
    .limit(20)
    .to_list()
)

# Hybrid search (vector + FTS)
vector_results = table.search(query_embedding, vector_column_name="audio_vector").limit(20).to_list()
fts_results = table.search(query_text, query_type="fts").limit(20).to_list()
# Then merge with RRF
```
