"""Catalog generation for sample metadata sidecars."""

import json
from pathlib import Path

from sample_agent.schema import validate_sample_metadata


def _project_root_from_path(path):
    resolved = Path(path).resolve()
    for parent in [resolved] + list(resolved.parents):
        if parent.name == "samples":
            return parent.parent
    raise ValueError(f"Could not infer project root from {path}")


def load_sidecar(path):
    """Load, validate, and normalize one sidecar JSON file."""

    sidecar_path = Path(path)
    payload = json.loads(sidecar_path.read_text(encoding="utf-8"))
    metadata = validate_sample_metadata(payload)

    project_root = _project_root_from_path(sidecar_path)
    audio_path = project_root / metadata["audioPath"]
    if not audio_path.exists():
        raise ValueError(f"Missing audio file for sidecar: {audio_path}")
    return metadata


def build_catalog(samples_root, output_path, include_generated=False):
    """Build a sorted JSONL catalog from sample sidecars."""

    samples_root = Path(samples_root)
    output_path = Path(output_path)
    rows = []
    skipped = []
    for sidecar_path in samples_root.rglob("*.json"):
        relative_parts = sidecar_path.relative_to(samples_root).parts
        if relative_parts[0] == "_index":
            continue
        try:
            row = load_sidecar(sidecar_path)
        except (ValueError, json.JSONDecodeError) as exc:
            skipped.append((sidecar_path, str(exc)))
            continue
        if not include_generated and row.get("sourceType") != "local":
            continue
        rows.append(row)
    if skipped:
        import sys
        for path, reason in skipped:
            print(f"warning: skipped {path}: {reason}", file=sys.stderr)

    rows.sort(key=lambda row: row["id"])
    output_path.parent.mkdir(parents=True, exist_ok=True)
    output_path.write_text(
        "\n".join(json.dumps(row, sort_keys=True) for row in rows),
        encoding="utf-8",
    )
    return rows
