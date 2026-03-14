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
