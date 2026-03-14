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


class CatalogTreeTests(unittest.TestCase):
    def _make_catalog_lines(self):
        """Return JSONL lines for a small test catalog."""
        return [
            json.dumps({
                "id": "kick-001", "title": "Boom Kick", "category": "kick",
                "audioPath": "samples/library/kick/boom.wav",
                "tags": [], "attributes": {},
            }),
            json.dumps({
                "id": "kick-002", "title": "Alpha Kick", "category": "kick",
                "audioPath": "samples/library/kick/alpha.wav",
                "tags": [], "attributes": {},
            }),
            json.dumps({
                "id": "snare-001", "title": "Crisp Snare", "category": "snare",
                "audioPath": "samples/library/snare/crisp.wav",
                "tags": [], "attributes": {},
            }),
        ]

    def test_catalog_tree_returns_200(self):
        client = TestClient(app)
        catalog_content = "\n".join(self._make_catalog_lines()) + "\n"
        with patch("builtins.open", unittest.mock.mock_open(read_data=catalog_content)):
            response = client.get("/catalog/tree")
        self.assertEqual(response.status_code, 200)

    def test_catalog_tree_has_categories_key(self):
        client = TestClient(app)
        catalog_content = "\n".join(self._make_catalog_lines()) + "\n"
        with patch("builtins.open", unittest.mock.mock_open(read_data=catalog_content)):
            data = client.get("/catalog/tree").json()
        self.assertIn("categories", data)
        self.assertIsInstance(data["categories"], dict)

    def test_catalog_tree_groups_by_category(self):
        client = TestClient(app)
        catalog_content = "\n".join(self._make_catalog_lines()) + "\n"
        with patch("builtins.open", unittest.mock.mock_open(read_data=catalog_content)):
            data = client.get("/catalog/tree").json()
        cats = data["categories"]
        # Two categories: kick (2 samples) and snare (1 sample)
        self.assertEqual(set(cats.keys()), {"kick", "snare"})
        self.assertEqual(len(cats["kick"]), 2)
        self.assertEqual(len(cats["snare"]), 1)

    def test_catalog_tree_sorts_categories_alphabetically(self):
        client = TestClient(app)
        catalog_content = "\n".join(self._make_catalog_lines()) + "\n"
        with patch("builtins.open", unittest.mock.mock_open(read_data=catalog_content)):
            data = client.get("/catalog/tree").json()
        category_keys = list(data["categories"].keys())
        self.assertEqual(category_keys, sorted(category_keys))

    def test_catalog_tree_sorts_samples_by_title(self):
        client = TestClient(app)
        catalog_content = "\n".join(self._make_catalog_lines()) + "\n"
        with patch("builtins.open", unittest.mock.mock_open(read_data=catalog_content)):
            data = client.get("/catalog/tree").json()
        kicks = data["categories"]["kick"]
        # "Alpha Kick" should come before "Boom Kick"
        self.assertEqual(kicks[0]["title"], "Alpha Kick")
        self.assertEqual(kicks[1]["title"], "Boom Kick")

    def test_catalog_tree_sample_has_required_fields(self):
        client = TestClient(app)
        catalog_content = "\n".join(self._make_catalog_lines()) + "\n"
        with patch("builtins.open", unittest.mock.mock_open(read_data=catalog_content)):
            data = client.get("/catalog/tree").json()
        sample = data["categories"]["snare"][0]
        self.assertEqual(set(sample.keys()), {"id", "title", "audioPath"})


if __name__ == "__main__":
    unittest.main()
