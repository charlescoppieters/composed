# Hackathon MVP Implementation Plan

> **For agentic workers:** REQUIRED: Use superpowers:subagent-driven-development (if subagents available) or superpowers:executing-plans to implement this plan. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build a working CLI agent that searches Cymatics sample packs via natural language using GPT-5.4 and the OpenAI Agents SDK.

**Architecture:** Unzip 3 Cymatics packs → ingest script maps folder names to taxonomy categories and generates JSON sidecars → build JSONL catalog → OpenAI Agents SDK agent with `@function_tool` wrappers around existing CLI commands (`search`, `feedback`) → interactive REPL loop.

**Tech Stack:** Python 3.10+, OpenAI Agents SDK (`openai-agents`), GPT-5.4, existing `sample_agent` CLI (schema/catalog/retrieval).

---

## File Structure

```
composed/
├── sample_agent/
│   ├── __init__.py          (exists)
│   ├── schema.py            (MODIFY - expand taxonomy categories)
│   ├── catalog.py           (exists, no changes)
│   ├── retrieval.py         (exists, no changes)
│   ├── cli.py               (exists, no changes)
│   ├── ingest.py            (CREATE - Cymatics unzip + sidecar generation)
│   └── agent.py             (CREATE - OpenAI Agents SDK agent + REPL)
├── prompts/
│   └── sample-retrieval.md  (MODIFY - update for GPT-5.4, add tool descriptions)
├── samples/
│   ├── library/             (populated by ingest)
│   └── _index/
│       └── catalog.jsonl    (built by build-catalog)
├── tracks/                  (3 Cymatics zips - already present)
├── pyproject.toml           (MODIFY - bump to Python 3.10, add openai-agents dep)
└── tests/
    ├── test_ingest.py       (CREATE)
    └── test_agent.py        (CREATE)
```

---

## Task 1: Expand Taxonomy

**Files:**
- Modify: `sample_agent/schema.py:8-20` (ALLOWED_CATEGORIES)
- Modify: `docs/sample-taxonomy.md`

- [ ] **Step 1: Update ALLOWED_CATEGORIES in schema.py**

Add the categories needed for Cymatics packs. The current set is percussion-only. We need bass, melodic, loops, stems, FX.

```python
ALLOWED_CATEGORIES = {
    # Percussion one-shots
    "kick", "snare", "clap", "hat", "perc", "tom",
    "crash", "ride", "rimshot", "shaker", "snap",
    # Bass one-shots
    "808", "bass",
    # Melodic one-shots
    "keys", "lead", "pad", "pluck", "synth", "bell", "instrument",
    # Loops
    "loop_drum", "loop_melody", "loop_guitar", "loop_hihat",
    "loop_perc", "loop_vocal",
    # FX & Texture
    "impact", "riser", "transition", "texture", "foley",
    # Stems & MIDI (index but deprioritize in search)
    "stem_drum", "stem_melody", "stem_guitar", "midi",
    # Vocals
    "vocal",
}
```

- [ ] **Step 2: Verify schema validation still works**

Run: `python3 -c "from sample_agent.schema import validate_sample_metadata; print('OK')"`
Expected: `OK`

- [ ] **Step 3: Commit**

```bash
git add sample_agent/schema.py
git commit -m "feat: expand taxonomy for Cymatics packs (bass, melodic, loops, stems, FX)"
```

---

## Task 2: Bump Python + Add Dependencies

**Files:**
- Modify: `pyproject.toml`

- [ ] **Step 1: Update pyproject.toml**

```toml
[build-system]
requires = ["setuptools>=61"]
build-backend = "setuptools.build_meta"

[project]
name = "sample-agent"
version = "0.1.0"
description = "Agent-first toolkit for local sound sample retrieval."
requires-python = ">=3.10"
dependencies = [
    "openai-agents>=0.12",
]

[tool.setuptools.packages.find]
include = ["sample_agent*"]
```

- [ ] **Step 2: Install dependencies**

Run: `pip install -e ".[dev]" 2>&1 | tail -5`
Expected: Successfully installed openai-agents...

