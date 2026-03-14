# Streaming Chat Widget Implementation Plan

> **For agentic workers:** REQUIRED: Use superpowers:subagent-driven-development (if subagents available) or superpowers:executing-plans to implement this plan. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a FastAPI streaming server and drop-in React chat bubble component so the sample agent can be integrated into the team's Next.js app with real-time tool-call visualization.

**Architecture:** Python FastAPI microservice wraps the existing OpenAI Agents SDK agent with SSE streaming. A self-contained React component (`<SampleChat />`) renders as a floating chat bubble, consumes the SSE stream, and displays tool trace cards with live spinners. The component ships as a single `.tsx` file with inline styles — zero dependencies beyond React.

**Tech Stack:** FastAPI + uvicorn (Python server), OpenAI Agents SDK streaming (`Runner.run_streamed`), Server-Sent Events protocol, React 18+ (TypeScript component)

---

## File Map

| File | Action | Responsibility |
|------|--------|---------------|
| `sample_agent/server.py` | Create | FastAPI app, CORS, `/chat/stream` SSE endpoint, `/health` |
| `sample_agent/sse.py` | Create | SSE formatting helper, SDK event-to-SSE event mapper |
| `chat-widget/SampleChat.tsx` | Create | Self-contained React floating bubble + chat panel + tool cards |
| `chat-widget/README.md` | Create | Integration instructions for the team |
| `pyproject.toml` | Modify | Add `fastapi`, `uvicorn` dependencies |
| `sample_agent/agent.py` | Modify | Extract shared `create_agent()`, keep REPL as-is, add async support |
| `prompts/sample-retrieval.md` | Modify | Add concise response formatting guidance for chat UI |
| `tests/test_sse.py` | Create | Unit tests for SSE formatting + event mapping |
| `tests/test_server.py` | Create | Integration tests for streaming endpoint |
| `CLAUDE.md` | Modify | Document server + widget in project docs |

---

## Chunk 1: SSE Event Layer

### Task 1: SSE Formatting Helper

**Files:**
- Create: `sample_agent/sse.py`
- Test: `tests/test_sse.py`

- [ ] **Step 1: Write failing tests for SSE formatting**

```python
# tests/test_sse.py
import json
import unittest

from sample_agent.sse import format_sse


class FormatSseTests(unittest.TestCase):
    def test_formats_event_with_type_and_json_data(self):
        result = format_sse("token", {"content": "hello"})
        self.assertEqual(result, 'event: token\ndata: {"content": "hello"}\n\n')

    def test_formats_event_with_empty_data(self):
        result = format_sse("done", {})
        self.assertEqual(result, "event: done\ndata: {}\n\n")

    def test_formats_event_with_nested_data(self):
        result = format_sse("tool_start", {"name": "search", "args": {"query": "kick"}})
        parsed = json.loads(result.split("data: ")[1].split("\n")[0])
        self.assertEqual(parsed["name"], "search")
        self.assertEqual(parsed["args"]["query"], "kick")
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `python3 -m pytest tests/test_sse.py -v`
Expected: FAIL — `ModuleNotFoundError: No module named 'sample_agent.sse'`

- [ ] **Step 3: Implement `format_sse`**

```python
# sample_agent/sse.py
"""Server-Sent Events formatting and SDK event mapping."""

import json


def format_sse(event_type: str, data: dict) -> str:
    """Format a single SSE event string."""
    return f"event: {event_type}\ndata: {json.dumps(data)}\n\n"
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `python3 -m pytest tests/test_sse.py -v`
Expected: 3 PASSED

- [ ] **Step 5: Commit**

```bash
git add sample_agent/sse.py tests/test_sse.py
git commit -m "feat: add SSE formatting helper"
```

---

### Task 2: SDK Stream Event Mapper

**Files:**
- Modify: `sample_agent/sse.py`
- Test: `tests/test_sse.py`

- [ ] **Step 1: Write failing tests for event mapping**

