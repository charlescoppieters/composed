# Composed — AI Sample Retrieval Agent

## What This Is

A music production assistant that finds audio samples via natural language. Users describe sounds ("dark kick", "spacey pad", "melody loop 90 bpm") and the agent searches a local sample library using token-based retrieval.

## Quick Start

```bash
uv venv --python 3.13 .venv
source .venv/bin/activate
uv pip install -e .
python3 -m sample_agent.agent
```

Requires `OPENAI_API_KEY` in `.env`.

## Architecture

```
User query → GPT-5.4 (OpenAI Agents SDK) → @function_tool calls → CLI commands → Token-based search over JSONL catalog → Ranked results
```

### Key Files

| File | Purpose |
|------|---------|
| `sample_agent/agent.py` | OpenAI Agents SDK agent with REPL, 4 tools |
| `sample_agent/schema.py` | Metadata validation, 37 categories, attribute axes |
| `sample_agent/retrieval.py` | Token-based search + scoring over catalog |
| `sample_agent/catalog.py` | Builds JSONL catalog from JSON sidecars |
| `sample_agent/cli.py` | CLI: `build-catalog`, `search`, `feedback` |
| `sample_agent/ingest.py` | Cymatics pack ingestion (unzip → categorize → sidecar) |
| `prompts/sample-retrieval.md` | System prompt with vibe table + taxonomy |
| `samples/_index/catalog.jsonl` | Search index (299 rows) |
| `samples/library/{category}/` | Audio files + JSON sidecars |

### Agent Tools

| Tool | What it does |
|------|-------------|
| `search_samples(query, limit)` | Lexical search over catalog |
| `search_similar(query, ref_id, limit)` | Search with reference sample bias |
| `add_feedback(sample_id, note, tags)` | Save user notes/tags to sidecar |
| `list_categories()` | Show all categories with counts |

## Sample Library

299 samples from 3 Cymatics packs (Orchid, Venom, Infinity). Organized by category:

- **Percussion (63):** kick, snare, clap, hat, perc, crash, ride, rimshot, shaker, snap
- **Bass (15):** 808, bass
- **Melodic (58):** keys, lead, pad, pluck, synth, bell
- **Loops (142):** loop_drum, loop_melody, loop_guitar, loop_hihat, loop_perc, loop_vocal
- **FX (17):** impact, transition, texture
- **Vocals (4):** vocal

See `docs/sample-taxonomy.md` for full taxonomy with descriptions and vibe translation table.

## Commands

```bash
# Run the agent
python3 -m sample_agent.agent

# Build catalog from sidecars
python3 -m sample_agent.cli build-catalog --samples-root samples --output samples/_index/catalog.jsonl

# Search directly
python3 -m sample_agent.cli search --catalog samples/_index/catalog.jsonl --query "dark kick"

# Add feedback
python3 -m sample_agent.cli feedback --samples-root samples --sample-id kick-001 --note "Great" --tags "favorite"

# Ingest new Cymatics packs
python3 -c "from sample_agent.ingest import ingest_pack; ingest_pack('tracks/NewPack.zip')"
```

## Conventions

- Python 3.10+, managed with `uv`
- OpenAI Agents SDK (`openai-agents`) for agent harness
- GPT-5.4 as the LLM
- JSON sidecars next to each audio file are the source of truth
- JSONL catalog is a derived artifact (rebuild with `build-catalog`)
- Tests: `python3 -m pytest tests/ -v`
