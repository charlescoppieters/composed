# Agent Architecture for Composed

Research into building the AI layer: a tool-calling agent that searches for audio samples, generates sounds, and learns from user behavior.

---

## 1. Tool-Calling Agent Frameworks

### The Landscape

Six realistic options for building the agent backbone. Evaluated for: simplicity, TypeScript/Python support, tool-calling ergonomics, and fit for a real-time music app.

#### Claude Tool Use (Raw API)

The most direct path. You send a message with a `tools` array describing your functions. Claude decides when to call them, returns structured `tool_use` blocks, you execute and return results. No framework needed.

```typescript
// Anthropic SDK - direct tool use
const response = await anthropic.messages.create({
  model: "claude-sonnet-4-20250514",
  max_tokens: 1024,
  system: MUSIC_SYSTEM_PROMPT,
  tools: [searchSamplesLexical, searchSamplesSemantic, generateSound, ...],
  messages: conversationHistory,
});

// Response contains tool_use content blocks you execute yourself
for (const block of response.content) {
  if (block.type === "tool_use") {
    const result = await executeTool(block.name, block.input);
    // Feed result back as tool_result message
  }
}
```

**Pros**: Zero abstraction overhead. Full control over the loop. Works in any runtime.
**Cons**: You write the agent loop yourself (but it is ~50 lines).

#### Anthropic Agent SDK

Wraps Claude's tool use into a managed agent loop -- the same loop that powers Claude Code. Handles tool execution, retries, and multi-turn orchestration. Supports MCP servers for tool registration.

```python
from claude_agent_sdk import Agent, tool

@tool
def search_samples_semantic(query: str, limit: int = 10):
    """Search samples by semantic similarity to a natural language description."""
    # ...

agent = Agent(
    model="claude-sonnet-4-20250514",
    system_prompt=MUSIC_SYSTEM_PROMPT,
    tools=[search_samples_semantic, generate_sound, ...],
)
result = agent.run("Find me a dark 808 with a long tail")
```

**Pros**: Battle-tested loop (it runs Claude Code). Built-in MCP support. Python and TypeScript.
**Cons**: Heavier dependency. Opinionated about execution model. Newer, less community knowledge.

#### OpenAI Function Calling / Agents SDK

OpenAI's Responses API supports function calling with a similar pattern. Their Agents SDK (open-source, March 2025) adds handoffs between agents, guardrails, and tracing. Provider-agnostic in theory.

**Pros**: Good if you want model optionality (swap Claude for GPT). Handoff pattern is interesting for multi-agent setups.
**Cons**: We are building on Claude. Extra abstraction for provider-agnosticism we may not need. Assistants API sunsetting mid-2026.

#### Vercel AI SDK (v6)

TypeScript-first. The `generateText` and `streamText` functions handle tool calling loops natively. AI SDK 6 introduced a `ToolLoopAgent` class and `needsApproval` for human-in-the-loop. Supports Claude, GPT, and others via provider adapters.

```typescript
import { generateText, tool } from "ai";
import { anthropic } from "@ai-sdk/anthropic";

const result = await generateText({
  model: anthropic("claude-sonnet-4-20250514"),
  system: MUSIC_SYSTEM_PROMPT,
  tools: {
    search_samples_semantic: tool({
      description: "Search samples by semantic similarity",
      parameters: z.object({
        query: z.string(),
        limit: z.number().default(10),
      }),
      execute: async ({ query, limit }) => {
        return await vectorSearch(query, limit);
      },
    }),
  },
  maxSteps: 10,
  prompt: userMessage,
});
```

**Pros**: First-class streaming. Excellent Next.js integration. Clean Zod-based tool schemas. Model-agnostic. Active community.
**Cons**: TypeScript only. Slightly more abstraction than raw API calls. Streaming complexity can leak.

#### LangChain / LangGraph

LangChain provides tool decorators and chain abstractions. LangGraph layers a graph-based state machine on top -- nodes are actions, edges are transitions. Good for complex multi-step workflows.

**Pros**: Most mature ecosystem. Great for complex, branching agent logic. LangSmith for observability.
**Cons**: Significantly over-engineered for our use case. Heavy abstractions. Debugging is painful when the graph gets complex. Python-first (JS support is secondary).

### Recommendation for Composed

**Primary: Vercel AI SDK** if building in TypeScript/Next.js (likely for a web-based music app). It gives us streaming, clean tool definitions, and model flexibility with minimal abstraction.