```python
# Append to tests/test_sse.py

from unittest.mock import MagicMock
from sample_agent.sse import map_stream_event


class MapStreamEventTests(unittest.TestCase):
    def test_maps_tool_call_item_to_tool_start(self):
        event = MagicMock()
        event.type = "run_item_stream_event"
        event.name = "tool_called"
        event.item.type = "tool_call_item"
        event.item.raw_item = {"name": "search_samples", "arguments": '{"query": "dark kick"}'}

        result = map_stream_event(event)
        self.assertIsNotNone(result)
        self.assertEqual(result["event"], "tool_start")
        self.assertEqual(result["data"]["name"], "search_samples")

    def test_maps_tool_output_to_tool_end(self):
        event = MagicMock()
        event.type = "run_item_stream_event"
        event.name = "tool_output"
        event.item.type = "tool_call_output_item"
        event.item.raw_item = {"output": "results here"}
        event.item.agent.name = "Sample Agent"

        result = map_stream_event(event)
        self.assertIsNotNone(result)
        self.assertEqual(result["event"], "tool_end")

    def test_maps_text_delta_to_token(self):
        event = MagicMock()
        event.type = "raw_response_event"
        event.data.type = "response.output_item.delta"
        event.data.delta = "Hello"

        result = map_stream_event(event)
        self.assertIsNotNone(result)
        self.assertEqual(result["event"], "token")
        self.assertEqual(result["data"]["content"], "Hello")

    def test_returns_none_for_unhandled_events(self):
        event = MagicMock()
        event.type = "agent_updated_stream_event"

        result = map_stream_event(event)
        self.assertIsNone(result)
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `python3 -m pytest tests/test_sse.py::MapStreamEventTests -v`
Expected: FAIL — `ImportError: cannot import name 'map_stream_event'`

- [ ] **Step 3: Implement `map_stream_event`**

```python
# Add to sample_agent/sse.py
import json
import time

# Track tool call start times for duration calculation
_tool_start_times: dict[str, float] = {}


def map_stream_event(event) -> dict | None:
    """Map an OpenAI Agents SDK StreamEvent to an SSE event dict.

    Returns {"event": str, "data": dict} or None if the event should be skipped.
    """
    if event.type == "run_item_stream_event":
        if event.name == "tool_called" and event.item.type == "tool_call_item":
            raw = event.item.raw_item
            name = raw.get("name", "") if isinstance(raw, dict) else getattr(raw, "name", "")
            args_str = raw.get("arguments", "{}") if isinstance(raw, dict) else getattr(raw, "arguments", "{}")
            try:
                args = json.loads(args_str) if isinstance(args_str, str) else args_str
            except json.JSONDecodeError:
                args = {"raw": args_str}
            call_id = raw.get("call_id", "") if isinstance(raw, dict) else getattr(raw, "call_id", "")
            _tool_start_times[call_id] = time.time()
            return {"event": "tool_start", "data": {"name": name, "args": args, "id": call_id}}

        if event.name == "tool_output" and event.item.type == "tool_call_output_item":
            raw = event.item.raw_item
            call_id = raw.get("call_id", "") if isinstance(raw, dict) else getattr(raw, "call_id", "")
            start = _tool_start_times.pop(call_id, None)
            duration_ms = int((time.time() - start) * 1000) if start else 0
            return {"event": "tool_end", "data": {"id": call_id, "duration_ms": duration_ms}}

        if event.name == "message_output_created":
            return None  # Content comes via raw token events

    elif event.type == "raw_response_event":
        delta_type = getattr(event.data, "type", "")
        if delta_type == "response.output_item.delta":
            delta = getattr(event.data, "delta", "")
            if delta:
                return {"event": "token", "data": {"content": delta}}

    return None
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `python3 -m pytest tests/test_sse.py -v`
Expected: 7 PASSED

- [ ] **Step 5: Commit**

```bash
git add sample_agent/sse.py tests/test_sse.py
git commit -m "feat: add SDK stream event to SSE mapper"
```

---

## Chunk 2: FastAPI Streaming Server

### Task 3: Add Server Dependencies

**Files:**
- Modify: `pyproject.toml`

- [ ] **Step 1: Add fastapi and uvicorn to dependencies**

Add `"fastapi>=0.115"` and `"uvicorn>=0.34"` to the `dependencies` list in `pyproject.toml`.

- [ ] **Step 2: Install updated dependencies**

Run: `source .venv/bin/activate && uv pip install -e .`
Expected: Successfully installed fastapi, uvicorn, and their dependencies

- [ ] **Step 3: Commit**

