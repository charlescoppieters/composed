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
