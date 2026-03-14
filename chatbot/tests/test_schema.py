import unittest

from sample_agent.schema import (
    metadata_path_for_audio,
    sample_library_layout,
    validate_sample_metadata,
)


class ValidateSampleMetadataTests(unittest.TestCase):
    def test_normalizes_valid_metadata_for_local_sample(self):
        payload = {
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
                "sourceFeel": ["acoustic"],
            },
            "sourceType": "local",
            "sourceRef": {"importBatch": "starter-pack"},
            "userNotes": ["Good for indie grooves"],
        }

        normalized = validate_sample_metadata(payload)

        self.assertEqual(normalized["id"], "snare-001")
        self.assertEqual(normalized["category"], "snare")
        self.assertEqual(normalized["sourceType"], "local")
        self.assertEqual(normalized["tags"], ["dusty", "indie", "snare"])
        self.assertIn("createdAt", normalized)
        self.assertIn("updatedAt", normalized)

    def test_rejects_unknown_category(self):
        payload = {
            "id": "odd-001",
            "audioPath": "samples/library/misc/odd-001.wav",
            "title": "Odd Sample",
            "freeTextDescription": "Not in the allowed categories.",
            "tags": ["odd"],
            "category": "banjo",
            "attributes": {"tone": ["bright"]},
            "sourceType": "local",
        }

        with self.assertRaises(ValueError):
            validate_sample_metadata(payload)

    def test_rejects_unknown_attribute_value(self):
        payload = {
            "id": "snare-002",
            "audioPath": "samples/library/drums/snare/snare-002.wav",
            "title": "Impossible Snare",
            "freeTextDescription": "Should fail on unsupported attribute value.",
            "tags": ["snare"],
            "category": "snare",
            "attributes": {"tone": ["purple"]},
            "sourceType": "local",
        }

        with self.assertRaises(ValueError):
            validate_sample_metadata(payload)

    def test_rejects_generated_source_outside_generated_root(self):
        payload = {
            "id": "gen-001",
            "audioPath": "samples/library/drums/snare/gen-001.wav",
            "title": "Generated Snare",
            "freeTextDescription": "A generated snare stored in the wrong place.",
            "tags": ["snare"],
            "category": "snare",
            "attributes": {"tone": ["bright"]},
            "sourceType": "generated",
        }

        with self.assertRaises(ValueError):
            validate_sample_metadata(payload)


class FolderConventionTests(unittest.TestCase):
    def test_maps_audio_path_to_sidecar_path(self):
        self.assertEqual(
            metadata_path_for_audio("samples/library/drums/snare/snare-001.wav"),
            "samples/library/drums/snare/snare-001.json",
        )

    def test_exposes_expected_library_layout(self):
        layout = sample_library_layout()

        self.assertEqual(layout["libraryRoot"], "samples/library")
        self.assertEqual(layout["generatedRoot"], "samples/generated")
        self.assertEqual(layout["indexRoot"], "samples/_index")
        self.assertIn("samples/_templates", layout["templateRoots"])


if __name__ == "__main__":
    unittest.main()
