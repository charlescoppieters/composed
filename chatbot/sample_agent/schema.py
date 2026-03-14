"""Schema and folder conventions for sample metadata."""

from copy import deepcopy
from datetime import datetime, timezone
from pathlib import Path


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
    "impact", "riser", "whoosh", "transition", "texture", "foley",
    # Stems & MIDI
    "stem_drum", "stem_melody", "stem_guitar", "midi",
    # Vocals
    "vocal",
}

ALLOWED_SOURCE_TYPES = {"local", "generated", "edited"}

ALLOWED_ATTRIBUTE_VALUES = {
    "tone": {"bright", "dark", "warm", "cold", "punchy", "smooth"},
    "envelope": {"short", "tight", "long", "boomy"},
    "texture": {"clean", "dirty", "gritty", "crisp"},
    "space": {"dry", "roomy", "wet"},
    "sourceFeel": {"acoustic", "electronic", "foley", "cinematic", "synthetic"},
}


def _timestamp():
    return datetime.now(timezone.utc).replace(microsecond=0).isoformat()


def _normalize_path(path_value):
    return Path(path_value).as_posix()


def _normalize_string_list(values, *, sort_values=False, lowercase=True):
    if values is None:
        return []
    if not isinstance(values, list):
        raise ValueError("Expected a list of strings.")

    normalized = []
    seen = set()
    for value in values:
        if not isinstance(value, str) or not value.strip():
            raise ValueError("List entries must be non-empty strings.")
        candidate = value.strip().lower() if lowercase else value.strip()
        if candidate not in seen:
            normalized.append(candidate)
            seen.add(candidate)
    return sorted(normalized) if sort_values else normalized


def validate_sample_metadata(payload):
    """Validate and normalize sample metadata."""

    if not isinstance(payload, dict):
        raise ValueError("Sample metadata must be a dictionary.")

    required_keys = [
        "id",
        "audioPath",
        "title",
        "freeTextDescription",
        "tags",
        "category",
        "attributes",
        "sourceType",
    ]
    for key in required_keys:
        if key not in payload:
            raise ValueError(f"Missing required field: {key}")

    category = str(payload["category"]).strip().lower()
    if category not in ALLOWED_CATEGORIES:
        raise ValueError(f"Unknown category: {category}")

    source_type = str(payload["sourceType"]).strip().lower()
    if source_type not in ALLOWED_SOURCE_TYPES:
        raise ValueError(f"Unknown source type: {source_type}")

    attributes = payload.get("attributes") or {}
    if not isinstance(attributes, dict):
        raise ValueError("attributes must be a dictionary.")

    normalized_attributes = {}
    for axis, values in attributes.items():
        if axis not in ALLOWED_ATTRIBUTE_VALUES:
            raise ValueError(f"Unknown attribute axis: {axis}")
        normalized_values = _normalize_string_list(values)
        invalid_values = [
            value
            for value in normalized_values
            if value not in ALLOWED_ATTRIBUTE_VALUES[axis]
        ]
        if invalid_values:
            raise ValueError(
                f"Unknown values for {axis}: {', '.join(sorted(invalid_values))}"
            )
        normalized_attributes[axis] = normalized_values

    normalized = deepcopy(payload)
    normalized["id"] = str(payload["id"]).strip()
    normalized["audioPath"] = _normalize_path(payload["audioPath"])
    if source_type == "local" and not normalized["audioPath"].startswith("samples/library/"):
        raise ValueError("Local samples must live under samples/library/.")
    if source_type in {"generated", "edited"} and not normalized["audioPath"].startswith(
        "samples/generated/"
    ):
        raise ValueError("Generated and edited samples must live under samples/generated/.")
    normalized["title"] = str(payload["title"]).strip()
    normalized["freeTextDescription"] = str(payload["freeTextDescription"]).strip()
    normalized["tags"] = _normalize_string_list(payload["tags"])
    normalized["category"] = category
    normalized["attributes"] = normalized_attributes
    normalized["sourceType"] = source_type
    normalized["sourceRef"] = deepcopy(payload.get("sourceRef") or {})
    normalized["userNotes"] = _normalize_string_list(
        payload.get("userNotes") or [],
        lowercase=False,
    )
    normalized["createdAt"] = payload.get("createdAt") or _timestamp()
    normalized["updatedAt"] = payload.get("updatedAt") or _timestamp()
    return normalized


def metadata_path_for_audio(audio_path):
    """Map an audio asset path to its JSON sidecar path."""

    return str(Path(audio_path).with_suffix(".json").as_posix())


def sample_library_layout():
    """Return the expected library layout for the MVP."""

    return {
        "libraryRoot": "samples/library",
        "generatedRoot": "samples/generated",
        "indexRoot": "samples/_index",
        "templateRoots": ["samples/_templates"],
        "notes": "Use JSON sidecars as source of truth and JSONL under samples/_index.",
    }