```bash
git add pyproject.toml
git commit -m "chore: add fastapi and uvicorn dependencies"
```

---

### Task 4: FastAPI Server with SSE Streaming

**Files:**
- Create: `sample_agent/server.py`
- Modify: `sample_agent/agent.py` (extract `create_agent` for reuse — already exists, may need minor async adjustment)
- Test: `tests/test_server.py`

- [ ] **Step 1: Write failing integration tests for server**

```python
# tests/test_server.py
"""Integration tests for the streaming server."""

import json
import unittest
from unittest.mock import patch, AsyncMock, MagicMock

from fastapi.testclient import TestClient

from sample_agent.server import app


class HealthTests(unittest.TestCase):
    def test_health_endpoint_returns_ok(self):
        client = TestClient(app)
        response = client.get("/health")
        self.assertEqual(response.status_code, 200)
        data = response.json()
        self.assertEqual(data["status"], "ok")


class ChatStreamTests(unittest.TestCase):
    def test_stream_endpoint_returns_sse_content_type(self):
        client = TestClient(app)
        with patch("sample_agent.server._run_agent_stream") as mock_stream:
            async def fake_stream(message, model):
                yield 'event: token\ndata: {"content": "hi"}\n\n'
                yield 'event: done\ndata: {"thread_id": "test"}\n\n'

            mock_stream.return_value = fake_stream("test", "gpt-5.4")

            response = client.post(
                "/chat/stream",
                json={"message": "find me a kick"},
            )
            self.assertEqual(response.status_code, 200)
            self.assertIn("text/event-stream", response.headers["content-type"])

    def test_stream_endpoint_rejects_empty_message(self):
        client = TestClient(app)
        response = client.post("/chat/stream", json={"message": ""})
        self.assertEqual(response.status_code, 422)
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `python3 -m pytest tests/test_server.py -v`
Expected: FAIL — `ModuleNotFoundError: No module named 'sample_agent.server'`

- [ ] **Step 3: Implement the server**

```python
# sample_agent/server.py
"""FastAPI server with SSE streaming for the Sample Agent."""

import asyncio
import json
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


async def _run_agent_stream(message: str, model: str):
    """Run the agent with streaming and yield SSE events."""
    agent = create_agent(model=model)
    result = Runner.run_streamed(agent, message)
    tool_calls = []

    try:
        async for event in result.stream_events():
            mapped = map_stream_event(event)
            if mapped:
                if mapped["event"] == "tool_start":
                    tool_calls.append(mapped["data"])
                yield format_sse(mapped["event"], mapped["data"])
    except Exception as exc:
        yield format_sse("error", {"message": str(exc), "type": type(exc).__name__})

    yield format_sse("done", {
        "tool_calls": tool_calls,
        "final_output": result.final_output if result.is_complete else None,
    })


@app.post("/chat/stream")
async def chat_stream(request: ChatRequest):
    """Stream agent response via Server-Sent Events."""
    return StreamingResponse(
        _run_agent_stream(request.message, request.model),
        media_type="text/event-stream",
        headers={"Cache-Control": "no-cache", "X-Accel-Buffering": "no"},
    )
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `python3 -m pytest tests/test_server.py -v`
Expected: 3 PASSED

- [ ] **Step 5: Verify server starts manually**

Run: `source .venv/bin/activate && timeout 5 python3 -m uvicorn sample_agent.server:app --port 8000 2>&1 || true`
Expected: Server starts, prints "Uvicorn running on http://127.0.0.1:8000"

- [ ] **Step 6: Commit**

```bash
git add sample_agent/server.py tests/test_server.py
git commit -m "feat: add FastAPI server with SSE streaming endpoint"
```

---

## Chunk 3: React Chat Widget

### Task 5: Drop-in React Chat Bubble Component

**Files:**
- Create: `chat-widget/SampleChat.tsx`
- Create: `chat-widget/README.md`

- [ ] **Step 1: Create the self-contained React component**

The component must:
- Render as a floating bubble (bottom-right corner)
- Expand into a chat panel on click
- Stream tokens with live text rendering
- Show tool trace cards with spinner → completed transition
- Use inline styles only (no external CSS)
- Accept a single `apiUrl` prop
- Be a single file — copy-pasteable into any Next.js project