**Fallback: Raw Claude tool use** if we need maximum control or are running in a non-Next.js backend. The agent loop is trivial to write.

**Avoid: LangChain/LangGraph** for a POC. The graph abstraction adds complexity we do not need for a single-agent system with 6 tools.

---

## 2. Minimal Agent Harness Design

The entire agent is a loop. Do not over-engineer it.

### The Loop

```
User query
  -> Build messages array (system prompt + conversation history + user message)
  -> Call LLM with tools
  -> If response contains tool calls:
       Execute each tool
       Append tool results to messages
       Call LLM again (goto top of inner loop)
  -> If response is text:
       Return to user
```

### Implementation (~60 lines of actual logic)

```typescript
type Tool = {
  name: string;
  description: string;
  parameters: z.ZodSchema;
  execute: (params: any) => Promise<any>;
};

async function agentLoop(
  userMessage: string,
  conversationHistory: Message[],
  tools: Tool[],
  systemPrompt: string,
  maxSteps = 10
): Promise<{ response: string; toolCalls: ToolCallRecord[] }> {
  const messages = [...conversationHistory, { role: "user", content: userMessage }];
  const toolCallLog: ToolCallRecord[] = [];

  for (let step = 0; step < maxSteps; step++) {
    const response = await llm.call({
      system: systemPrompt,
      messages,
      tools: tools.map(t => ({
        name: t.name,
        description: t.description,
        input_schema: zodToJsonSchema(t.parameters),
      })),
    });

    // Append assistant response
    messages.push({ role: "assistant", content: response.content });

    // Extract tool calls
    const toolUses = response.content.filter(b => b.type === "tool_use");
    if (toolUses.length === 0) {
      // Pure text response -- we are done
      const text = response.content.filter(b => b.type === "text").map(b => b.text).join("");
      return { response: text, toolCalls: toolCallLog };
    }

    // Execute tools and collect results
    const toolResults = await Promise.all(
      toolUses.map(async (tu) => {
        const tool = tools.find(t => t.name === tu.name);
        const result = await tool.execute(tu.input);
        toolCallLog.push({ name: tu.name, input: tu.input, output: result });
        return { type: "tool_result", tool_use_id: tu.id, content: JSON.stringify(result) };
      })
    );

    messages.push({ role: "user", content: toolResults });
  }

  return { response: "Max steps reached.", toolCalls: toolCallLog };
}
```

### Key Design Decisions

- **Parallel tool execution**: Use `Promise.all` for independent tool calls. Claude can request multiple tools in one turn (e.g., lexical search AND semantic search simultaneously).
- **Conversation history is the state**: No external state machine. The messages array IS the agent's memory.
- **Max steps as a safety valve**: Default 10 is generous. Most music queries resolve in 2-3 steps (search, maybe refine, respond).
- **Stream the final text response**: The inner loop runs tool calls server-side. Only the final text response streams to the UI. This keeps the UX snappy.

### What NOT to build

- No graph orchestration (LangGraph-style). One agent, one loop.
- No "planner" / "executor" split. Claude is good enough to plan and execute in one pass.
- No agent-to-agent handoffs. One agent handles everything.
- No persistent agent threads (Assistants API style). Stateless function calls with conversation history passed in.

---

## 3. Tool Definitions

### `search_samples_lexical`

Grep/filesystem search across sample metadata. Fast, exact, good for known names and tags.

```typescript
const searchSamplesLexical = tool({
  description: `Search the sample library by exact text matching against names, tags,
    descriptions, and file paths. Good for known sample names ("TR-808"),
    specific tags ("kick", "snare", "ambient"), or file path patterns.
    Returns matching samples sorted by relevance.`,
  parameters: z.object({
    query: z.string().describe("Search text to match against sample metadata"),
    tags: z.array(z.string()).optional().describe("Filter by specific tags"),
    category: z.enum(["drums", "synth", "foley", "vocal", "bass", "fx", "ambient"])
      .optional(),
    limit: z.number().default(20),
  }),
  execute: async ({ query, tags, category, limit }) => {
    // Implementation: SQLite FTS5 or simple text index over sample metadata
    return await sampleDb.searchLexical({ query, tags, category, limit });
  },
});
```

**Implementation**: SQLite FTS5 full-text search over a `samples` table with columns for name, description, tags, pack, category. This is fast, zero-infrastructure, and good enough for a POC.

