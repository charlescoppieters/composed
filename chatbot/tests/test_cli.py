import io
import json
import tempfile
import unittest
from contextlib import redirect_stdout
from pathlib import Path

from sample_agent.cli import main


class CliTests(unittest.TestCase):
    def test_build_catalog_command_creates_jsonl_index(self):
        with tempfile.TemporaryDirectory() as temp_dir:
            root = Path(temp_dir)
            samples_root = root / "samples"
            audio_path = samples_root / "library" / "drums" / "snare" / "snare-001.wav"
            audio_path.parent.mkdir(parents=True, exist_ok=True)
            audio_path.write_bytes(b"RIFF")
            audio_path.with_suffix(".json").write_text(
                json.dumps(
                    {
                        "id": "snare-001",
                        "audioPath": "samples/library/drums/snare/snare-001.wav",
                        "title": "Dusty Indie Snare",
                        "freeTextDescription": "A dry, dusty snare with a short tail.",
                        "tags": ["dusty", "snare"],
                        "category": "snare",
                        "attributes": {"tone": ["dark"], "envelope": ["short"]},
                        "sourceType": "local",
                    }
                ),
                encoding="utf-8",
            )

            stdout = io.StringIO()
            with redirect_stdout(stdout):
                exit_code = main(
                    [
                        "build-catalog",
                        "--samples-root",
                        str(samples_root),
                        "--output",
                        str(samples_root / "_index" / "catalog.jsonl"),
                    ]
                )

            self.assertEqual(exit_code, 0)
            self.assertIn("snare-001", (samples_root / "_index" / "catalog.jsonl").read_text())

    def test_search_command_prints_ranked_results(self):
        with tempfile.TemporaryDirectory() as temp_dir:
            root = Path(temp_dir)
            catalog_path = root / "catalog.jsonl"
            catalog_path.write_text(
                "\n".join(
                    [
                        json.dumps(
                            {
                                "id": "snare-001",
                                "audioPath": "samples/library/drums/snare/snare-001.wav",
                                "title": "Dusty Indie Snare",
                                "freeTextDescription": "A dry, dusty snare with a short tail.",
                                "tags": ["dusty", "snare"],
                                "category": "snare",
                                "attributes": {"tone": ["dark"], "envelope": ["short"]},
                                "sourceType": "local",
                            }
                        ),
                        json.dumps(
                            {
                                "id": "impact-001",
                                "audioPath": "samples/library/fx/impact/impact-001.wav",
                                "title": "Huge Impact",
                                "freeTextDescription": "A cinematic impact.",
                                "tags": ["impact"],
                                "category": "impact",
                                "attributes": {"tone": ["dark"], "envelope": ["long"]},
                                "sourceType": "local",
                            }
                        ),
                    ]
                ),
                encoding="utf-8",
            )

            stdout = io.StringIO()
            with redirect_stdout(stdout):
                exit_code = main(
                    [
                        "search",
                        "--catalog",
                        str(catalog_path),
                        "--query",
                        "dusty snare",
                    ]
                )

            self.assertEqual(exit_code, 0)
            self.assertIn("snare-001", stdout.getvalue())

    def test_feedback_command_updates_sidecar_metadata(self):
        with tempfile.TemporaryDirectory() as temp_dir:
            root = Path(temp_dir)
            samples_root = root / "samples"
            audio_path = samples_root / "library" / "drums" / "snare" / "snare-001.wav"
            audio_path.parent.mkdir(parents=True, exist_ok=True)
            audio_path.write_bytes(b"RIFF")
            sidecar_path = audio_path.with_suffix(".json")
            sidecar_path.write_text(
                json.dumps(
                    {
                        "id": "snare-001",
                        "audioPath": "samples/library/drums/snare/snare-001.wav",
                        "title": "Dusty Indie Snare",
                        "freeTextDescription": "A dry, dusty snare with a short tail.",
                        "tags": ["dusty", "snare"],
                        "category": "snare",
                        "attributes": {"tone": ["dark"], "envelope": ["short"]},
                        "sourceType": "local",
                    }
                ),
                encoding="utf-8",
            )

            stdout = io.StringIO()
            with redirect_stdout(stdout):
                exit_code = main(
                    [
                        "feedback",
                        "--samples-root",
                        str(samples_root),
                        "--sample-id",
                        "snare-001",
                        "--note",
                        "Great for layered choruses.",
                        "--tags",
                        "favorite,layering",
                    ]
                )

            updated = json.loads(sidecar_path.read_text(encoding="utf-8"))
            self.assertEqual(exit_code, 0)
            self.assertIn("Great for layered choruses.", updated["userNotes"])
            self.assertEqual(updated["tags"], ["dusty", "favorite", "layering", "snare"])


if __name__ == "__main__":
    unittest.main()
