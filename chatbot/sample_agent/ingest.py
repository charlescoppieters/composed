"""Ingest Cymatics sample packs into the local library."""

import json
import re
import shutil
import zipfile
from pathlib import Path

from sample_agent.schema import ALLOWED_CATEGORIES, validate_sample_metadata


# ---------------------------------------------------------------------------
# Folder-name to category mapping
# ---------------------------------------------------------------------------

FOLDER_CATEGORY_MAP = {
    "808s & basses": "808",
    "808s": "808",
    "basses": "bass",
    "drum one shots": "kick",  # subfolder name refines this
    "drum loops": "loop_drum",
    "fx": "impact",  # subfolder name refines this
    "guitar loops": "loop_guitar",
    "hihat loops": "loop_hihat",
    "melody loops": "loop_melody",
    "one shots": "synth",  # subfolder name refines this
    "percussion loops": "loop_perc",
    "vocal loops": "loop_vocal",
    "stems & midi": "stem_melody",
    "stems": "stem_melody",
    "midi": "midi",
    # INFINITY collection folders
    "infinity drum collection": "loop_drum",
    "infinity guitar collection": "loop_guitar",
    "infinity melody collection": "loop_melody",
    "infinity vocal collection": "loop_vocal",
}

# Map uppercase type prefixes (from filenames) to categories
TYPE_PREFIX_MAP = {
    # Percussion
    "KICK": "kick",
    "SNARE": "snare",
    "CLAP": "clap",
    "HIHAT": "hat",
    "HI HAT": "hat",
    "HIHAT OPEN": "hat",
    "HIHAT CLOSED": "hat",
    "OPEN HIHAT": "hat",
    "CLOSED HIHAT": "hat",
    "OPEN HAT": "hat",
    "CLOSED HAT": "hat",
    "PERC": "perc",
    "PERCUSSION": "perc",
    "TOM": "tom",
    "CRASH": "crash",
    "RIDE": "ride",
    "RIMSHOT": "rimshot",
    "SHAKER": "shaker",
    "SNAP": "snap",
    # Bass
    "808": "808",
    "BASS": "bass",
    "REESE": "bass",
    # Melodic
    "KEYS": "keys",
    "LEAD": "synth",
    "PAD": "pad",
    "PLUCK": "pluck",
    "SYNTH": "synth",
    "BELL": "bell",
    "INSTR": "instrument",
    # FX
    "ATMOSPHERE": "texture",
    "IMPACT": "impact",
    "REVERSE": "transition",
    "TRANSITION": "transition",
    "RISER": "riser",
    "FOLEY": "foley",
}

# BPM + key pattern for loops
_LOOP_RE = re.compile(r"(\d{2,3})\s*BPM\s*([A-G][b#]?\s*(?:min|maj|minor|major)?)?", re.IGNORECASE)

# Melodic one-shot pattern: Cymatics - Pack TYPE Name (C).wav
_ONESHOT_RE = re.compile(
    r"Cymatics\s*-\s*\w+\s+([A-Z][A-Z0-9 ]*?)\s+.+?\(([A-G][b#]?)\)\.wav$",
    re.IGNORECASE,
)

# Drum one-shot pattern: DrumType - Name (Note).wav  or  DrumType N.wav
_DRUM_RE = re.compile(r"^([A-Za-z ]+?)\s*(?:-\s*.+)?(?:\(\w+\))?\.wav$", re.IGNORECASE)


# ---------------------------------------------------------------------------
# Pack name extraction
# ---------------------------------------------------------------------------

def _pack_name_from_zip(zip_path: Path) -> str:
    """Extract a short pack name like 'Orchid' from the zip filename."""
    name = zip_path.stem
    # e.g. "Cymatics-Orchid-SamplePack" -> "Orchid"
    parts = name.replace("Cymatics-", "").replace("Cymatics ", "")
    # Take up to the first dash/hyphen after removing Cymatics
    parts = re.split(r"[-_]", parts)
    return parts[0].strip()


# ---------------------------------------------------------------------------
# Category inference
# ---------------------------------------------------------------------------

