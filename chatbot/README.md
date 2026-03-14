# Sample Agent MVP

This repository implements a metadata-first, agent-driven workflow for finding local sound samples.

## What is included

- A validated sample metadata schema.
- A JSONL catalog builder for sidecar metadata.
- A local search and reranking helper for natural-language queries.
- A feedback command that writes notes and tags back to sample sidecars.
- A Claude prompt file for running the retrieval workflow consistently.

## Directory layout

- `samples/library/` stores local audio assets and JSON sidecars.
- `samples/_index/` stores generated search artifacts like `catalog.jsonl`.
- `samples/generated/` is reserved for future AI-generated outputs.
- `samples/_templates/` stores the sidecar template.
- `prompts/` stores the Claude retrieval prompt.
- `docs/` stores taxonomy and future integration notes.

## Commands

Build the catalog:

```bash
python3 -m sample_agent.cli build-catalog --samples-root samples --output samples/_index/catalog.jsonl
```

By default, this catalog only includes `sourceType: "local"` samples, so generated or edited assets do not silently pollute the local-first MVP search flow.

Search the catalog:

```bash
python3 -m sample_agent.cli search --catalog samples/_index/catalog.jsonl --query "dusty snare with short tail"
```

Search relative to a reference sample:

```bash
python3 -m sample_agent.cli search --catalog samples/_index/catalog.jsonl --query "something like this but brighter and more roomy" --reference-sample-id snare-001
```
I w
Write user feedback back to the chosen sample:

```bash
python3 -m sample_agent.cli feedback --samples-root samples --sample-id snare-001 --note "Great for layered choruses." --tags "favorite,layering"
```

Saved notes and tags are indexed on the next catalog rebuild, so retrieval improves over time.