```tsx
// chat-widget/SampleChat.tsx
"use client";

import React, { useState, useRef, useEffect, useCallback } from "react";

// --- Types ---

interface ToolCall {
  name: string;
  args: Record<string, unknown>;
  id: string;
  duration_ms?: number;
  status: "running" | "done";
}

interface Message {
  role: "user" | "assistant";
  content: string;
  toolCalls?: ToolCall[];
}

interface SampleChatProps {
  apiUrl: string;
  title?: string;
  placeholder?: string;
  accentColor?: string;
}

// --- SSE Parser ---

function parseSSE(
  text: string,
  onEvent: (type: string, data: Record<string, unknown>) => void
) {
  const blocks = text.split("\n\n");
  for (const block of blocks) {
    if (!block.trim()) continue;
    let eventType = "message";
    let dataStr = "";
    for (const line of block.split("\n")) {
      if (line.startsWith("event: ")) eventType = line.slice(7);
      else if (line.startsWith("data: ")) dataStr = line.slice(6);
    }
    if (dataStr) {
      try {
        onEvent(eventType, JSON.parse(dataStr));
      } catch {
        /* skip malformed */
      }
    }
  }
}

// --- Hook ---

function useSampleChat(apiUrl: string) {
  const [messages, setMessages] = useState<Message[]>([]);
  const [isStreaming, setIsStreaming] = useState(false);
  const abortRef = useRef<AbortController | null>(null);

  const sendMessage = useCallback(
    async (text: string) => {
      const userMsg: Message = { role: "user", content: text };
      setMessages((prev) => [...prev, userMsg]);
      setIsStreaming(true);

      const assistantMsg: Message = { role: "assistant", content: "", toolCalls: [] };
      setMessages((prev) => [...prev, assistantMsg]);

      const controller = new AbortController();
      abortRef.current = controller;
      let buffer = "";
      let tokenBuffer = "";
      const toolMap = new Map<string, ToolCall>();

      try {
        const res = await fetch(`${apiUrl}/chat/stream`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ message: text }),
          signal: controller.signal,
        });

        const reader = res.body?.getReader();
        if (!reader) throw new Error("No response body");

        const decoder = new TextDecoder();
        while (true) {
          const { done, value } = await reader.read();
          if (done) break;

          buffer += decoder.decode(value, { stream: true });
          const parts = buffer.split("\n\n");
          buffer = parts.pop() || "";

          for (const part of parts) {
            if (!part.trim()) continue;
            parseSSE(part + "\n\n", (type, data) => {
              if (type === "token") {
                tokenBuffer += (data.content as string) || "";
                setMessages((prev) => {
                  const updated = [...prev];
                  const last = { ...updated[updated.length - 1] };
                  last.content = tokenBuffer;
                  updated[updated.length - 1] = last;
                  return updated;
                });
              } else if (type === "tool_start") {
                const tool: ToolCall = {
                  name: (data.name as string) || "",
                  args: (data.args as Record<string, unknown>) || {},
                  id: (data.id as string) || "",
                  status: "running",
                };
                toolMap.set(tool.id, tool);
                setMessages((prev) => {
                  const updated = [...prev];
                  const last = { ...updated[updated.length - 1] };
                  last.toolCalls = Array.from(toolMap.values());
                  updated[updated.length - 1] = last;
                  return updated;
                });
              } else if (type === "tool_end") {
                const id = data.id as string;
                const existing = toolMap.get(id);
                if (existing) {
                  existing.status = "done";
                  existing.duration_ms = data.duration_ms as number;
                  setMessages((prev) => {
                    const updated = [...prev];
                    const last = { ...updated[updated.length - 1] };
                    last.toolCalls = Array.from(toolMap.values());
                    updated[updated.length - 1] = last;
                    return updated;
                  });
                }
              }
            });
          }
        }
      } catch (err) {
        if ((err as Error).name !== "AbortError") {
          setMessages((prev) => {
            const updated = [...prev];
            const last = { ...updated[updated.length - 1] };
            last.content = last.content || "Sorry, something went wrong. Please try again.";
            updated[updated.length - 1] = last;
            return updated;
          });
        }
      } finally {
        setIsStreaming(false);
        abortRef.current = null;
      }
    },
    [apiUrl]
  );

  const cancel = useCallback(() => {
    abortRef.current?.abort();
    setIsStreaming(false);
  }, []);

  return { messages, sendMessage, isStreaming, cancel };
}

// --- Styles ---

const STYLES = {
  bubble: {
    position: "fixed" as const,
    bottom: 24,
    right: 24,
    width: 56,
    height: 56,
    borderRadius: "50%",
    border: "none",
    cursor: "pointer",
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    fontSize: 24,
    boxShadow: "0 4px 20px rgba(0,0,0,0.25)",
    zIndex: 9999,
    transition: "transform 0.2s",
  },
  panel: {
    position: "fixed" as const,
    bottom: 92,
    right: 24,
    width: 400,
    maxHeight: 560,
    borderRadius: 16,
    boxShadow: "0 8px 40px rgba(0,0,0,0.2)",
    display: "flex",
    flexDirection: "column" as const,
    overflow: "hidden",
    zIndex: 9998,
    background: "#1a1a2e",
    color: "#e0e0e0",
    fontFamily: "-apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif",
    fontSize: 14,
  },
  header: {
    padding: "14px 18px",
    fontWeight: 600,
    fontSize: 15,
    borderBottom: "1px solid rgba(255,255,255,0.08)",
  },
  messages: {
    flex: 1,
    overflowY: "auto" as const,
    padding: "12px 14px",
    display: "flex",
    flexDirection: "column" as const,
    gap: 10,
  },
  userMsg: {
    alignSelf: "flex-end" as const,
    padding: "8px 14px",
    borderRadius: "16px 16px 4px 16px",
    maxWidth: "80%",
    wordBreak: "break-word" as const,
  },
  assistantMsg: {
    alignSelf: "flex-start" as const,
    padding: "8px 14px",
    background: "rgba(255,255,255,0.06)",
    borderRadius: "16px 16px 16px 4px",
    maxWidth: "88%",
    wordBreak: "break-word" as const,
    whiteSpace: "pre-wrap" as const,
  },
  toolCard: {
    margin: "4px 0",
    padding: "6px 10px",
    borderRadius: 8,
    background: "rgba(255,255,255,0.04)",
    border: "1px solid rgba(255,255,255,0.08)",
    fontSize: 12,
    fontFamily: "'SF Mono', 'Fira Code', monospace",
  },
  toolName: {
    fontWeight: 600,
    display: "flex",
    alignItems: "center",
    gap: 6,
  },
  toolArgs: {
    marginTop: 3,
    opacity: 0.6,
    fontSize: 11,
    overflow: "hidden" as const,
    textOverflow: "ellipsis" as const,
    whiteSpace: "nowrap" as const,
  },
  inputRow: {
    display: "flex",
    gap: 8,
    padding: "10px 14px",
    borderTop: "1px solid rgba(255,255,255,0.08)",
  },
  input: {
    flex: 1,
    padding: "8px 12px",
    borderRadius: 10,
    border: "1px solid rgba(255,255,255,0.15)",
    background: "rgba(255,255,255,0.06)",
    color: "#e0e0e0",
    fontSize: 14,
    outline: "none",
  },
  sendBtn: {
    padding: "8px 16px",
    borderRadius: 10,
    border: "none",
    cursor: "pointer",
    fontWeight: 600,
    fontSize: 14,
    color: "#fff",
  },
};

// --- Components ---

function ToolTraceCard({ tool }: { tool: ToolCall }) {
  const isRunning = tool.status === "running";
  return (
    <div style={STYLES.toolCard}>
      <div style={STYLES.toolName}>
        {isRunning ? (
          <span style={{ animation: "spin 1s linear infinite", display: "inline-block" }}>&#9696;</span>
        ) : (
          <span style={{ color: "#4ade80" }}>&#10003;</span>
        )}
        {tool.name}
        {!isRunning && tool.duration_ms != null && (
          <span style={{ opacity: 0.5, fontWeight: 400, marginLeft: "auto" }}>
            {tool.duration_ms}ms
          </span>
        )}
      </div>
      <div style={STYLES.toolArgs}>
        {Object.entries(tool.args)
          .map(([k, v]) => `${k}: ${JSON.stringify(v)}`)
          .join(", ")}
      </div>
    </div>
  );
}

// --- Main Component ---

export default function SampleChat({
  apiUrl,
  title = "Sample Agent",
  placeholder = "Describe a sound...",
  accentColor = "#6c63ff",
}: SampleChatProps) {
  const [isOpen, setIsOpen] = useState(false);
  const [input, setInput] = useState("");
  const { messages, sendMessage, isStreaming } = useSampleChat(apiUrl);
  const bottomRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  const handleSend = () => {
    const text = input.trim();
    if (!text || isStreaming) return;
    setInput("");
    sendMessage(text);
  };

  return (
    <>
      {/* Spinner keyframes injected once */}
      <style>{`@keyframes spin { to { transform: rotate(360deg) } }`}</style>

      {/* Chat Panel */}
      {isOpen && (
        <div style={STYLES.panel}>
          <div style={{ ...STYLES.header, background: accentColor }}>{title}</div>
          <div style={STYLES.messages}>
            {messages.map((msg, i) => (
              <div key={i}>
                {msg.role === "user" ? (
                  <div style={{ ...STYLES.userMsg, background: accentColor }}>{msg.content}</div>
                ) : (
                  <div>
                    {msg.toolCalls?.map((tool, j) => (
                      <ToolTraceCard key={j} tool={tool} />
                    ))}
                    {msg.content && <div style={STYLES.assistantMsg}>{msg.content}</div>}
                  </div>
                )}
              </div>
            ))}
            <div ref={bottomRef} />
          </div>
          <div style={STYLES.inputRow}>
            <input
              style={STYLES.input}
              value={input}
              onChange={(e) => setInput(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && handleSend()}
              placeholder={placeholder}
              disabled={isStreaming}
            />
            <button
              style={{ ...STYLES.sendBtn, background: accentColor, opacity: isStreaming ? 0.5 : 1 }}
              onClick={handleSend}
              disabled={isStreaming}
            >
              {isStreaming ? "..." : "Send"}
            </button>
          </div>
        </div>
      )}

      {/* Floating Bubble */}
      <button
        style={{ ...STYLES.bubble, background: accentColor }}
        onClick={() => setIsOpen(!isOpen)}
        aria-label={isOpen ? "Close chat" : "Open chat"}
      >
        {isOpen ? "\u2715" : "\u266B"}
      </button>
    </>
  );
}
```