### `search_samples_semantic`

Vector similarity search. Understands vibes, not just keywords.

```typescript
const searchSamplesSemantic = tool({
  description: `Search samples by meaning/vibe using natural language.
    Understands descriptions like "warm analog pad", "glitchy percussion",
    "something that sounds like rain on a tin roof". Uses vector embeddings
    to find semantically similar samples even when exact words don't match.`,
  parameters: z.object({
    query: z.string().describe("Natural language description of the desired sound"),
    limit: z.number().default(10),
    filter: z.object({
      category: z.string().optional(),
      bpm_range: z.tuple([z.number(), z.number()]).optional(),
      key: z.string().optional(),
    }).optional(),
  }),
  execute: async ({ query, limit, filter }) => {
    const embedding = await embed(query); // text-embedding-3-small or similar
    return await vectorDb.search(embedding, { limit, filter });
  },
});
```

**Embedding strategy**: Embed sample descriptions (not raw audio) using a text embedding model. This is simpler and works well because our metadata is descriptive. Audio embeddings (CLAP, PANNs) are a future enhancement for "find something that sounds like this [audio]" queries.

**Vector store**: Start with SQLite + `sqlite-vec` extension, or Turbopuffer for hosted. Avoid standing up Pinecone/Weaviate for a POC.

### `generate_sound`

Call ElevenLabs Sound Effects API (or similar) to create new sounds from text descriptions.

```typescript
const generateSound = tool({
  description: `Generate a new sound effect or musical element from a text description.
    Use when the user wants something that doesn't exist in the library.
    Examples: "808 kick with extra sub bass", "vinyl crackle ambient texture",
    "reversed cymbal swell, 2 seconds". Supports up to 30 seconds.`,
  parameters: z.object({
    prompt: z.string().describe("Detailed description of the sound to generate"),
    duration_seconds: z.number().min(0.5).max(30).default(5),
    variations: z.number().min(1).max(4).default(2)
      .describe("Number of variations to generate"),
  }),
  execute: async ({ prompt, duration_seconds, variations }) => {
    const response = await elevenlabs.soundEffects.create({
      text: prompt,
      duration_seconds,
      // Returns array of audio URLs
    });
    // Store temporarily, return URLs + metadata for user preview
    return {
      samples: response.map((url, i) => ({
        url,
        name: `Generated: ${prompt.slice(0, 50)}`,
        variation: i + 1,
        temporary: true, // Not yet saved to library
      })),
    };
  },
});
```

**ElevenLabs SFX v2**: Supports up to 30s clips, 48kHz, seamless looping. ~$0.10-0.25 per generation. Good enough for a POC. Alternative: Stability AI's Stable Audio.

### `refine_search`

Iterate on previous results based on user feedback. This is the "more like that but darker" tool.

```typescript
const refineSearch = tool({
  description: `Refine a previous search based on user feedback. Use when the user says
    things like "more like sample 3 but darker", "less reverb", "faster tempo",
    or "I liked the first two, find more like those". Adjusts the search
    based on positive/negative signals from previous results.`,
  parameters: z.object({
    liked_sample_ids: z.array(z.string()).optional()
      .describe("IDs of samples the user liked from previous results"),
    disliked_sample_ids: z.array(z.string()).optional()
      .describe("IDs of samples the user rejected"),
    adjustment: z.string()
      .describe("Natural language description of how to adjust: 'darker', 'more percussive', etc."),
    previous_query: z.string()
      .describe("The original search query being refined"),
  }),
  execute: async ({ liked_sample_ids, disliked_sample_ids, adjustment, previous_query }) => {
    // Strategy: build a new query by combining original + adjustment,
    // then boost/penalize based on liked/disliked embeddings
    const likedEmbeddings = await getEmbeddings(liked_sample_ids);
    const dislikedEmbeddings = await getEmbeddings(disliked_sample_ids);

    // Average liked embeddings, subtract disliked (simplified Rocchio algorithm)
    const refinedEmbedding = rocchioRefine(
      await embed(`${previous_query} ${adjustment}`),
      likedEmbeddings,
      dislikedEmbeddings
    );

    return await vectorDb.search(refinedEmbedding, { limit: 10 });
  },
});
```

**The Rocchio trick**: Classic information retrieval. Take the query vector, add the average of liked vectors, subtract the average of disliked vectors. Simple, effective, no training needed.

### `save_sample`

Persist a generated or selected sample to the user's library.

```typescript
const saveSample = tool({
  description: `Save a sound to the user's library. Use after the user confirms they want
    to keep a generated or found sample. Assigns a name, tags, and description.`,
  parameters: z.object({
    source_url: z.string().describe("URL of the sample to save"),
    name: z.string().describe("User-facing name for the sample"),
    tags: z.array(z.string()).describe("Descriptive tags"),
    description: z.string().describe("Short description of the sound"),
    category: z.enum(["drums", "synth", "foley", "vocal", "bass", "fx", "ambient"]),
  }),
  execute: async ({ source_url, name, tags, description, category }) => {
    // Download audio, store in user's library, index metadata + embedding
    const audioBuffer = await downloadAudio(source_url);
    const id = await sampleDb.save({ name, tags, description, category, audioBuffer });
    const embedding = await embed(description);
    await vectorDb.upsert(id, embedding, { name, tags, category });
    return { id, name, saved: true };
  },
});
```

### `get_user_preferences`

Recall user-specific context: naming conventions, favorite packs, preferred categories.

```typescript
const getUserPreferences = tool({
  description: `Look up the current user's preferences, history, and patterns.
    Use to personalize results: their naming conventions, favorite sample packs,
    frequently used categories, and recent searches.`,
  parameters: z.object({
    aspect: z.enum([
      "naming_conventions",  // How they name their samples
      "favorites",           // Most-used samples
      "recent_searches",     // Last N search queries
      "genre_preferences",   // Detected genre affinities
      "all",
    ]).default("all"),
  }),
  execute: async ({ aspect }) => {
    return await userPrefsDb.get(currentUserId, aspect);
  },
});
```

---

## 4. Context Engineering

The system prompt is the agent's musical brain. It needs to bridge expert terminology and beginner intuition.

### System Prompt Structure

```typescript
const MUSIC_SYSTEM_PROMPT = `You are Composed, a music production assistant specialized in finding
and creating sounds. You help producers at all skill levels -- from beginners who describe sounds
as "dark" or "bouncy" to experts who ask for "a 909 hat with 12kHz shelf rolloff."

## Your Personality
- Knowledgeable but not pretentious. Meet the user where they are.
- Decisive: suggest specific samples, don't hedge with "it depends."
- Brief: producers are in flow state. Respect their time.

## Music Knowledge

You understand:
- Drum machines: TR-808, TR-909, LinnDrum, SP-1200, MPC
- Synthesis: subtractive, FM, granular, wavetable, additive
- Effects: reverb (room/hall/plate/spring), delay, chorus, phaser, distortion, sidechain compression
- Genres and their sonic signatures: hip-hop (heavy 808s, crispy hats), house (4-on-the-floor, off-beat hats), ambient (long reverb tails, evolving textures), trap (pitched 808s, rapid hi-hats, dark pads)
- Tempo ranges by genre: ambient (60-90), hip-hop (70-100), house (120-130), drum & bass (160-180), trap (130-170)

## Vibe-to-Technical Translation

When users say... | You understand...
"dark" -> low-passed, minor key, sparse, sub-heavy
"bright" -> high frequency content, major tonality, airy
"punchy" -> fast attack, compressed, mid-forward
"warm" -> analog character, slight saturation, rolled-off highs
"ethereal" -> lots of reverb, high-register, slow attack, pad-like
"crunchy" -> bit-crushed, lo-fi, distorted
"fat" -> layered, detuned, wide stereo, sub-present
"tight" -> short decay, minimal reverb, quantized

## Tool Usage Guidelines

1. For specific sample names or tags -> use search_samples_lexical
2. For vibes, descriptions, or "something like X" -> use search_samples_semantic
3. When nothing in the library matches -> offer to generate_sound
4. When user says "more like that" or gives feedback -> use refine_search
5. When user wants to keep something -> use save_sample
6. At conversation start or when personalizing -> use get_user_preferences

## Response Format

When presenting search results:
- Show the top 3-5 results with name, brief description, and category
- Mention why each result matches the query
- If results are weak, proactively suggest generating a new sound

When presenting generated sounds:
- Describe what was generated
- Ask which variation they prefer
- Offer to save or adjust`;
```

### Context Engineering Principles Applied

1. **Write context**: The vibe-to-technical translation table is persistent knowledge the model needs every turn. Bake it into the system prompt rather than retrieving it.

2. **Select context**: Use `get_user_preferences` to inject relevant user context only when needed, not every turn. Pull recent searches only when the query seems related to prior work.

3. **Compress context**: For long sessions, summarize older tool results rather than carrying full JSON payloads. After 10+ turns, compress the conversation:

```typescript
// After N turns, summarize earlier context
if (messages.length > 20) {
  const summary = await summarizeConversation(messages.slice(0, -6));
  messages = [
    { role: "user", content: `[Session context: ${summary}]` },
    ...messages.slice(-6), // Keep last 6 messages verbatim
  ];
}
```

4. **Isolate context**: Keep tool results structured (JSON), not narrative. The model parses structured data more reliably than prose descriptions of search results.

---

## 5. Self-Improvement Loop

How the agent gets better at finding what users want over time.

### Level 1: Metadata Enrichment (Day 1)

When a user saves a sample, capture their name, tags, and description. This is free labeled data.

```typescript
// On save_sample, enrich the canonical metadata
async function onSampleSaved(sampleId: string, userMetadata: UserMetadata) {
  const existing = await sampleDb.get(sampleId);

  // Merge user-contributed tags with existing tags
  const enrichedTags = [...new Set([...existing.tags, ...userMetadata.tags])];
  await sampleDb.update(sampleId, { tags: enrichedTags });

  // Re-embed with enriched description
  const enrichedDesc = `${existing.description}. Also described as: ${userMetadata.description}`;
  const newEmbedding = await embed(enrichedDesc);
  await vectorDb.upsert(sampleId, newEmbedding);
}
```

### Level 2: Implicit Feedback Signals (Week 2)

Track what users actually do after search results are presented.

| Signal | Meaning | Weight |
|--------|---------|--------|
| User previews a sample | Mild interest | +0.1 |
| User saves a sample | Strong positive | +1.0 |
| User uses sample in a project | Strongest signal | +2.0 |
| User skips all results and re-queries | Negative signal for all shown | -0.3 |
| User says "not that" or similar | Explicit negative | -0.5 |

```typescript
// Log interaction events
interface InteractionEvent {
  query: string;
  query_embedding: number[];
  sample_id: string;
  action: "preview" | "save" | "use_in_project" | "skip" | "reject";
  timestamp: number;
}

