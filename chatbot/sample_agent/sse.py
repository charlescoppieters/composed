"""Server-Sent Events formatting and SDK event mapping."""

import json


def format_sse(event_type: str, data: dict) -> str:
    """Format a single SSE event string."""
    return f"event: {event_type}\ndata: {json.dumps(data)}\n\n"