- [ ] **Step 2: Create integration README**

```markdown
<!-- chat-widget/README.md -->
# Sample Agent Chat Widget

A self-contained React component for integrating the Sample Agent into any Next.js app.

## Quick Start

1. Copy `SampleChat.tsx` into your project (e.g., `components/SampleChat.tsx`)
2. Import and render it in your layout:

\```tsx
import SampleChat from "@/components/SampleChat";

export default function Layout({ children }) {
  return (
    <>
      {children}
      <SampleChat apiUrl="http://localhost:8000" />
    </>
  );
}
\```

3. Start the Python agent server:

\```bash
cd composed/
source .venv/bin/activate
uvicorn sample_agent.server:app --port 8000
\```

## Props

| Prop | Type | Default | Description |
|------|------|---------|-------------|
| `apiUrl` | `string` | required | Base URL of the Sample Agent API |
| `title` | `string` | `"Sample Agent"` | Header text in the chat panel |
| `placeholder` | `string` | `"Describe a sound..."` | Input placeholder text |
| `accentColor` | `string` | `"#6c63ff"` | Primary color for bubble, buttons, and user messages |

## Features

- Floating chat bubble (bottom-right corner)
- Real-time token streaming
- Tool trace cards with live spinners and completion timing
- Zero external dependencies (inline styles, no CSS imports)
- Dark theme optimized for music production apps
```

