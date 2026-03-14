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
