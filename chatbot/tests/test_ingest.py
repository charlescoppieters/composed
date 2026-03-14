"""Tests for the Cymatics sample pack ingest pipeline."""

import json
import tempfile
import unittest
import zipfile
from pathlib import Path

from sample_agent.ingest import (
    _extract_bpm_key,
    _is_stem_or_midi,
    _pack_name_from_zip,
    _slugify,
    build_sidecar,
    infer_category,
    ingest_pack,
)
from sample_agent.schema import ALLOWED_CATEGORIES


class PackNameTests(unittest.TestCase):
    def test_orchid(self):
        self.assertEqual(_pack_name_from_zip(Path("Cymatics-Orchid-SamplePack.zip")), "Orchid")

    def test_venom(self):
        self.assertEqual(_pack_name_from_zip(Path("Cymatics-Venom-OneShotCollection.zip")), "Venom")

    def test_infinity(self):
        self.assertEqual(_pack_name_from_zip(Path("Cymatics-INFINITY-BetaPack2.0.zip")), "INFINITY")


class InferCategoryFromFolderTests(unittest.TestCase):
    """Test category inference from Orchid-style folder structure."""

    def test_drum_one_shot_kick(self):
        path = "Cymatics - Orchid - Sample Pack/Drum One Shots/Kick - Clean (F).wav"
        self.assertEqual(infer_category(path), "kick")

    def test_drum_one_shot_snare(self):
        path = "Cymatics - Orchid - Sample Pack/Drum One Shots/Snare - Tight (C).wav"
        self.assertEqual(infer_category(path), "snare")

    def test_drum_one_shot_clap(self):
        path = "Cymatics - Orchid - Sample Pack/Drum One Shots/Clap - Dusty 1.wav"
        self.assertEqual(infer_category(path), "clap")

    def test_drum_one_shot_hihat(self):
        path = "Cymatics - Orchid - Sample Pack/Drum One Shots/Hihat - Bright 3.wav"
        self.assertEqual(infer_category(path), "hat")

    def test_drum_one_shot_perc(self):
        path = "Cymatics - Orchid - Sample Pack/Drum One Shots/Perc - Knock 2.wav"
        self.assertEqual(infer_category(path), "perc")

    def test_808_bass(self):
        path = "Cymatics - Orchid - Sample Pack/808s & Basses/Cymatics - Orchid 808 Deep (C).wav"
        self.assertEqual(infer_category(path), "808")

    def test_bass_from_808_folder(self):
        path = "Cymatics - Orchid - Sample Pack/808s & Basses/Cymatics - Orchid BASS Warm (C).wav"
        self.assertEqual(infer_category(path), "bass")

    def test_melody_loop(self):
        path = "Cymatics - Orchid - Sample Pack/Melody Loops/Cymatics - Orchid Melody 1 - 140 BPM Cmin.wav"
        self.assertEqual(infer_category(path), "loop_melody")

    def test_drum_loop(self):
        path = "Cymatics - Orchid - Sample Pack/Drum Loops/Cymatics - Orchid Drums 1 - 140 BPM.wav"
        self.assertEqual(infer_category(path), "loop_drum")

    def test_guitar_loop(self):
        path = "Cymatics - Orchid - Sample Pack/Guitar Loops/Cymatics - Orchid Guitar 1 - 130 BPM Amin.wav"
        self.assertEqual(infer_category(path), "loop_guitar")

    def test_hihat_loop(self):
        path = "Cymatics - Orchid - Sample Pack/Hihat Loops/Cymatics - Orchid Hats 1 - 140 BPM.wav"
        self.assertEqual(infer_category(path), "loop_hihat")

    def test_percussion_loop(self):
        path = "Cymatics - Orchid - Sample Pack/Percussion Loops/Cymatics - Orchid Perc 1 - 140 BPM.wav"
        self.assertEqual(infer_category(path), "loop_perc")

    def test_vocal_loop(self):
        path = "Cymatics - Orchid - Sample Pack/Vocal Loops/Cymatics - Orchid Vocal 1 - 130 BPM Dmin.wav"
        self.assertEqual(infer_category(path), "loop_vocal")

    def test_fx_impact(self):
        path = "Cymatics - Orchid - Sample Pack/FX/Impact 1.wav"
        self.assertEqual(infer_category(path), "impact")

    def test_fx_atmosphere(self):
        path = "Cymatics - Orchid - Sample Pack/FX/Atmosphere 1.wav"
        self.assertEqual(infer_category(path), "texture")

    def test_fx_transition(self):
        path = "Cymatics - Orchid - Sample Pack/FX/Transition - 130 BPM Amin.wav"
        self.assertEqual(infer_category(path), "transition")

    def test_one_shot_keys(self):
        path = "Cymatics - Orchid - Sample Pack/One Shots/Cymatics - Orchid KEYS Soft (C).wav"
        self.assertEqual(infer_category(path), "keys")

    def test_one_shot_pad(self):
        path = "Cymatics - Orchid - Sample Pack/One Shots/Cymatics - Orchid PAD Warm (C).wav"
        self.assertEqual(infer_category(path), "pad")

    def test_one_shot_pluck(self):
        path = "Cymatics - Orchid - Sample Pack/One Shots/Cymatics - Orchid PLUCK Bright (C).wav"
        self.assertEqual(infer_category(path), "pluck")


