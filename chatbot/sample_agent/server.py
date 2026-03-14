"""FastAPI server with SSE streaming for the Sample Agent."""

import json
from collections import defaultdict
from pathlib import Path

from dotenv import load_dotenv
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import StreamingResponse
from pydantic import BaseModel, Field

from agents import Runner
from agents.stream_events import RawResponsesStreamEvent, RunItemStreamEvent

from sample_agent.agent import create_agent
from sample_agent.sse import format_sse, map_stream_event

PROJECT_ROOT = Path(__file__).resolve().parent.parent
CATALOG_PATH = PROJECT_ROOT / "samples" / "_index" / "catalog.jsonl"
load_dotenv(PROJECT_ROOT / ".env")

app = FastAPI(title="Sample Agent API", version="0.1.0")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_methods=["*"],
    allow_headers=["*"],
)


class ChatRequest(BaseModel):
    message: str = Field(..., min_length=1)
    model: str = "gpt-5.4"


@app.get("/health")
async def health():
    return {"status": "ok"}


@app.get("/catalog/tree")
async def catalog_tree():
    """Return the sample library organized by category."""
    categories: dict[str, list[dict]] = defaultdict(list)

    with open(CATALOG_PATH, "r") as f:
        for line in f:
            line = line.strip()
            if not line:
                continue
            entry = json.loads(line)
            categories[entry["category"]].append({
                "id": entry["id"],
                "title": entry["title"],
                "audioPath": entry["audioPath"],
            })

    # Sort samples by title within each category
    for samples in categories.values():
        samples.sort(key=lambda s: s["title"])

    # Return categories sorted alphabetically
    return {"categories": dict(sorted(categories.items()))}


async def _run_agent_stream(message: str, model: str):
    """Run the agent with streaming and yield SSE events."""
    agent = create_agent(model=model)
    result = Runner.run_streamed(agent, message)
    tool_calls = []
    tool_timings: dict[str, float] = {}

    try:
        async for event in result.stream_events():
            mapped = map_stream_event(event, tool_timings)
            if mapped:
                if mapped["event"] == "tool_start":
                    tool_calls.append(mapped["data"])
                yield format_sse(mapped["event"], mapped["data"])
        yield format_sse("done", {
            "tool_calls": tool_calls,
            "final_output": result.final_output if result.is_complete else None,
        })
    except Exception as exc:
        yield format_sse("error", {"message": str(exc), "type": type(exc).__name__})


@app.post("/chat/stream")
async def chat_stream(request: ChatRequest):
    """Stream agent response via Server-Sent Events."""
    return StreamingResponse(
        _run_agent_stream(request.message, request.model),
        media_type="text/event-stream",
        headers={"Cache-Control": "no-cache", "X-Accel-Buffering": "no"},
    )