- [ ] **Step 3: Commit**

```bash
git add chat-widget/
git commit -m "feat: add drop-in React chat bubble component with SSE streaming"
```

---

## Chunk 4: Harness Improvements & Docs

### Task 6: Improve System Prompt for Chat UI

**Files:**
- Modify: `prompts/sample-retrieval.md`

- [ ] **Step 1: Add chat-friendly formatting guidance to the system prompt**

Append to the end of `prompts/sample-retrieval.md`:

```markdown
## Response Formatting

When presenting search results:
- Lead with a brief natural-language summary (1 sentence)
- List top results with ID, title, category, and why it matched
- Keep responses concise — users see this in a small chat window
- Use the sample's ID so users can reference it later
```

- [ ] **Step 2: Commit**

```bash
git add prompts/sample-retrieval.md
git commit -m "docs: add chat-friendly response formatting guidance to system prompt"
```

---

### Task 7: Update Project Documentation

**Files:**
- Modify: `CLAUDE.md`

- [ ] **Step 1: Add server and widget documentation to CLAUDE.md**

Add a new section after "Commands":

```markdown
## Server

```bash
# Start the streaming API server
uvicorn sample_agent.server:app --port 8000

# Health check
curl http://localhost:8000/health
```

### API Endpoints

| Endpoint | Method | Description |
|----------|--------|-------------|
| `/health` | GET | Health check |
| `/chat/stream` | POST | SSE streaming chat (body: `{"message": "..."}`) |

### SSE Event Protocol

| Event | Data | Description |
|-------|------|-------------|
| `tool_start` | `{name, args, id}` | Tool invocation started |
| `tool_end` | `{id, duration_ms}` | Tool completed |
| `token` | `{content}` | Streamed text token |
| `error` | `{message, type}` | Error occurred |
| `done` | `{tool_calls, final_output}` | Stream complete |

## Chat Widget

See `chat-widget/README.md` for integration instructions. Copy `SampleChat.tsx` into your Next.js app and point it at the server URL.
```