class InferCategoryVenomTests(unittest.TestCase):
    """Test category inference for Venom flat structure."""

    def test_keys(self):
        path = "Cymatics - Venom KEYS Dreamy (C).wav"
        self.assertEqual(infer_category(path), "keys")

    def test_pad(self):
        path = "Cymatics - Venom PAD Warm (C).wav"
        self.assertEqual(infer_category(path), "pad")

    def test_synth(self):
        path = "Cymatics - Venom SYNTH Dark (C).wav"
        self.assertEqual(infer_category(path), "synth")

    def test_bell(self):
        path = "Cymatics - Venom BELL Soft (C).wav"
        self.assertEqual(infer_category(path), "bell")

    def test_pluck(self):
        path = "Cymatics - Venom PLUCK Bright (C).wav"
        self.assertEqual(infer_category(path), "pluck")

    def test_instr(self):
        path = "Cymatics - Venom INSTR Piano (C).wav"
        self.assertEqual(infer_category(path), "instrument")

    def test_lead(self):
        path = "Cymatics - Venom LEAD Sharp (C).wav"
        self.assertEqual(infer_category(path), "synth")


class InferCategoryInfinityTests(unittest.TestCase):
    """Test category inference for INFINITY collection structure."""

    def test_drum_collection(self):
        path = "INFINITY/Infinity Drum Collection/Cymatics - Drums 1 - 140 BPM.wav"
        self.assertEqual(infer_category(path), "loop_drum")

    def test_guitar_collection(self):
        path = "INFINITY/Infinity Guitar Collection/Cymatics - Guitar 1 - 130 BPM Amin.wav"
        self.assertEqual(infer_category(path), "loop_guitar")

    def test_melody_collection(self):
        path = "INFINITY/Infinity Melody Collection/Cymatics - Melody 1 - 150 BPM Cmin.wav"
        self.assertEqual(infer_category(path), "loop_melody")

    def test_vocal_collection(self):
        path = "INFINITY/Infinity Vocal Collection/Cymatics - Vocal 1 - 120 BPM Emin.wav"
        self.assertEqual(infer_category(path), "loop_vocal")


class InferCategoryStemsTests(unittest.TestCase):
    def test_stems_folder(self):
        path = "Cymatics - Orchid - Sample Pack/Stems & MIDI/Melody 1/Bass.wav"
        self.assertEqual(infer_category(path), "stem_melody")

    def test_is_stem_or_midi_true(self):
        self.assertTrue(_is_stem_or_midi("Pack/Stems & MIDI/Melody/Bass.wav"))
        self.assertTrue(_is_stem_or_midi("Pack/Stems/Drums.wav"))
        self.assertTrue(_is_stem_or_midi("Pack/Song.mid"))

    def test_is_stem_or_midi_false(self):
        self.assertFalse(_is_stem_or_midi("Pack/Drum One Shots/Kick.wav"))
        self.assertFalse(_is_stem_or_midi("Pack/Melody Loops/Melody 1 - 140 BPM.wav"))


class ExtractBpmKeyTests(unittest.TestCase):
    def test_bpm_and_key(self):
        bpm, key = _extract_bpm_key("Cymatics - Melody 1 - 140 BPM Cmin.wav")
        self.assertEqual(bpm, 140)
        self.assertEqual(key, "Cmin")

    def test_bpm_only(self):
        bpm, key = _extract_bpm_key("Cymatics - Drums 1 - 140 BPM.wav")
        self.assertEqual(bpm, 140)
        self.assertIsNone(key)

    def test_no_bpm(self):
        bpm, key = _extract_bpm_key("Kick - Clean (F).wav")
        self.assertIsNone(bpm)
        self.assertIsNone(key)


class SlugifyTests(unittest.TestCase):
    def test_basic(self):
        self.assertEqual(_slugify("Kick - Clean"), "kick-clean")

    def test_special_chars(self):
        self.assertEqual(_slugify("808 Deep (C)"), "808-deep-c")


