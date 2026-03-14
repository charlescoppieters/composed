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


if __name__ == "__main__":
    unittest.main()