- [ ] **Step 2: Commit**

```bash
git add CLAUDE.md
git commit -m "docs: add server and chat widget documentation"
```

---

## Chunk 5: Adversarial Testing

### Task 8: End-to-End Retrieval Quality Tests

**Files:**
- Create: `tests/test_retrieval_quality.py`

- [ ] **Step 1: Write adversarial search quality tests**

These tests verify that natural-language queries return relevant results from the actual catalog (not mocks). They test the full retrieval pipeline.

```python
# tests/test_retrieval_quality.py
"""Adversarial tests for retrieval quality over the real catalog."""

import json
import unittest
from pathlib import Path

from sample_agent.retrieval import search_catalog

CATALOG_PATH = Path(__file__).parent.parent / "samples" / "_index" / "catalog.jsonl"


def _load_catalog():
    if not CATALOG_PATH.exists():
        return []
    return [
        json.loads(line)
        for line in CATALOG_PATH.read_text(encoding="utf-8").splitlines()
        if line.strip()
    ]


@unittest.skipUnless(CATALOG_PATH.exists(), "catalog.jsonl not found")
class RetrievalQualityTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.catalog = _load_catalog()

    def _search(self, query, limit=5, ref_id=None):
        return search_catalog(self.catalog, query, limit=limit, reference_sample_id=ref_id)

    def _assert_top_categories(self, results, expected_categories, n=3):
        """Assert that at least one of the top-n results is in expected categories."""
        top = [r["category"] for r in results[:n]]
        self.assertTrue(
            any(cat in expected_categories for cat in top),
            f"Expected one of {expected_categories} in top {n}, got {top}"
        )

    def test_dark_kick_returns_kicks(self):
        results = self._search("dark kick")
        self._assert_top_categories(results, {"kick"})

    def test_bright_snare_returns_snares(self):
        results = self._search("bright snare with short tail")
        self._assert_top_categories(results, {"snare"})

    def test_spacey_pad_returns_pads(self):
        results = self._search("spacey pad")
        self._assert_top_categories(results, {"pad"})

    def test_melody_loop_90_bpm_returns_loops(self):
        results = self._search("melody loop 90 bpm")
        self._assert_top_categories(results, {"loop_melody"})

    def test_punchy_808_returns_808_or_bass(self):
        results = self._search("punchy 808")
        self._assert_top_categories(results, {"808", "bass"})

    def test_crispy_hihat_returns_hats(self):
        results = self._search("crispy hi hat")
        self._assert_top_categories(results, {"hat", "loop_hihat"})

    def test_cinematic_impact_returns_impacts(self):
        results = self._search("cinematic impact")
        self._assert_top_categories(results, {"impact"})

    def test_guitar_loop_returns_guitar_loops(self):
        results = self._search("guitar loop")
        self._assert_top_categories(results, {"loop_guitar"})

    def test_vocal_chop_returns_vocals(self):
        results = self._search("vocal chop")
        self._assert_top_categories(results, {"vocal", "loop_vocal"})

    def test_transition_riser_returns_fx(self):
        results = self._search("transition riser")
        self._assert_top_categories(results, {"transition", "riser", "impact"})

    def test_vibe_query_warm_analog_returns_relevant(self):
        """Vibe-based queries should still return results."""
        results = self._search("warm analog")
        self.assertGreater(len(results), 0)
        self.assertGreater(results[0]["score"], 0)

    def test_similar_search_excludes_reference(self):
        """Similar search should never return the reference sample itself."""
        if not self.catalog:
            self.skipTest("Empty catalog")
        ref_id = self.catalog[0]["id"]
        results = self._search("something similar", ref_id=ref_id, limit=10)
        result_ids = [r["id"] for r in results]
        self.assertNotIn(ref_id, result_ids)

    def test_drum_loop_returns_drum_loops(self):
        results = self._search("drum loop")
        self._assert_top_categories(results, {"loop_drum"})

    def test_clap_returns_claps(self):
        results = self._search("clap")
        self._assert_top_categories(results, {"clap"})
```

