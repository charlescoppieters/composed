# Personalization & Learning from User Behavior

Research notes for the Composed sample agent AI layer. The goal: retrieval that improves with use, adapts to individual taste, and handles multi-user jamming sessions gracefully.

---

## 1. User Preference Learning

### The signal landscape

In a sample-browsing context the strongest signals are implicit -- users rarely click a "rate this sample" button, but they constantly reveal preference through behavior:

| Signal | Strength | Latency | Example |
|--------|----------|---------|---------|
| **Selection** (user picks a sample for their project) | Very high | Immediate | Dragged `snare-003` into the arrangement |
| **Audition dwell time** | Medium | Immediate | Previewed for 4 seconds vs 0.5 seconds |
| **Skip** | Medium-low | Immediate | Scrolled past without previewing |
| **Favorite / bookmark** | High | Delayed | Added to "go-to snares" collection |
| **Repeat retrieval** | High | Session-level | Searched for the same sample across 3 sessions |
| **Feedback text** | Very high | Delayed | Wrote "Great for layered choruses" via the existing `feedback` command |

The existing MVP already captures the last signal through `userNotes` and tag enrichment in `apply_feedback`. The gap is capturing the implicit signals (selection, skip, dwell).

### Content-based filtering

Start here. It works with a single user and a cold library.

- Build a **user taste vector** from the attributes of samples they select. If a user consistently picks `tone: warm`, `envelope: boomy`, `space: dry`, those axes accumulate weight.
- The existing taxonomy (`schema.py` attribute axes) is already a feature space. Each sample is a sparse vector over `{tone, envelope, texture, space, sourceFeel}` values.
- On each selection, increment counters for the selected sample's attribute values. On each skip, optionally decrement (with less weight).
- At query time, add a small score boost for samples whose attributes align with the accumulated taste vector.

**POC implementation (fits the current architecture):**

```python
# user_profile.json
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
  "lastUpdated": "2026-03-14T00:00:00Z"
}
```

At search time in `search_catalog`, add a bonus term:

```python
affinity_boost = sum(
    user_profile["attributeAffinities"].get(f"{axis}:{val}", 0)
    for axis, vals in entry.get("attributes", {}).items()
    for val in vals
) * AFFINITY_WEIGHT  # e.g. 0.1 per affinity point
score += affinity_boost
```

### Collaborative filtering

Only relevant when you have multiple users. Two approaches:

1. **User-user CF**: "Users who liked the same kicks as you also liked these snares." Requires enough user overlap to find neighbors. Not viable at POC scale (< 50 users).
2. **Item-item CF**: "Samples that get selected together tend to co-occur." More useful earlier -- even 5 users generating co-selection data gives you something. Store a co-selection matrix: `sample_id -> {co_selected_sample_id: count}`.

**Recommendation**: Start pure content-based. Add item-item CF when you have 10+ active users. Skip user-user CF until the user base justifies it.

---

## 2. Dynamic Metadata Evolution

### The rename problem

A user calls `kick_808_01.wav` "that deep thump." Another user calls it "the sub bass." The canonical metadata says `title: "808 Kick 01"`. All three names should work for retrieval.

### Storage model: canonical + aliases

Extend the existing JSON sidecar with an `aliases` field:

```json
{
  "id": "kick-808-01",
  "title": "808 Kick 01",
  "aliases": [
    {
      "name": "that deep thump",
      "userId": "jordan",
      "context": "used in lo-fi beat session",
      "createdAt": "2026-03-14T00:00:00Z"
    },
    {
      "name": "the sub bass",
      "userId": "alex",
      "context": "bass-heavy trap project",
      "createdAt": "2026-03-12T00:00:00Z"
    }
  ],
  "freeTextDescription": "Deep 808 kick with long sub tail",
  "tags": ["808", "sub", "deep", "thump"]
}
```

Key design decisions:

- **Canonical title stays stable.** It anchors the sample across users and sessions. Never overwrite it with a user alias.
- **Aliases are user-scoped.** Each alias records who created it and optionally in what context.
- **Aliases feed retrieval.** The `_entry_tokens` function in `retrieval.py` should tokenize aliases alongside title and description. For user-scoped search, prioritize that user's aliases.
- **Alias promotion.** If 3+ users independently create similar aliases (fuzzy match), consider promoting the term to `tags` on the canonical metadata. This is how the library "learns" shared vocabulary.

### Description drift

Beyond explicit renames, descriptions should evolve:

1. **Append, don't overwrite.** The existing `userNotes` pattern is correct -- new observations accumulate.
2. **Periodic summarization.** After 10+ notes, run an LLM pass to synthesize a richer `freeTextDescription` that incorporates recurring themes from notes. Keep originals in `userNotes` for provenance.
3. **Tag extraction from notes.** When a note contains a word that maps to a known attribute value (e.g., "this is super punchy"), auto-suggest adding `tone: punchy` to attributes.

### Multi-user metadata divergence

In a shared library, avoid metadata conflicts:

- **Shared layer**: `title`, `category`, `attributes`, `tags`, `freeTextDescription` -- consensus-driven, slow to change.
- **Personal layer**: `aliases`, `userNotes`, `affinities` -- per-user, fast to change.
- **Session layer**: temporary context like "I need something for verse 2" -- ephemeral, discarded after session.

Store personal layers in a separate file or database partition: `samples/_profiles/{userId}/overrides.json`. This keeps the shared sidecars clean.

---

## 3. Embedding Space Adaptation

### The problem

Pre-trained text or audio embeddings capture general similarity. But in your domain, "warm" and "punchy" might be nearly synonymous for one user's workflow, while they represent opposite ends of a spectrum for another.

### Technique 1: User-specific embedding offsets (simplest)

Maintain a learned offset vector per user that shifts the query embedding before similarity search.

```
adjusted_query = base_query_embedding + user_offset_vector
```

The offset is learned from selection history: when a user selects sample A over sample B for query Q, nudge the offset toward A's embedding and away from B's.

- **Pros**: Dead simple, one vector per user, fast at query time.
- **Cons**: A single global offset is blunt -- it cannot capture context-dependent preferences.

**POC viability**: High. Store one float vector per user alongside their profile. Update it with exponential moving average on each selection.

### Technique 2: Adapter layers (re-ranking)

Place a small neural network between the embedding lookup and the final ranking:

```
[query embedding] -> [adapter MLP] -> adjusted embedding -> cosine similarity
```

The adapter is a 2-layer MLP (e.g., 128 -> 64 -> 128 dims) trained on user preference pairs. It learns to warp the embedding space so that samples the user prefers cluster closer to their queries.

- **Training data**: (query, selected_sample, rejected_sample) triples from usage logs.
- **Architecture**: Siamese network with contrastive or triplet loss.
- **Update frequency**: Retrain nightly or after N new selections.

**POC viability**: Medium. Requires accumulating enough preference pairs (50-100+) before training is meaningful. Good Phase 2 target.

### Technique 3: Fine-tuning the embedding model

Directly fine-tune the text/audio encoder on domain-specific data.

- Use the sample taxonomy as supervised labels for contrastive learning.
- Fine-tune on (description, audio) pairs from the library.
- This improves embeddings for everyone, not per-user.

**POC viability**: Low for personalization (helps global quality, not individual taste). Worth doing once you have enough samples and descriptions to form a fine-tuning dataset (500+ pairs).

### Technique 4: Retrieval-augmented re-ranking

Skip embedding adaptation entirely. Use a lightweight re-ranker that takes the top-K results from embedding search and re-orders them using user preference features:

```
rerank_score = embedding_sim * 0.6 + attribute_affinity * 0.2 + recency * 0.1 + co_selection * 0.1
```

**POC viability**: Very high. This is the recommended first step. It layers on top of the existing `search_catalog` scoring without touching embeddings at all.

### Recommendation