If `openai-agents` fails, fallback: `pip install openai` (we'll use raw function calling loop instead).

- [ ] **Step 3: Verify import**

Run: `python3 -c "from agents import Agent, Runner, function_tool; print('Agents SDK OK')"`
Expected: `Agents SDK OK`

If this fails (import error), check: `python3 --version` must be 3.10+.

- [ ] **Step 4: Commit**

```bash
git add pyproject.toml
git commit -m "chore: bump to Python 3.10, add openai-agents dependency"
```

---

## Task 3: Ingest Script (Unzip + Generate Sidecars)

**Files:**
- Create: `sample_agent/ingest.py`
- Create: `tests/test_ingest.py`

This is the biggest task. The script must:
1. Unzip Cymatics packs to a staging directory
2. Walk the directory tree
3. Map folder names + filename patterns to taxonomy categories
4. Generate JSON sidecar files alongside each audio file
5. Copy audio + sidecars to `samples/library/{category}/`

- [ ] **Step 1: Write test for category inference**

```python
# tests/test_ingest.py
from sample_agent.ingest import infer_category_from_path


def test_kick_from_drum_one_shots():
    path = "Cymatics - Orchid - Sample Pack/Drum One Shots/Kick - Clean (F).wav"
    result = infer_category_from_path(path)
    assert result["category"] == "kick"
    assert result["format"] == "one-shot"


def test_808_from_basses():
    path = "Cymatics - Orchid - Sample Pack/808s & Basses/Cymatics - Orchid 808 Thunder (C).wav"
    result = infer_category_from_path(path)
    assert result["category"] == "808"
    assert result["format"] == "one-shot"


def test_melody_loop():
    path = "Cymatics - Orchid - Sample Pack/Melody Loops/Cymatics - All I Ever Wanted - 90 BPM E Min.wav"
    result = infer_category_from_path(path)
    assert result["category"] == "loop_melody"
    assert result["format"] == "loop"
    assert result["bpm"] == 90
    assert result["key"] == "E Min"


def test_venom_keys():
    path = "Cymatics - Venom - One Shot Collection/Cymatics - KEYS Glass Piano (C).wav"
    result = infer_category_from_path(path)
    assert result["category"] == "keys"
    assert result["format"] == "one-shot"
    assert result["note"] == "C"


def test_fx_impact():
    path = "Cymatics - Orchid - Sample Pack/FX/Impact FX 1.wav"
    result = infer_category_from_path(path)
    assert result["category"] == "impact"


def test_drum_stem():
    path = "Cymatics - Orchid - Sample Pack/Stems & MIDI/Drum Loop Stems/Cymatics - Bop Drum Loop - 109 BPM Kick.wav"
    result = infer_category_from_path(path)
    assert result["category"] == "stem_drum"


def test_vocal_loop():
    path = "Cymatics - Infinity Beta Pack 2.0/Infinity Vocal Collection (Preview)/Vocal Loop - Clouds - 130 BPM A Min.wav"
    result = infer_category_from_path(path)
    assert result["category"] == "loop_vocal"
    assert result["bpm"] == 130
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `python3 -m pytest tests/test_ingest.py -v`
Expected: FAIL (module not found)

- [ ] **Step 3: Implement infer_category_from_path**

```python
# sample_agent/ingest.py
"""Ingest Cymatics sample packs into the sample library."""

import json
import re
import shutil
import zipfile
from pathlib import Path

from sample_agent.schema import ALLOWED_CATEGORIES


# --- Folder name → category mapping ---

FOLDER_CATEGORY_MAP = {
    "drum one shots": "DRUM_ONESHOT",  # special: parse filename for sub-type
    "808s & basses": "BASS_ONESHOT",   # special: parse filename for 808 vs bass
    "one shots": "MELODIC_ONESHOT",    # special: parse filename prefix
    "drum loops": "loop_drum",
    "melody loops": "loop_melody",
    "guitar loops": "loop_guitar",
    "hihat loops": "loop_hihat",
    "percussion loops": "loop_perc",
    "vocal loops": "loop_vocal",
    "fx": "FX",  # special: parse filename
    "stems & midi": "STEM",  # special: parse subfolder
    "drum loop stems": "stem_drum",
    "melody loop stems and midi": "stem_melody",
    "guitar loop stems": "stem_guitar",
    # INFINITY folders
    "infinity drum collection (preview)": "loop_drum",
    "infinity guitar collection (preview)": "loop_guitar",
    "infinity melody collection (preview)": "loop_melody",
    "infinity vocal collection (preview)": "loop_vocal",
    "loop stems and midi": "STEM",
    "dry": "loop_vocal",
}

# Drum one-shot sub-types from filename
DRUM_TYPE_MAP = {
    "kick": "kick", "snare": "snare", "clap": "clap",
    "hihat": "hat", "hi-hat": "hat", "hat": "hat",
    "crash": "crash", "ride": "ride", "rimshot": "rimshot",
    "percussion": "perc", "shaker": "shaker", "snap": "snap",
    "tom": "tom",
}

# Melodic one-shot prefixes (UPPERCASE in filename)
MELODIC_PREFIX_MAP = {
    "808": "808", "BASS": "bass", "REESE": "bass",
    "KEYS": "keys", "LEAD": "lead", "PAD": "pad",
    "PLUCK": "pluck", "SYNTH": "synth", "BELL": "bell",
    "INSTR": "instrument",
}

# FX sub-types from filename
FX_TYPE_MAP = {
    "atmosphere": "texture", "impact": "impact",
    "reverse crash": "riser", "reverse impact": "impact",
    "transition": "transition", "live recording": "foley",
}

# Regex patterns
BPM_RE = re.compile(r"(\d+)\s*BPM", re.IGNORECASE)
KEY_RE = re.compile(r"BPM\s+([A-G]#?\s*(?:Min|Maj|min|maj)?)")
NOTE_RE = re.compile(r"\(([A-G]#?)\)")


def infer_category_from_path(rel_path_str):
    """Infer category, format, bpm, key, note from a relative file path."""
    rel_path = Path(rel_path_str)
    parts = [p.lower() for p in rel_path.parts]
    filename = rel_path.stem  # without .wav
    result = {
        "category": "texture",  # fallback
        "format": "one-shot",
        "bpm": None,
        "key": None,
        "note": None,
    }

    # Extract BPM/key/note from filename
    bpm_match = BPM_RE.search(filename)
    if bpm_match:
        result["bpm"] = int(bpm_match.group(1))
        result["format"] = "loop"

    key_match = KEY_RE.search(filename)
    if key_match:
        result["key"] = key_match.group(1).strip()

    note_match = NOTE_RE.search(filename)
    if note_match:
        result["note"] = note_match.group(1)

    # Walk folder hierarchy to find category
    folder_category = None
    for part in parts[:-1]:  # exclude filename
        if part in FOLDER_CATEGORY_MAP:
            folder_category = FOLDER_CATEGORY_MAP[part]
            break

    if folder_category is None:
        # Venom: flat structure, infer from filename prefix
        for prefix, cat in MELODIC_PREFIX_MAP.items():
            if prefix in filename or prefix.lower() in filename.lower():
                result["category"] = cat
                result["format"] = "one-shot"
                return result
        return result

    # Handle special folder types that need filename parsing
    if folder_category == "DRUM_ONESHOT":
        result["format"] = "one-shot"
        fname_lower = filename.lower()
        for drum_type, cat in DRUM_TYPE_MAP.items():
            if drum_type in fname_lower:
                result["category"] = cat
                return result
        result["category"] = "perc"  # fallback for unknown drum types
        return result

    if folder_category == "BASS_ONESHOT":
        result["format"] = "one-shot"
        for prefix, cat in MELODIC_PREFIX_MAP.items():
            if prefix in filename:
                result["category"] = cat
                return result
        result["category"] = "bass"
        return result

    if folder_category == "MELODIC_ONESHOT":
        result["format"] = "one-shot"
        for prefix, cat in MELODIC_PREFIX_MAP.items():
            if prefix in filename:
                result["category"] = cat
                return result
        result["category"] = "synth"  # fallback
        return result

    if folder_category == "FX":
        result["format"] = "one-shot"
        fname_lower = filename.lower()
        for fx_type, cat in FX_TYPE_MAP.items():
            if fx_type in fname_lower:
                result["category"] = cat
                return result
        result["category"] = "texture"
        return result

    if folder_category == "STEM":
        # Check subfolder for stem type
        for part in parts:
            if "drum" in part and "stem" in part:
                result["category"] = "stem_drum"
                return result
            if "melody" in part and "stem" in part:
                result["category"] = "stem_melody"
                return result
            if "guitar" in part and "stem" in part:
                result["category"] = "stem_guitar"
                return result
        result["category"] = "stem_melody"  # fallback
        return result

    # Direct mapping
    if folder_category in ALLOWED_CATEGORIES:
        result["category"] = folder_category
        return result

    result["category"] = "texture"
    return result


def make_sample_id(category, filename):
    """Generate a stable sample ID from category and filename."""
    clean = re.sub(r"[^a-z0-9]+", "-", filename.lower()).strip("-")
    return f"{category}-{clean}"


def make_sidecar(audio_rel_path, category_info, pack_name):
    """Generate a metadata sidecar dict for one audio file."""
    filename = Path(audio_rel_path).stem
    sample_id = make_sample_id(category_info["category"], filename)

    # Build tags from category + any musical properties
    tags = [category_info["category"]]
    if category_info.get("bpm"):
        tags.append(f"{category_info['bpm']}bpm")
    if category_info.get("key"):
        tags.append(category_info["key"].lower().replace(" ", "-"))
    if category_info.get("note"):
        tags.append(f"note-{category_info['note'].lower()}")
    tags.append(pack_name.lower().replace(" ", "-"))

    # Build description from filename
    clean_name = filename
    for prefix in ["Cymatics - Orchid ", "Cymatics - Venom ", "Cymatics - Infinity ", "Cymatics - "]:
        clean_name = clean_name.replace(prefix, "")
    description = f"{clean_name}. {category_info['category'].replace('_', ' ')} from {pack_name}."

    return {
        "id": sample_id,
        "audioPath": str(audio_rel_path),
        "title": clean_name.strip(),
        "freeTextDescription": description,
        "tags": tags,
        "category": category_info["category"],
        "attributes": {},
        "sourceType": "local",
        "sourceRef": {"pack": pack_name},
    }


def unzip_pack(zip_path, staging_dir):
    """Unzip a Cymatics pack to a staging directory."""
    zip_path = Path(zip_path)
    staging_dir = Path(staging_dir)
    staging_dir.mkdir(parents=True, exist_ok=True)
    with zipfile.ZipFile(zip_path, "r") as zf:
        zf.extractall(staging_dir)
    return staging_dir


def ingest_staging_dir(staging_dir, library_root, skip_stems=True, skip_midi=True):
    """Walk a staging dir, generate sidecars, copy to library."""
    staging_dir = Path(staging_dir)
    library_root = Path(library_root)
    ingested = []

    for wav_path in sorted(staging_dir.rglob("*.wav")):
        if wav_path.name.startswith("."):
            continue

        rel_to_staging = wav_path.relative_to(staging_dir)
        cat_info = infer_category_from_path(str(rel_to_staging))

        # Skip stems/midi if requested
        if skip_stems and cat_info["category"].startswith("stem_"):
            continue
        if skip_midi and cat_info["category"] == "midi":
            continue

        # Determine pack name from top-level folder
        pack_name = rel_to_staging.parts[0] if len(rel_to_staging.parts) > 1 else "Unknown"

        # Destination
        dest_dir = library_root / cat_info["category"]
        dest_dir.mkdir(parents=True, exist_ok=True)
        dest_audio = dest_dir / wav_path.name

        # Skip if already exists
        if dest_audio.exists():
            continue

        # Copy audio
        shutil.copy2(wav_path, dest_audio)

        # Generate sidecar
        audio_rel = Path("samples/library") / cat_info["category"] / wav_path.name
        sidecar = make_sidecar(str(audio_rel), cat_info, pack_name)
        sidecar_path = dest_audio.with_suffix(".json")
        sidecar_path.write_text(json.dumps(sidecar, indent=2, sort_keys=True), encoding="utf-8")

        ingested.append(sidecar)

    return ingested


def ingest_all_zips(tracks_dir, staging_dir, library_root, skip_stems=True):
    """Unzip all zips in tracks_dir and ingest them."""
    tracks_dir = Path(tracks_dir)
    all_ingested = []
    for zip_path in sorted(tracks_dir.glob("*.zip")):
        print(f"Unzipping {zip_path.name}...")
        unzip_pack(zip_path, staging_dir)

    print(f"Ingesting from {staging_dir}...")
    ingested = ingest_staging_dir(staging_dir, library_root, skip_stems=skip_stems)
    all_ingested.extend(ingested)
    print(f"Ingested {len(ingested)} samples")
    return all_ingested
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `python3 -m pytest tests/test_ingest.py -v`
Expected: All 7 tests PASS

- [ ] **Step 5: Commit**

```bash
git add sample_agent/ingest.py tests/test_ingest.py
git commit -m "feat: ingest script for Cymatics packs with category inference"
```

---

## Task 4: Run Ingest on Cymatics Packs

**Files:**
- Populated: `samples/library/` (audio files + JSON sidecars)
- Built: `samples/_index/catalog.jsonl`

- [ ] **Step 1: Run ingest**

```bash
python3 -c "
from sample_agent.ingest import ingest_all_zips
results = ingest_all_zips(
    tracks_dir='tracks',
    staging_dir='/tmp/cymatics-staging',
    library_root='samples/library',
    skip_stems=True,
)
print(f'Total ingested: {len(results)} samples')
"
```

Expected: ~300-500 samples ingested (skipping stems reduces from 929 to ~400).

- [ ] **Step 2: Verify library structure**

Run: `find samples/library -name "*.wav" | head -20 && echo "---" && find samples/library -name "*.json" | wc -l`
Expected: WAV files in category subdirectories, JSON count matches WAV count.

- [ ] **Step 3: Build catalog**

Run: `python3 -m sample_agent.cli build-catalog --samples-root samples --output samples/_index/catalog.jsonl`
Expected: `Built catalog with N rows at samples/_index/catalog.jsonl`

- [ ] **Step 4: Test search**

Run: `python3 -m sample_agent.cli search --catalog samples/_index/catalog.jsonl --query "dark kick"`
Expected: Kick samples ranked by relevance with scores.

Run: `python3 -m sample_agent.cli search --catalog samples/_index/catalog.jsonl --query "smooth pad"`
Expected: Pad samples returned.

Run: `python3 -m sample_agent.cli search --catalog samples/_index/catalog.jsonl --query "melody loop 90 bpm"`
Expected: Melody loops returned, ideally ones near 90 BPM.

- [ ] **Step 5: Commit catalog index (not the audio files)**

```bash
echo "samples/library/" >> .gitignore
echo "/tmp/cymatics-staging/" >> .gitignore
git add samples/_index/catalog.jsonl .gitignore
git commit -m "feat: build catalog from 3 Cymatics packs"
```

---

## Task 5: OpenAI Agent with REPL

**Files:**
- Create: `sample_agent/agent.py`
- Create: `tests/test_agent.py`

- [ ] **Step 1: Write basic agent smoke test**

```python
# tests/test_agent.py
import os
import pytest

# Skip if no API key
pytestmark = pytest.mark.skipif(
    not os.environ.get("OPENAI_API_KEY"),
    reason="OPENAI_API_KEY not set",
)


def test_agent_imports():
    from sample_agent.agent import create_agent
    agent = create_agent()
    assert agent.name == "Sample Agent"
    assert len(agent.tools) >= 2
```

- [ ] **Step 2: Run test to verify it fails**

Run: `python3 -m pytest tests/test_agent.py -v`
Expected: FAIL (module not found)

- [ ] **Step 3: Implement agent.py**

```python
# sample_agent/agent.py
"""OpenAI Agents SDK agent for sample retrieval."""

import json
import subprocess
import sys
from pathlib import Path

from agents import Agent, Runner, function_tool

# Resolve paths relative to project root
PROJECT_ROOT = Path(__file__).resolve().parent.parent
CATALOG_PATH = PROJECT_ROOT / "samples" / "_index" / "catalog.jsonl"
SAMPLES_ROOT = PROJECT_ROOT / "samples"
PROMPT_PATH = PROJECT_ROOT / "prompts" / "sample-retrieval.md"


def _load_system_prompt():
    """Load the system prompt from the prompts directory."""
    if PROMPT_PATH.exists():
        return PROMPT_PATH.read_text(encoding="utf-8")
    return "You help music producers find and organize audio samples from a local library."


@function_tool
def search_samples(query: str, limit: int = 5) -> str:
    """Search the sample catalog for audio samples matching a natural language query.

    Use this to find kicks, snares, basses, pads, loops, FX, etc.
    Supports vibe words (dark, bright, punchy) and technical terms (808, reverb, BPM).
    """
    cmd = [
        sys.executable, "-m", "sample_agent.cli", "search",
        "--catalog", str(CATALOG_PATH),
        "--query", query,
        "--limit", str(limit),
    ]
    result = subprocess.run(cmd, capture_output=True, text=True, cwd=str(PROJECT_ROOT))
    if result.returncode != 0:
        return f"Search error: {result.stderr}"
    if not result.stdout.strip():
        return "No samples found matching that query."
    return result.stdout


@function_tool
def search_similar(query: str, reference_sample_id: str, limit: int = 5) -> str:
    """Search for samples similar to a reference sample, with optional refinement.

    Use when the user says 'more like this' or 'like #3 but darker'.
    """
    cmd = [
        sys.executable, "-m", "sample_agent.cli", "search",
        "--catalog", str(CATALOG_PATH),
        "--query", query,
        "--reference-sample-id", reference_sample_id,
        "--limit", str(limit),
    ]
    result = subprocess.run(cmd, capture_output=True, text=True, cwd=str(PROJECT_ROOT))
    if result.returncode != 0:
        return f"Search error: {result.stderr}"
    if not result.stdout.strip():
        return "No similar samples found."
    return result.stdout


@function_tool
def add_feedback(sample_id: str, note: str, tags: str = "") -> str:
    """Save user feedback (notes and tags) to a sample for future retrieval.

    Use when the user picks a sample or wants to tag/rename one.
    Tags should be comma-separated.
    """
    cmd = [
        sys.executable, "-m", "sample_agent.cli", "feedback",
        "--samples-root", str(SAMPLES_ROOT),
        "--sample-id", sample_id,
        "--note", note,
        "--tags", tags,
    ]
    result = subprocess.run(cmd, capture_output=True, text=True, cwd=str(PROJECT_ROOT))
    if result.returncode != 0:
        return f"Feedback error: {result.stderr}"
    return result.stdout


@function_tool
def list_categories() -> str:
    """List all available sample categories and their counts in the catalog."""
    if not CATALOG_PATH.exists():
        return "Catalog not found. Run build-catalog first."
    counts = {}
    for line in CATALOG_PATH.read_text(encoding="utf-8").splitlines():
        if line.strip():
            row = json.loads(line)
            cat = row.get("category", "unknown")
            counts[cat] = counts.get(cat, 0) + 1
    lines = [f"{cat}: {count} samples" for cat, count in sorted(counts.items())]
    return "\n".join(lines)


def create_agent(model="gpt-5.4"):
    """Create the sample retrieval agent."""
    return Agent(
        name="Sample Agent",
        model=model,
        instructions=_load_system_prompt(),
        tools=[search_samples, search_similar, add_feedback, list_categories],
    )


def run_repl(model="gpt-5.4"):
    """Run an interactive REPL for the sample agent."""
    agent = create_agent(model=model)
    print("Sample Agent ready. Type your query (or 'quit' to exit).")
    print(f"Using model: {model}")
    print(f"Catalog: {CATALOG_PATH}")
    print()

    history = []
    while True:
        try:
            user_input = input("you> ").strip()
        except (EOFError, KeyboardInterrupt):
            print("\nBye!")
            break

        if not user_input:
            continue
        if user_input.lower() in ("quit", "exit", "q"):
            print("Bye!")
            break

        result = Runner.run_sync(agent, user_input)
        print(f"\nagent> {result.final_output}\n")


if __name__ == "__main__":
    import argparse
    parser = argparse.ArgumentParser()
    parser.add_argument("--model", default="gpt-5.4")
    args = parser.parse_args()
    run_repl(model=args.model)
```

- [ ] **Step 4: Run import test**

Run: `python3 -m pytest tests/test_agent.py::test_agent_imports -v`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add sample_agent/agent.py tests/test_agent.py
git commit -m "feat: OpenAI Agents SDK agent with search, feedback, and REPL"
```

---

## Task 6: Update System Prompt for GPT-5.4

**Files:**
- Modify: `prompts/sample-retrieval.md`

- [ ] **Step 1: Update the prompt**

Replace the existing prompt with one tuned for GPT-5.4 function calling. Key changes:
- Remove references to manually running bash commands (the agent SDK handles tool dispatch)
- Add vibe-to-technical translation table
- Add taxonomy awareness
- Add numbered result references

```markdown
# Sample Retrieval Agent

You are a music production assistant that helps musicians find audio samples from a local library. You serve both experts who know exactly what they want ("saturated 808 sub in E") and beginners who describe vibes ("something dark and heavy").

## Your tools

- **search_samples**: Search the catalog by natural language. Use for initial queries.
- **search_similar**: Find samples similar to a reference. Use for "more like this" or refinement.
- **add_feedback**: Save notes and tags to a sample. Use when the user picks or names a sample.
- **list_categories**: Show what's available. Use when the user asks "what do you have?"

## How to search

1. Translate the user's intent into search terms. Use the vibe table below.
2. Call search_samples with a concise query focused on category + attributes.
3. Present the top 3-5 results with: number, title, audio path, and why it matches.
4. Ask if the user wants to refine, hear more, or pick one.

## Vibe-to-technical translation

| User says | Search for |
|-----------|-----------|
| dark | low-pass, minor, sub, deep, warm |
| bright | high-frequency, crisp, airy, clean |
| punchy | tight, short attack, compressed, dry |
| smooth | long release, warm, clean, soft |
| gritty | dirty, distorted, bitcrushed, saturated |
| spacey | wet, reverb, long tail, wide |
| heavy | sub, bass, loud, thick |
| chill | slow, warm, smooth, soft |
| crispy | high-end, short, bright, crackle |
| fat | wide, layered, thick, sub |

## Sample categories

Percussion: kick, snare, clap, hat, perc, tom, crash, ride, rimshot, shaker, snap
Bass: 808, bass
Melodic: keys, lead, pad, pluck, synth, bell, instrument
Loops: loop_drum, loop_melody, loop_guitar, loop_hihat, loop_perc, loop_vocal
FX: impact, riser, transition, texture, foley
Vocals: vocal

## Response format

For search results, always use numbered references:
```
1. **Kick - Clean** (samples/library/kick/Kick - Clean (F).wav)
   Punchy acoustic kick, dry and tight. Score: 18

2. **808 Thunder** (samples/library/808/Cymatics - Orchid 808 Thunder (C).wav)
   Deep 808 with sustained sub tail. Score: 14
```

Then suggest next steps: "Want to hear more kicks, or should I try something darker?"

## When search results are weak

If the top score is low or the user isn't satisfied:
1. Try rephrasing the query with different terms
2. Suggest adjacent categories
3. Note: "Sound generation isn't available yet, but I can help you find the closest match."

## Feedback flow

When the user picks a sample:
1. Confirm their choice
2. Suggest 2-3 tags worth saving
3. If they agree, call add_feedback
```

- [ ] **Step 2: Commit**

```bash
git add prompts/sample-retrieval.md
git commit -m "feat: update system prompt for GPT-5.4 with vibe table and taxonomy"
```

---

## Task 7: End-to-End Test

No new files — this is manual verification.

- [ ] **Step 1: Ensure OPENAI_API_KEY is set**

Run: `echo $OPENAI_API_KEY | head -c 8`
Expected: `sk-...` (first 8 chars of your key)

- [ ] **Step 2: Run the agent REPL**

Run: `python3 -m sample_agent.agent`

Test these queries in order:
1. `what categories do you have?` → should list all categories with counts
2. `find me a dark kick` → should return kick samples
3. `something brighter` → should refine
4. `show me some smooth pads` → should return pad samples
5. `i need a melody loop around 90 bpm` → should return melody loops
6. `quit`

- [ ] **Step 3: Verify the full pipeline works**

If all 5 queries return sensible results, the MVP is working. If any fail:
- Check `samples/_index/catalog.jsonl` has rows for that category
- Check the system prompt is being loaded correctly
- Check tool call responses aren't erroring

- [ ] **Step 4: Final commit**

```bash
git add -A
git commit -m "feat: hackathon MVP - sample search agent with Cymatics library"
```

---

## Summary

| Task | What | Est. Time |
|------|------|-----------|
| 1 | Expand taxonomy | 5 min |
| 2 | Bump Python + deps | 5 min |
| 3 | Ingest script | 30 min |
| 4 | Run ingest + build catalog | 10 min |
| 5 | Agent REPL | 20 min |
| 6 | System prompt | 10 min |
| 7 | End-to-end test | 10 min |
| **Total** | | **~90 min** |

After this MVP works, Day 2 priorities:
- ElevenLabs sound generation tool
- Refinement (Rocchio) tool
- Web UI (Next.js or Streamlit)
- Metadata enrichment via GPT-5.4 batch