- [ ] **Step 2: Run retrieval quality tests**

Run: `python3 -m pytest tests/test_retrieval_quality.py -v`
Expected: All PASSED (if any fail, the retrieval scoring may need tuning — see Task 9)

- [ ] **Step 3: Commit**

```bash
git add tests/test_retrieval_quality.py
git commit -m "test: add adversarial retrieval quality tests over real catalog"
```

---

### Task 9: Fix Retrieval Scoring Issues (if needed)

**Files:**
- Modify: `sample_agent/retrieval.py` (only if Task 8 tests fail)

- [ ] **Step 1: If any retrieval quality tests fail, analyze which queries miss**

Look at the failing tests. Common fixes:
- Add token synonyms to `TOKEN_NORMALIZATION` (e.g., `"crispy": "crisp"`, `"hihat": "hat"`, `"analog": "warm"`)
- Adjust scoring weights if vibe queries score too low

- [ ] **Step 2: Add any needed token normalizations**

Example additions to `TOKEN_NORMALIZATION` in `retrieval.py`:

```python
"crispy": "crisp",
"analog": "warm",  # vibe mapping
"chop": "vocal",   # common producer term
```

- [ ] **Step 3: Re-run tests to verify fixes**

Run: `python3 -m pytest tests/test_retrieval_quality.py -v`
Expected: All PASSED

- [ ] **Step 4: Commit (if changes were made)**

```bash
git add sample_agent/retrieval.py
git commit -m "fix: improve token normalization for retrieval quality"
```

---

## Chunk 6: Repository Cleanup

### Task 10: Clean Up Repository Structure

**Files:**
- Modify: `sample_agent/agent.py` (clean up empty tags issue from audit)
- Modify: `README.md` (align with current state)

- [ ] **Step 1: Fix empty tags CLI arg in agent.py**

In `agent.py`, `add_feedback` tool, change the CLI invocation to omit `--tags` when empty:

```python
@function_tool
def add_feedback(sample_id: str, note: str, tags: str = "") -> str:
    cli_args = [
        "feedback",
        "--samples-root", str(SAMPLES_ROOT),
        "--sample-id", sample_id,
        "--note", note,
    ]
    if tags:
        cli_args += ["--tags", tags]
    return _run_cli(*cli_args)
```

- [ ] **Step 2: Update README.md to reflect current project state**

Replace the directory layout section to include `chat-widget/` and `sample_agent/server.py`. Remove stale references.

- [ ] **Step 3: Run full test suite**

Run: `python3 -m pytest tests/ -v`
Expected: All tests pass

- [ ] **Step 4: Commit**

```bash
git add sample_agent/agent.py README.md
git commit -m "chore: clean up empty tags arg, update README for current state"
```

---

## Execution Order

Tasks 1-2 (SSE layer) → Task 3 (deps) → Task 4 (server) → Task 5 (widget) → Task 6-7 (docs) → Task 8-9 (adversarial tests) → Task 10 (cleanup)

Tasks 5, 6, and 7 can run in parallel since they touch independent files.
Tasks 8-9 should run after 1-4 since they validate the full pipeline.