1. **Now**: Re-ranking with user affinity features (Technique 4).
2. **Phase 2**: User-specific embedding offsets (Technique 1).
3. **Phase 3**: Adapter layers (Technique 2) once you have enough preference data.
4. **Later**: Domain fine-tuning (Technique 3) for global embedding quality.

---

## 4. Reinforcement from Selection

### The core signal

When a user searches "tight punchy snare" and picks sample B out of candidates A, B, C -- that is a preference signal: B > A and B > C for this query.

### Approach 1: Metadata boosting (simplest, already partially implemented)

The existing `apply_feedback` function writes notes and tags back to the sidecar. Extend this:

- On selection, automatically add the query terms as weak tags (only if they are not already present).
- Increment a `selectionCount` field on the sample metadata.
- Boost samples with higher `selectionCount` in `search_catalog` scoring.

```python
# In search_catalog scoring:
score += min(entry.get("selectionCount", 0), 10) * 0.5  # Capped popularity boost
```

This is a popularity signal, not a relevance signal. Cap it to prevent runaway feedback loops where popular samples dominate every query.

### Approach 2: Query-sample affinity log

Store explicit (query, selected_sample_id, rejected_sample_ids) triples:

```jsonl
{"query": "tight punchy snare", "selected": "snare-003", "rejected": ["snare-001", "snare-005"], "userId": "jordan", "timestamp": "2026-03-14T00:00:00Z"}
```

This log enables:
- Training re-rankers and adapters (Section 3).
- Discovering vocabulary gaps (users keep searching "thwack" but no sample has that term -- maybe add it).
- Identifying consistently-rejected samples that need better metadata.

### Approach 3: Preference learning (RLHF-lite)

Model the ranking function as a reward model trained on pairwise preferences:

1. From selection logs, generate pairs: (query, winner, loser).
2. Train a Bradley-Terry model or small cross-encoder to predict P(A preferred over B | query).
3. Use the learned model as a re-ranker.

A Bradley-Terry model is surprisingly simple:

```python
# P(A > B) = sigmoid(score(A) - score(B))
# score(x) = dot(feature_vector(query, x), learned_weights)
# Train with logistic regression on preference pairs
```

The feature vector can include: token overlap, attribute match, user affinity, selection count, embedding similarity. Logistic regression over these features is a "learned re-ranker" that requires minimal infrastructure.

**POC viability**: The logistic regression version is very feasible. It needs 100+ preference pairs to be useful, which accumulates after a few sessions of active use.

### Approach 4: Contextual bandits

Model sample recommendation as an exploration-exploitation problem:

- **Exploit**: Show samples the model predicts the user will like.
- **Explore**: Occasionally surface less-certain candidates to gather information.

Thompson sampling or epsilon-greedy over the re-ranking scores. This prevents the system from getting stuck always recommending the same samples.

**POC viability**: Medium. Straightforward to implement on top of a scoring function, but the exploration rate needs tuning to avoid annoying users with bad suggestions.

### Recommended progression

1. **Now**: Selection count boost + query-sample affinity log (passive data collection).
2. **Soon**: Logistic regression re-ranker trained on accumulated preference pairs.
3. **Later**: Contextual bandit for exploration-exploitation balance.

---

## 5. Personal Knowledge Graphs

### Why graphs

Samples exist in a web of relationships that flat metadata cannot capture:

- "I always use `kick-808-01` with `hat-closed-02` in trap beats."
- "When I'm making ambient music late at night, I reach for texture samples."
- "This snare is my go-to replacement for `snare-001` when I need more brightness."

### Simple graph structure (recommended for POC)

An adjacency list stored as JSON, per user:

```json
{
  "userId": "jordan",
  "edges": [
    {
      "from": "kick-808-01",
      "to": "hat-closed-02",
      "relation": "co-used",
      "context": {"genre": "trap", "count": 7}
    },
    {
      "from": "snare-001",
      "to": "snare-003",
      "relation": "replaced-by",
      "context": {"reason": "brighter alternative"}
    }
  ],
  "contextPreferences": [
    {
      "context": {"genre": "ambient", "timeOfDay": "night"},
      "preferredCategories": ["texture", "foley"],
      "preferredAttributes": {"tone": "warm", "space": "wet"}
    }
  ]
}
```

