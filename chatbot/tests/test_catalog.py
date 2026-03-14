import json
import tempfile
import unittest
from pathlib import Path

from sample_agent.catalog import build_catalog, load_sidecar


class CatalogTests(unittest.TestCase):
    def test_load_sidecar_returns_normalized_metadata(self):
        with tempfile.TemporaryDirectory() as temp_dir:
            root = Path(temp_dir)
            audio_path = root / "samples" / "library" / "drums" / "snare" / "snare-001.wav"
            audio_path.parent.mkdir(parents=True, exist_ok=True)
            audio_path.write_bytes(b"RIFF")

            sidecar_path = audio_path.with_suffix(".json")
            sidecar_path.write_text(
                json.dumps(
                    {
                        "id": "snare-001",
                        "audioPath": str(audio_path.relative_to(root)),
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

            metadata = load_sidecar(sidecar_path)

            self.assertEqual(metadata["id"], "snare-001")
            self.assertEqual(metadata["audioPath"], "samples/library/drums/snare/snare-001.wav")

    def test_build_catalog_writes_sorted_jsonl(self):
        with tempfile.TemporaryDirectory() as temp_dir:
            root = Path(temp_dir)
            samples_root = root / "samples"
            output_path = samples_root / "_index" / "catalog.jsonl"

            for sample_id in ("snare-002", "snare-001"):
                audio_path = samples_root / "library" / "drums" / "snare" / f"{sample_id}.wav"
                audio_path.parent.mkdir(parents=True, exist_ok=True)
                audio_path.write_bytes(b"RIFF")
                audio_path.with_suffix(".json").write_text(
                    json.dumps(
                        {
                            "id": sample_id,
                            "audioPath": str(audio_path.relative_to(root)),
                            "title": sample_id,
                            "freeTextDescription": f"{sample_id} description",
                            "tags": ["snare"],
                            "category": "snare",
                            "attributes": {"tone": ["dark"]},
                            "sourceType": "local",
                        }
                    ),
                    encoding="utf-8",
                )

            rows = build_catalog(samples_root, output_path)

            self.assertEqual([row["id"] for row in rows], ["snare-001", "snare-002"])
            written_rows = [
                json.loads(line)
                for line in output_path.read_text(encoding="utf-8").splitlines()
            ]
            self.assertEqual([row["id"] for row in written_rows], ["snare-001", "snare-002"])

    def test_build_catalog_excludes_generated_samples_by_default(self):
        with tempfile.TemporaryDirectory() as temp_dir:
            root = Path(temp_dir)
            samples_root = root / "samples"
            output_path = samples_root / "_index" / "catalog.jsonl"

            local_audio = samples_root / "library" / "drums" / "snare" / "snare-001.wav"
            local_audio.parent.mkdir(parents=True, exist_ok=True)
            local_audio.write_bytes(b"RIFF")
            local_audio.with_suffix(".json").write_text(
                json.dumps(
                    {
                        "id": "snare-001",
                        "audioPath": "samples/library/drums/snare/snare-001.wav",
                        "title": "Local Snare",
                        "freeTextDescription": "Local curated sample.",
                        "tags": ["snare"],
                        "category": "snare",
                        "attributes": {"tone": ["dark"]},
                        "sourceType": "local",
                    }
                ),
                encoding="utf-8",
            )

            generated_audio = samples_root / "generated" / "snare" / "gen-001.wav"
            generated_audio.parent.mkdir(parents=True, exist_ok=True)
            generated_audio.write_bytes(b"RIFF")
            generated_audio.with_suffix(".json").write_text(
                json.dumps(
                    {
                        "id": "gen-001",
                        "audioPath": "samples/generated/snare/gen-001.wav",
                        "title": "Generated Snare",
                        "freeTextDescription": "Generated sample.",
                        "tags": ["snare"],
                        "category": "snare",
                        "attributes": {"tone": ["bright"]},
                        "sourceType": "generated",
                    }
                ),
                encoding="utf-8",
            )

            rows = build_catalog(samples_root, output_path)

            self.assertEqual([row["id"] for row in rows], ["snare-001"])


if __name__ == "__main__":
    unittest.main()
