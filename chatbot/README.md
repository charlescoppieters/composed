# Sample Agent MVP

A metadata-first, agent-driven workflow for finding local sound samples. Includes a streaming API server and drop-in React chat widget for frontend integration.

## What is included

- A validated sample metadata schema.
- A JSONL catalog builder for sidecar metadata.
- A local search and reranking helper for natural-language queries.
- A feedback command that writes notes and tags back to sample sidecars.
- An OpenAI Agents SDK agent with a system prompt for retrieval.
- A FastAPI server with SSE streaming for real-time chat.
- A React chat bubble component (`chat-widget/`) for Next.js integration.

## Directory layout

- `sample_agent/` — core Python package (agent, server, retrieval, schema, CLI).
- `chat-widget/` — drop-in React component for frontends.
- `samples/library/` — local audio assets and JSON sidecars.
- `samples/_index/` — generated search artifacts like `catalog.jsonl`.
- `samples/generated/` — reserved for future AI-generated outputs.
- `prompts/` — agent system prompt.
- `docs/` — taxonomy and integration notes.

## Quick Start

```bash
# Install
uv venv --python 3.13 .venv
source .venv/bin/activate
uv pip install -e .

# Build catalog
python3 -m sample_agent.cli build-catalog --samples-root samples --output samples/_index/catalog.jsonl

# Start the streaming server
uvicorn sample_agent.server:app --port 8000
```

## CLI Commands

```bash
# Search directly
python3 -m sample_agent.cli search --catalog samples/_index/catalog.jsonl --query "dusty snare with short tail"

# Search relative to a reference sample
python3 -m sample_agent.cli search --catalog samples/_index/catalog.jsonl --query "something brighter and more roomy" --reference-sample-id snare-001

# Write user feedback
python3 -m sample_agent.cli feedback --samples-root samples --sample-id snare-001 --note "Great for layered choruses." --tags "favorite,layering"

# Interactive REPL agent
python3 -m sample_agent.agent
```

## Chat Widget Integration

Copy `chat-widget/SampleChat.tsx` into your Next.js app and add it to your layout:

```tsx
import SampleChat from "@/components/SampleChat";

export default function Layout({ children }) {
  return (
    <>
      {children}
      <SampleChat apiUrl="http://localhost:8000" />
    </>
  );
}
```

See `chat-widget/README.md` for full props and configuration.