Edge types to start with:

| Relation | Meaning | Signal source |
|----------|---------|---------------|
| `co-used` | Samples placed in the same project | Project/session tracking |
| `replaced-by` | User swapped A for B | Selection after A was auditioned |
| `similar-to` | User considers these interchangeable | Explicit user action or embedding proximity |
| `derived-from` | B was generated/edited from A | `sourceRef.parentSampleId` (already in schema) |

### Context nodes

Beyond sample-to-sample edges, store context-preference mappings:

- **Genre context**: When working in "lo-fi hip hop," user prefers warm + dusty + short samples.
- **Temporal context**: Late-night sessions skew toward ambient textures.
- **Project context**: This specific project uses a dark, minimal palette.

These context nodes let the system adjust retrieval when the user says "I'm working on a trap beat" without having to re-specify every preference.

### Full knowledge graph (future)

For scale, consider a property graph database (Neo4j, or embedded alternatives like KuzuDB):

- Nodes: Samples, Users, Projects, Sessions, Genres, Moods.
- Edges: `SELECTED_BY`, `CO_USED_WITH`, `TAGGED_AS`, `USED_IN_PROJECT`, `HAS_GENRE`.
- Queries: "Find samples co-used with my last 3 kick selections in trap projects."

**POC viability**: The JSON adjacency list is sufficient for < 1000 samples and < 10 users. Move to a graph DB when you need multi-hop queries or the edge count exceeds what JSON handles comfortably (roughly 10K+ edges).

### Integration with retrieval

At query time:

1. Run the standard `search_catalog` scoring.
2. Look up the user's graph for co-usage edges from recently-used samples.
3. Boost candidates that have co-usage relationships with the user's recent selections.
4. If a context preference matches the current session context, apply attribute boosts.

---

## 6. Privacy & Multi-User Dynamics

### The jamming scenario

Multiple users at a table, each with their own taste, collaborating on a shared project. Whose preferences drive retrieval?

### Preference blending strategies

**Option 1: Active user wins.** Whoever typed the query gets their personal re-ranking applied. Simple, clear, no blending needed. Works when users take turns.

**Option 2: Weighted average.** Blend all active users' affinity vectors:

```python
blended_affinity = sum(user.affinity * user.weight for user in active_users) / sum(user.weight)
```

Weights could be equal, or biased toward the "session leader" or the person who initiated the search.

**Option 3: Union of positives, intersection of negatives.** Surface anything any user might like, but filter out things everyone has rejected. Maximizes variety at the cost of precision.

**Option 4: Session profile.** Create a temporary "session user" whose preferences accumulate from the group's selections during the jam. Starts fresh each session, inherits nothing. Clean but loses individual learning.

**Recommendation**: Start with Option 1 (active user wins). It requires no blending logic and respects individual taste. Add Option 4 (session profile) as an opt-in feature for group jams where nobody wants to "own" the search.

### Data isolation

- **Personal profiles** (`aliases`, `affinities`, `knowledge graph edges`) are per-user and private by default.
- **Shared metadata** (`title`, `tags`, `attributes`, `freeTextDescription`) is visible to everyone.
- **Selection logs** are per-user but can be anonymized and aggregated for collaborative filtering.

For a local-first app (no cloud), privacy is simpler -- data stays on the machine. For a networked setup:

- Store personal profiles locally or in an encrypted user partition.
- Shared metadata syncs across the group.
- Selection logs are opt-in for aggregation.

### Conflict resolution

When two users want to change shared metadata differently:

- **Tags**: Union. Both users' tags get added. Tags are additive and cheap.
- **Attributes**: Canonical attributes are curated. Require consensus or a "maintainer" role.
- **Description**: Append both perspectives to `userNotes`. Periodically synthesize.
- **Aliases**: Always personal. No conflict possible.