// Periodically: re-rank samples based on accumulated feedback
async function updateSampleScore(sampleId: string) {
  const events = await eventsDb.getForSample(sampleId);
  const score = events.reduce((acc, e) => acc + SIGNAL_WEIGHTS[e.action], 0);
  await sampleDb.update(sampleId, { popularity_score: score });
}
```

### Level 3: Query-to-Result Mapping (Month 2)

Build a lookup of "when users search X, they end up picking Y." Use this to boost future results.

```typescript
// After accumulating enough data:
// For query "dark 808", users saved samples [A, B, C] 80% of the time
// -> Boost A, B, C in future "dark 808" searches

async function getQueryBoosts(query: string): Promise<Map<string, number>> {
  const similarPastQueries = await vectorDb.search(await embed(query), {
    collection: "query_logs",
    limit: 50,
  });

  const savedSamples = new Map<string, number>();
  for (const pastQuery of similarPastQueries) {
    const saves = await eventsDb.getSavesForQuery(pastQuery.id);
    for (const save of saves) {
      savedSamples.set(save.sample_id, (savedSamples.get(save.sample_id) || 0) + 1);
    }
  }

  return savedSamples; // sample_id -> boost count
}
```

### Level 4: Embedding Fine-Tuning (Quarter 2)

If you accumulate enough (query, positive_sample, negative_sample) triples, fine-tune the embedding model with contrastive learning. This makes the vector space itself align with your users' taste. Do NOT do this until you have thousands of interactions. Until then, Levels 1-3 are more than enough.

### What to avoid

- Do not retrain models on small data. Metadata enrichment and score boosting are more impactful and cheaper.
- Do not build a recommendation engine. The agent IS the recommendation engine -- it uses tools, context, and feedback signals. Adding a separate rec system creates competing logic.

---

## 6. Conversation / Session Design

Music production is inherently iterative. "Find me a kick" is rarely a one-shot query.

### Multi-Turn Refinement Pattern

```
Turn 1: User: "I need a kick drum"
        Agent: [calls search_samples_lexical with tags:["kick"]]
        Agent: "Here are 5 kicks -- ranging from punchy acoustic to deep 808s.
                What vibe are you going for?"