def infer_category(rel_path: str, folder_hint: str | None = None) -> str:
    """Infer the library category from a relative file path inside a pack.

    Args:
        rel_path: Relative path within the extracted pack (e.g.
            "Cymatics - Orchid - Sample Pack/Drum One Shots/Kick - Clean (F).wav")
        folder_hint: Optional top-level folder name override for testing.

    Returns:
        A category string from ALLOWED_CATEGORIES.
    """
    parts = Path(rel_path).parts
    filename = parts[-1]

    # 1. Try folder-based mapping first
    if folder_hint:
        folder_key = folder_hint.strip().lower()
    else:
        folder_key = None
        for part in parts[:-1]:  # skip filename
            candidate = part.strip().lower()
            if candidate in FOLDER_CATEGORY_MAP:
                folder_key = candidate
                break

    folder_category = FOLDER_CATEGORY_MAP.get(folder_key) if folder_key else None

    # 2. If folder is stems/MIDI, always trust the folder — don't refine by filename
    if folder_category and folder_category.startswith("stem_"):
        return folder_category
    if folder_key == "midi":
        return "midi"

    # 3. Try to refine with filename patterns

    # Check for BPM pattern -> it's a loop
    bpm_match = _LOOP_RE.search(filename)
    if bpm_match and folder_category and folder_category.startswith("loop_"):
        return folder_category
    if bpm_match and not folder_category:
        # Unknown folder but has BPM -> guess loop_melody
        return "loop_melody"

    # Check for uppercase type prefix in filename
    # Try matching against TYPE_PREFIX_MAP keys (longest first)
    name_no_ext = Path(filename).stem
    for prefix in sorted(TYPE_PREFIX_MAP.keys(), key=len, reverse=True):
        # Match at start of filename or after "Cymatics - Pack "
        patterns = [
            re.compile(rf"^{re.escape(prefix)}\b", re.IGNORECASE),
            re.compile(rf"Cymatics\s*-\s*\w+\s+{re.escape(prefix)}\b", re.IGNORECASE),
        ]
        for pat in patterns:
            if pat.search(name_no_ext):
                candidate = TYPE_PREFIX_MAP[prefix]
                # If folder says it's a drum one-shot area, trust the filename type
                if folder_category in ("kick",) or folder_key == "drum one shots":
                    return candidate
                # If folder says 808/bass area, trust that
                if folder_category in ("808", "bass") and candidate in ("808", "bass"):
                    return candidate
                # If folder says FX, trust the FX sub-type
                if folder_key == "fx":
                    return candidate
                # If folder says one-shots area, trust melodic type
                if folder_key == "one shots":
                    return candidate
                # No folder context -> trust the filename prefix
                if not folder_category:
                    return candidate
                # Folder context exists but doesn't conflict -> use filename
                return candidate

    # 3. Fall back to folder category
    if folder_category:
        return folder_category

    # 4. Last resort: check if any known category word appears in the path
    path_lower = rel_path.lower()
    for cat in sorted(ALLOWED_CATEGORIES, key=len, reverse=True):
        if cat in path_lower:
            return cat

    return "perc"  # safe default for truly unknown files


def _extract_bpm_key(filename: str) -> tuple[int | None, str | None]:
    """Extract BPM and musical key from a filename."""
    m = _LOOP_RE.search(filename)
    if not m:
        return None, None
    bpm = int(m.group(1))
    key = m.group(2).strip() if m.group(2) else None
    return bpm, key


def _slugify(text: str) -> str:
    """Convert text to a URL/ID-safe slug."""
    text = text.lower().strip()
    text = re.sub(r"[^a-z0-9]+", "-", text)
    return text.strip("-")


# ---------------------------------------------------------------------------
# Sidecar generation
# ---------------------------------------------------------------------------