---

## 7. State of the Art in Music Recommendation

### Spotify

- **Core system**: Collaborative filtering at massive scale (hundreds of millions of users). Matrix factorization on listening history.
- **Content signals**: Audio analysis (tempo, energy, danceability, valence) extracted from raw audio via CNNs. Text analysis of playlist names, descriptions, and web-scraped metadata.
- **Explore/exploit**: Multi-armed bandits for surfacing new tracks in Discover Weekly. Deliberate injection of "exploration" tracks to prevent filter bubbles.
- **Session modeling**: RNNs and Transformers to model listening sessions as sequences, predicting the next track.
- **What is applicable at small scale**: The audio feature extraction pipeline (extracting tempo, energy, brightness from samples) is directly useful. The collaborative filtering requires scale we do not have.

### YouTube Music

- **Deep neural networks** for recommendation: Wide & Deep model combining memorization (user history lookup) with generalization (learned embeddings).
- **Multi-task learning**: A single model predicts clicks, listens, skips, and likes simultaneously. Each task provides a different training signal.
- **Contextual features**: Time of day, device type, and listening context (working out, commuting) influence recommendations.
- **What is applicable**: Multi-signal learning (selection + skip + dwell) and contextual features are directly relevant even at small scale.

### Apple Music

- **Heavy editorial curation** combined with algorithmic recommendations. Human-curated playlists define "taste neighborhoods."
- **Audio fingerprinting and analysis** for similarity.
- **What is applicable**: The curation-first philosophy maps well to a small library where expert metadata (the taxonomy) bootstraps quality before algorithms take over.

### Research highlights

- **Contrastive learning for audio** (CLAP, LAION-CLAP): Joint text-audio embedding spaces. Train on (text description, audio clip) pairs. Directly applicable to sample retrieval -- embed both the query text and the sample audio into the same space.
- **Two-tower retrieval models**: Separate encoders for query and item, trained to maximize similarity for positive pairs. Efficient at serving time (pre-compute item embeddings, only encode query at search time). This is the architecture behind most production recommendation systems.
- **Sequence-aware recommendation** (SASRec, BERT4Rec): Model the user's selection history as a sequence and predict the next item. Useful when session order matters (e.g., building a beat means selecting kick, then snare, then hat in a common pattern).

### What matters at small scale

At < 1000 samples and < 50 users, the big-tech approaches simplify dramatically:

| Big-tech approach | Small-scale equivalent |
|-------------------|----------------------|
| Matrix factorization CF | Item-item co-selection counts |
| Deep neural ranker | Logistic regression over hand-crafted features |
| Audio CNN features | Librosa feature extraction (spectral centroid, RMS, zero-crossing rate) |
| Two-tower model | Pre-computed embeddings + cosine similarity (already planned in Phase 2) |
| Session Transformer | Simple "what was selected recently" recency boost |
| Multi-armed bandit | Epsilon-greedy over ranking scores |

---

## 8. Practical Recommendations for POC

### Phase 0: Passive data collection (implement now, zero model complexity)

Before building any learning, instrument the system to collect signals. Every selection, skip, and search query should be logged.

**Implementation**:

1. Add a `selection_log.jsonl` file under `samples/_index/`:

```jsonl
{"timestamp": "2026-03-14T12:00:00Z", "userId": "jordan", "query": "tight punchy snare", "results": ["snare-001", "snare-003", "snare-005"], "selected": "snare-003", "sessionId": "abc123"}
```

2. Log every search + selection through the existing CLI `feedback` flow. Extend `apply_feedback` to also append to the selection log.

3. Add a `selectionCount` field to sample metadata, incremented on each selection.

**Effort**: Small. Extends existing `cli.py` and `retrieval.py` with a few lines.

### Phase 1: User taste profile + metadata boosting (first learning)