Turn 2: User: "Something dark and subby, for a trap beat"
        Agent: [calls search_samples_semantic with "dark sub-heavy kick trap"]
        Agent: "Found 4 that match. #2 is a pitched 808 with long decay,
                #3 is more of a distorted sub kick."

Turn 3: User: "More like #2 but shorter decay"
        Agent: [calls refine_search with liked:[#2], adjustment:"shorter decay"]
        Agent: "These 3 have similar tone but tighter. Or I can generate one --
                want me to create a custom 808 with short decay?"

Turn 4: User: "Yeah generate one"
        Agent: [calls generate_sound with "808 kick, dark, sub-heavy, short decay, trap"]
        Agent: "Here are 2 variations. Preview them and let me know."

Turn 5: User: "First one is perfect, save it as 'Dark 808 Short'"
        Agent: [calls save_sample]
        Agent: "Saved to your library as 'Dark 808 Short' with tags: 808, kick, dark, trap, sub."
```

### Session State Management

The conversation history IS the session state. But we need to be smart about what stays in context.

```typescript
interface SessionContext {
  // Carried in conversation messages (LLM sees these)
  conversationHistory: Message[];

  // Carried server-side (LLM does NOT see these directly, injected as needed)
  lastSearchResults: Sample[];          // For "more like #3" references
  lastGeneratedSounds: GeneratedSound[]; // For "save the first one"
  activeFilters: {                       // Sticky filters within a session
    bpm?: number;
    key?: string;
    genre?: string;
  };
}
```

**Critical pattern: numbered references.** When the agent shows results, it numbers them. When the user says "#2" or "the second one," the agent can resolve this against `lastSearchResults`. This should be handled in the tool execution layer, not by the LLM:

```typescript
// Before sending user message to LLM, resolve references
function resolveReferences(userMessage: string, session: SessionContext): string {
  // Replace "#3" or "sample 3" or "the third one" with actual sample info
  return userMessage.replace(/#(\d+)|sample (\d+)/gi, (match, n1, n2) => {
    const idx = parseInt(n1 || n2) - 1;
    const sample = session.lastSearchResults[idx];
    return sample ? `[Sample: ${sample.name} (id: ${sample.id})]` : match;
  });
}
```

### Session Lifecycle

- **New session**: Load user preferences via `get_user_preferences`. Inject a brief context: "This user primarily makes trap beats and favors dark tones."
- **Within session**: Maintain full conversation history. Compress after 20+ turns.
- **Session end**: Log all interactions to the feedback system (Section 5). No explicit "end" -- sessions time out after inactivity.
- **Cross-session**: User preferences persist. Conversation history does NOT persist between sessions (clean slate, but personalized).

---

## 7. Practical Recommendations for POC

### Minimal Viable Agent Architecture

```
                    +------------------+
                    |   Next.js App    |
                    |   (Frontend)     |
                    +--------+---------+
                             |
                             | Chat UI + Audio Player
                             |
                    +--------+---------+
                    |   API Route      |
                    |   /api/chat      |
                    +--------+---------+
                             |
                    +--------+---------+
                    |   Agent Loop     |
                    |  (Vercel AI SDK) |
                    +--------+---------+
                             |
              +--------------+--------------+
              |              |              |
        +-----+----+  +-----+----+  +------+-----+
        | SQLite   |  | sqlite-  |  | ElevenLabs |
        | FTS5     |  | vec      |  | SFX API    |
        | (lexical)|  | (vector) |  | (generate) |
        +----------+  +----------+  +------------+
```

### Tech Stack

| Layer | Choice | Why |
|-------|--------|-----|
| LLM | Claude Sonnet | Best tool use, fast, cost-effective |
| Framework | Vercel AI SDK v6 | Streaming, tool loops, TypeScript |
| Lexical search | SQLite FTS5 | Zero infra, fast, built-in |
| Vector search | sqlite-vec | Same DB, no separate vector service |
| Embeddings | text-embedding-3-small (OpenAI) or Voyage | Cheap, good quality for text |
| Sound generation | ElevenLabs SFX v2 | 48kHz, up to 30s, looping support |
| Audio storage | Local filesystem or S3 | Whatever is simplest |
| User preferences | SQLite (same DB) | Keep it all in one place |
| Frontend | Next.js + Tailwind | Fast to build, good streaming support |

### POC Scope -- Build This First

1. **Agent loop** with 3 tools: `search_samples_lexical`, `search_samples_semantic`, `generate_sound`
2. **Sample library** of ~500-1000 samples with descriptions and tags (use Splice/Freesound metadata as a starting point)
3. **System prompt** with the vibe translation table
4. **Chat UI** with audio preview (inline `<audio>` elements)
5. **One SQLite database** for everything: samples metadata, FTS index, vector embeddings, user data

### POC Scope -- Add Later

- `refine_search` with Rocchio refinement (after basic search works)
- `save_sample` and `get_user_preferences` (after storage is figured out)
- Feedback loop and metadata enrichment (after you have real users)
- Audio-based similarity search (CLAP embeddings, after text-based search is proven)
- Multi-modal input ("make something that sounds like this" + audio upload)

### Cost Estimate (Per User Session)

| Component | Cost |
|-----------|------|
| Claude Sonnet (avg 5 turns, ~2k tokens/turn) | ~$0.03 |
| Embeddings (3-4 queries) | ~$0.001 |
| ElevenLabs SFX (1 generation) | ~$0.15 |
| **Total per session** | **~$0.18** |

### Files to Create

```
src/
  agent/
    loop.ts          # Agent loop (or just use Vercel AI SDK generateText)
    tools/
      search-lexical.ts
      search-semantic.ts
      generate-sound.ts
      refine-search.ts
      save-sample.ts
      user-preferences.ts
    system-prompt.ts  # The system prompt constant
    types.ts          # Shared types
  db/
    schema.sql        # SQLite schema: samples, embeddings, users, events
    samples.ts        # Sample CRUD + FTS queries
    vectors.ts        # Vector search via sqlite-vec
    events.ts         # Interaction event logging
  lib/
    elevenlabs.ts     # ElevenLabs API client
    embeddings.ts     # Embedding generation
```

### Non-Negotiable Principles

1. **The agent loop is simple**. If it is more than 100 lines, you are over-engineering.
2. **Tools are pure functions**. They take input, return output. No side effects beyond their stated purpose. No LLM calls inside tools.
3. **The system prompt does the heavy lifting**. Most "agent behavior" issues are prompt issues, not code issues.
4. **SQLite for everything in the POC**. One process, one database, zero infrastructure. Migrate to Postgres + pgvector when you need to.
5. **Stream the final response, not the tool calls**. Users do not need to see "Searching..." for 200ms. Just show the answer.

---

## Sources

- [Claude Tool Use Documentation](https://platform.claude.com/docs/en/agents-and-tools/tool-use/overview)
- [Anthropic Agent SDK Overview](https://platform.claude.com/docs/en/agent-sdk/overview)
- [Anthropic Agent SDK - Agent Loop](https://platform.claude.com/docs/en/agent-sdk/agent-loop)
- [Building Agents with the Claude Agent SDK](https://www.anthropic.com/engineering/building-agents-with-the-claude-agent-sdk)
- [OpenAI Agents SDK](https://openai.github.io/openai-agents-python/)
- [OpenAI Agents SDK Guide](https://developers.openai.com/api/docs/guides/agents-sdk/)
- [Vercel AI SDK 6](https://vercel.com/blog/ai-sdk-6)
- [Vercel AI SDK - Agent Loop Control](https://ai-sdk.dev/docs/agents/loop-control)
- [LangGraph Agent Orchestration](https://www.langchain.com/langgraph)
- [ElevenLabs Sound Effects API](https://elevenlabs.io/docs/eleven-api/guides/cookbooks/sound-effects)
- [ElevenLabs Sound Effects Documentation](https://elevenlabs.io/docs/overview/capabilities/sound-effects)
- [Vector Search for Audio Information Retrieval (Elastic)](https://www.elastic.co/search-labs/blog/searching-by-music-leveraging-vector-search-audio-information-retrieval)
- [Audio Embedding Models Guide (Zilliz)](https://zilliz.com/learn/top-10-most-used-embedding-models-for-audio-data)
- [Effective Context Engineering for AI Agents (Anthropic)](https://www.anthropic.com/engineering/effective-context-engineering-for-ai-agents)
- [Context Engineering Guide (Prompting Guide)](https://www.promptingguide.ai/guides/context-engineering-guide)
