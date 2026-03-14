"""Server-Sent Events formatting and SDK event mapping."""

import json
import time

# Track tool call start times for duration calculation
_tool_start_times: dict[str, float] = {}


def format_sse(event_type: str, data: dict) -> str:
    """Format a single SSE event string."""
    return f"event: {event_type}\ndata: {json.dumps(data)}\n\n"


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
