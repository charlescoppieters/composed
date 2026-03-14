import unittest

from sample_agent.retrieval import apply_feedback, search_catalog


class RetrievalTests(unittest.TestCase):
    def setUp(self):
        self.entries = [
            {
                "id": "snare-001",
                "audioPath": "samples/library/drums/snare/snare-001.wav",
                "title": "Dusty Indie Snare",
                "freeTextDescription": "A dry, dusty snare with a short tail.",
                "tags": ["dusty", "indie", "snare"],
                "category": "snare",
                "attributes": {
                    "tone": ["dark", "warm"],
                    "envelope": ["short", "tight"],
                    "texture": ["dirty"],
                    "space": ["dry"],
                },
                "sourceType": "local",
            },
            {
                "id": "snare-002",
                "audioPath": "samples/library/drums/snare/snare-002.wav",
                "title": "Bright Pop Snare",
                "freeTextDescription": "A bright, crisp snare with some room.",
                "tags": ["bright", "pop", "snare"],
                "category": "snare",
                "attributes": {
                    "tone": ["bright"],
                    "envelope": ["tight"],
                    "texture": ["clean", "crisp"],
                    "space": ["roomy"],
                },
                "sourceType": "local",
            },
            {
                "id": "impact-001",
                "audioPath": "samples/library/fx/impact/impact-001.wav",
                "title": "Huge Impact",
                "freeTextDescription": "A cinematic low-end impact.",
                "tags": ["impact", "cinematic"],
                "category": "impact",
                "attributes": {
                    "tone": ["dark"],
                    "envelope": ["long"],
                    "texture": ["clean"],
                    "space": ["wet"],
                },
                "sourceType": "local",
            },
        ]

    def test_search_catalog_prioritizes_category_and_attributes(self):
        results = search_catalog(self.entries, "dusty snare with short tail", limit=2)

        self.assertEqual([row["id"] for row in results], ["snare-001", "snare-002"])
        self.assertGreater(results[0]["score"], results[1]["score"])

    def test_search_catalog_uses_reference_sample_bias(self):
        results = search_catalog(
            self.entries,
            "something like this but brighter and more roomy",
            limit=2,
            reference_sample_id="snare-001",
        )

        self.assertEqual(results[0]["id"], "snare-002")
        self.assertEqual(results[1]["id"], "snare-001")

    def test_apply_feedback_merges_note_and_tags(self):
        updated = apply_feedback(
            self.entries[0],
            note="Works well layered under crunchy drums.",
            tags=["layering", "favorite"],
        )

        self.assertIn("Works well layered under crunchy drums.", updated["userNotes"])
        self.assertEqual(
            updated["tags"],
            ["dusty", "favorite", "indie", "layering", "snare"],
        )

    def test_search_catalog_uses_user_notes_for_future_retrieval(self):
        self.entries[0]["userNotes"] = ["Perfect for layered choruses."]

        results = search_catalog(self.entries, "layered choruses", limit=1)

        self.assertEqual(results[0]["id"], "snare-001")
        self.assertGreater(results[0]["score"], 0)


if __name__ == "__main__":
    unittest.main()