1. **User profile**: JSON file per user tracking attribute affinities (Section 1).
2. **Alias support**: Add `aliases` array to sample sidecar schema (Section 2). Update `_entry_tokens` to include alias text.
3. **Selection count boost**: Cap at 10, weight at 0.5 per count in `search_catalog` (Section 4).
4. **Re-ranking formula**:

```python
final_score = (
    base_token_score * 1.0
    + attribute_affinity_boost * 0.2
    + selection_popularity_boost * 0.1
    + recency_boost * 0.1
)
```

**Effort**: Medium. New `user_profile.py` module, schema extension for aliases, scoring changes in `retrieval.py`.

### Phase 2: Embeddings + learned re-ranking

1. **Embed samples** using text embeddings (Gemini, as noted in `phase-2-upgrades.md`). Store vectors in a local FAISS or Annoy index.
2. **User embedding offset**: One vector per user, updated on each selection via exponential moving average.
3. **Logistic regression re-ranker**: Train on accumulated preference pairs from the selection log. Features: embedding cosine similarity, attribute overlap, user affinity score, selection count, co-usage count.
4. **Simple knowledge graph**: JSON adjacency list tracking co-usage and replacement edges (Section 5).

**Effort**: Significant. Requires embedding infrastructure, but the existing schema and catalog pipeline are designed for this (see `embeddingRefs` in phase-2-upgrades.md).

### Phase 3: Multi-user + contextual awareness

1. **Session context**: Accept genre/mood/project metadata at search time. Apply context-preference mappings from the user's knowledge graph.
2. **Group blending**: Session profile that accumulates preferences from all active users during a jam.
3. **Collaborative signals**: Item-item co-selection matrix aggregated across users.
4. **Exploration**: Epsilon-greedy injection of under-explored samples to prevent stagnation.

**Effort**: Large. Requires multi-user infrastructure, session management, and more sophisticated scoring.

### Architecture sketch

```
                    ┌──────────────┐
                    │  User Query  │
                    └──────┬───────┘
                           │
                    ┌──────▼───────┐
                    │  Tokenize +  │
                    │  Normalize   │
                    └──────┬───────┘
                           │
              ┌────────────┼────────────┐
              │            │            │
       ┌──────▼──────┐ ┌──▼────────┐ ┌─▼───────────┐
       │  Keyword /  │ │ Embedding │ │  User Graph  │
       │  Metadata   │ │ Similarity│ │  Lookup      │
       │  Score      │ │ (Phase 2) │ │  (Phase 2)   │
       └──────┬──────┘ └──┬────────┘ └─┬───────────┘
              │            │            │
              └────────────┼────────────┘
                           │
                    ┌──────▼───────┐
                    │  Re-ranker   │
                    │  (affinity + │
                    │  popularity +│
                    │  context)    │
                    └──────┬───────┘
                           │
                    ┌──────▼───────┐
                    │  Top-K       │
                    │  Results     │
                    └──────┬───────┘
                           │
                    ┌──────▼───────┐
                    │  Log to      │
                    │  selection   │
                    │  log         │
                    └──────────────┘
```

### Key files to create/modify

| File | Action | Phase |
|------|--------|-------|
| `sample_agent/selection_log.py` | New -- log selections to JSONL | 0 |
| `sample_agent/retrieval.py` | Extend scoring with affinity + popularity | 1 |
| `sample_agent/schema.py` | Add `aliases`, `selectionCount` to schema | 1 |
| `sample_agent/user_profile.py` | New -- user taste profile management | 1 |
| `samples/_profiles/{userId}/profile.json` | New -- per-user preference data | 1 |
| `sample_agent/embeddings.py` | New -- embedding index and similarity | 2 |
| `sample_agent/knowledge_graph.py` | New -- co-usage and replacement edges | 2 |
| `sample_agent/reranker.py` | New -- learned re-ranking model | 2 |

### The one-line summary

Log everything now, boost with simple counters next, learn a re-ranker when you have enough data, and never overwrite canonical metadata with personal preferences.