def build_sidecar(
    rel_path: str,
    category: str,
    pack_name: str,
    dest_audio_path: str,
) -> dict:
    """Build a validated sidecar metadata dict for one sample.

    Args:
        rel_path: Original relative path inside the extracted pack.
        category: Inferred category.
        pack_name: Short pack name (e.g. "Orchid").
        dest_audio_path: Destination path starting with "samples/library/".

    Returns:
        Validated metadata dict ready to be written as JSON.
    """
    filename = Path(rel_path).stem
    # Clean up title: remove "Cymatics - " prefix and trailing key annotations
    title = filename
    title = re.sub(r"^Cymatics\s*-\s*", "", title)
    title = re.sub(r"\s*\([A-G][b#]?\)\s*$", "", title)

    # Extract BPM/key for description
    bpm, key = _extract_bpm_key(filename)
    desc_parts = [title.strip() + "."]
    if bpm:
        desc_parts.append(f"{bpm} BPM.")
    if key:
        desc_parts.append(f"Key: {key}.")
    desc_parts.append(f"{category} from {pack_name}.")
    description = " ".join(desc_parts)

    # Build tags
    tags = [category, pack_name.lower()]
    if bpm:
        tags.append(f"{bpm}bpm")
    if key:
        tags.append(key.lower().replace(" ", ""))

    sample_id = _slugify(f"{category}-{filename}")

    payload = {
        "id": sample_id,
        "audioPath": dest_audio_path,
        "title": title.strip(),
        "freeTextDescription": description,
        "tags": tags,
        "category": category,
        "attributes": {},
        "sourceType": "local",
        "sourceRef": {"pack": pack_name},
    }

    return validate_sample_metadata(payload)


# ---------------------------------------------------------------------------
# Main ingest pipeline
# ---------------------------------------------------------------------------

def _is_stem_or_midi(rel_path: str) -> bool:
    """Return True if the path looks like a stem or MIDI file."""
    parts_lower = [p.lower() for p in Path(rel_path).parts]
    for part in parts_lower:
        if "stem" in part or "midi" in part:
            return True
    if rel_path.lower().endswith(".mid") or rel_path.lower().endswith(".midi"):
        return True
    return False


def ingest_pack(
    zip_path: str | Path,
    library_root: str | Path = "samples/library",
    staging_dir: str | Path | None = None,
    skip_stems: bool = True,
    dry_run: bool = False,
) -> list[dict]:
    """Unzip a Cymatics pack and ingest samples into the library.

    Args:
        zip_path: Path to the .zip file.
        library_root: Destination library root (default: samples/library).
        staging_dir: Where to extract the zip. If None, extracts next to zip.
        skip_stems: If True, skip stems and MIDI files.
        dry_run: If True, return metadata without copying files.

    Returns:
        List of validated sidecar metadata dicts for ingested samples.
    """
    zip_path = Path(zip_path)
    library_root = Path(library_root)
    pack_name = _pack_name_from_zip(zip_path)

    if staging_dir is None:
        staging_dir = zip_path.parent / "_staging"
    staging_dir = Path(staging_dir)

    # Extract
    with zipfile.ZipFile(zip_path, "r") as zf:
        zf.extractall(staging_dir)

    results = []
    for wav_path in sorted(staging_dir.rglob("*.wav")):
        rel_path = str(wav_path.relative_to(staging_dir))

        # Skip stems/MIDI if requested
        if skip_stems and _is_stem_or_midi(rel_path):
            continue

        # Skip macOS resource forks
        if "/__MACOSX/" in rel_path or rel_path.startswith("__MACOSX"):
            continue

        category = infer_category(rel_path)
        dest_dir = library_root / category
        dest_audio = dest_dir / wav_path.name
        dest_audio_rel = str(dest_audio).replace("\\", "/")

        # Ensure audioPath is relative (starts with samples/library/)
        if not dest_audio_rel.startswith("samples/"):
            dest_audio_rel = f"samples/library/{category}/{wav_path.name}"

        sidecar = build_sidecar(rel_path, category, pack_name, dest_audio_rel)

        if not dry_run:
            dest_dir.mkdir(parents=True, exist_ok=True)
            shutil.copy2(wav_path, dest_audio)
            sidecar_path = dest_audio.with_suffix(".json")
            sidecar_path.write_text(
                json.dumps(sidecar, indent=2, sort_keys=True),
                encoding="utf-8",
            )

        results.append(sidecar)

    return results