class BuildSidecarTests(unittest.TestCase):
    def test_produces_valid_metadata(self):
        sidecar = build_sidecar(
            rel_path="Pack/Drum One Shots/Kick - Clean (F).wav",
            category="kick",
            pack_name="Orchid",
            dest_audio_path="samples/library/kick/Kick - Clean (F).wav",
        )
        self.assertEqual(sidecar["category"], "kick")
        self.assertTrue(sidecar["audioPath"].startswith("samples/library/"))
        self.assertEqual(sidecar["sourceType"], "local")
        self.assertEqual(sidecar["sourceRef"]["pack"], "Orchid")
        self.assertIn("kick", sidecar["tags"])
        self.assertIn("orchid", sidecar["tags"])

    def test_loop_sidecar_has_bpm_tag(self):
        sidecar = build_sidecar(
            rel_path="Pack/Melody Loops/Cymatics - Melody 1 - 140 BPM Cmin.wav",
            category="loop_melody",
            pack_name="Orchid",
            dest_audio_path="samples/library/loop_melody/Cymatics - Melody 1 - 140 BPM Cmin.wav",
        )
        self.assertIn("140bpm", sidecar["tags"])
        self.assertIn("cmin", sidecar["tags"])

    def test_category_must_be_allowed(self):
        """build_sidecar calls validate_sample_metadata, which rejects bad categories."""
        with self.assertRaises(ValueError):
            build_sidecar(
                rel_path="Pack/Unknown/foo.wav",
                category="banjo",
                pack_name="Test",
                dest_audio_path="samples/library/banjo/foo.wav",
            )

    def test_all_inferred_categories_are_allowed(self):
        """Every category that infer_category can return must be in ALLOWED_CATEGORIES."""
        from sample_agent.ingest import FOLDER_CATEGORY_MAP, TYPE_PREFIX_MAP

        for cat in FOLDER_CATEGORY_MAP.values():
            self.assertIn(cat, ALLOWED_CATEGORIES, f"FOLDER_CATEGORY_MAP value '{cat}' not allowed")
        for cat in TYPE_PREFIX_MAP.values():
            self.assertIn(cat, ALLOWED_CATEGORIES, f"TYPE_PREFIX_MAP value '{cat}' not allowed")


class IngestPackTests(unittest.TestCase):
    def _make_zip(self, tmp: Path, files: list[str]) -> Path:
        """Create a test zip with the given relative paths (all fake WAVs)."""
        zip_path = tmp / "Cymatics-TestPack-SamplePack.zip"
        with zipfile.ZipFile(zip_path, "w") as zf:
            for rel in files:
                zf.writestr(rel, b"RIFF" + b"\x00" * 40)
        return zip_path

    def test_dry_run_returns_metadata_without_copying(self):
        with tempfile.TemporaryDirectory() as tmp:
            tmp = Path(tmp)
            zip_path = self._make_zip(tmp, [
                "TestPack/Drum One Shots/Kick - Clean (F).wav",
                "TestPack/Melody Loops/Cymatics - Melody 1 - 140 BPM Cmin.wav",
            ])
            library = tmp / "samples" / "library"
            results = ingest_pack(
                zip_path,
                library_root=library,
                staging_dir=tmp / "_staging",
                dry_run=True,
            )
            self.assertEqual(len(results), 2)
            # No files should be created in dry_run
            self.assertFalse(library.exists())

    def test_actual_ingest_copies_files(self):
        with tempfile.TemporaryDirectory() as tmp:
            tmp = Path(tmp)
            zip_path = self._make_zip(tmp, [
                "TestPack/Drum One Shots/Kick - Hard 1.wav",
            ])
            library = tmp / "samples" / "library"
            results = ingest_pack(
                zip_path,
                library_root=library,
                staging_dir=tmp / "_staging",
                dry_run=False,
            )
            self.assertEqual(len(results), 1)
            self.assertEqual(results[0]["category"], "kick")
            # Audio file should exist
            audio_dest = library / "kick" / "Kick - Hard 1.wav"
            self.assertTrue(audio_dest.exists())
            # Sidecar should exist
            sidecar_dest = audio_dest.with_suffix(".json")
            self.assertTrue(sidecar_dest.exists())
            sidecar_data = json.loads(sidecar_dest.read_text())
            self.assertEqual(sidecar_data["category"], "kick")

    def test_skip_stems_excludes_stems(self):
        with tempfile.TemporaryDirectory() as tmp:
            tmp = Path(tmp)
            zip_path = self._make_zip(tmp, [
                "TestPack/Drum One Shots/Kick - Clean (F).wav",
                "TestPack/Stems & MIDI/Melody 1/Bass.wav",
                "TestPack/Stems & MIDI/Melody 1/Drums.wav",
            ])
            results = ingest_pack(
                zip_path,
                library_root=tmp / "samples" / "library",
                staging_dir=tmp / "_staging",
                skip_stems=True,
                dry_run=True,
            )
            self.assertEqual(len(results), 1)
            self.assertEqual(results[0]["category"], "kick")

    def test_skip_stems_false_includes_stems(self):
        with tempfile.TemporaryDirectory() as tmp:
            tmp = Path(tmp)
            zip_path = self._make_zip(tmp, [
                "TestPack/Stems & MIDI/Melody 1/Bass.wav",
            ])
            results = ingest_pack(
                zip_path,
                library_root=tmp / "samples" / "library",
                staging_dir=tmp / "_staging",
                skip_stems=False,
                dry_run=True,
            )
            self.assertEqual(len(results), 1)


if __name__ == "__main__":
    unittest.main()
