"""Search and feedback helpers for sample retrieval."""

import re
from copy import deepcopy
from datetime import datetime, timezone


TOKEN_NORMALIZATION = {
    "brighter": "bright",
    "darker": "dark",
    "warmer": "warm",
    "colder": "cold",
    "shorter": "short",
    "longer": "long",
    "tighter": "tight",
    "crisper": "crisp",
    "dirtier": "dirty",
    "cleaner": "clean",
    "roomier": "roomy",
    "punchier": "punchy",
    "smoother": "smooth",
    "crispy": "crisp",
    "analog": "keys",
    "analogue": "keys",
    "warm": "pad",
    "chop": "vocal",
    "riser": "transition",
    "hihat": "hat",
    "hihats": "hat",
}

STOP_WORDS = {
    "a",
    "an",
    "and",
    "but",
    "for",
    "like",
    "more",
    "less",
    "something",
    "than",
    "the",
    "this",
    "with",
}


def _timestamp():
    return datetime.now(timezone.utc).replace(microsecond=0).isoformat()


def _tokenize(text):
    tokens = []
    for token in re.findall(r"[a-z0-9]+", text.lower()):
        normalized = TOKEN_NORMALIZATION.get(token, token)
        if normalized not in STOP_WORDS:
            tokens.append(normalized)
    return tokens


def _entry_tokens(entry):
    tokens = []
    tokens.extend(_tokenize(entry.get("title", "")))
    tokens.extend(_tokenize(entry.get("freeTextDescription", "")))
    tokens.extend(_tokenize(entry.get("category", "")))
    tokens.extend(_tokenize(" ".join(entry.get("tags", []))))
    tokens.extend(_tokenize(" ".join(entry.get("userNotes", []))))
    for axis_values in entry.get("attributes", {}).values():
        tokens.extend(_tokenize(" ".join(axis_values)))
    return tokens


def _attribute_values(entry):
    values = set()
    for axis_values in entry.get("attributes", {}).values():
        values.update(axis_values)
    return values


def search_catalog(entries, query, limit=5, reference_sample_id=None):
    """Rank entries against a query with optional reference bias."""

    query_tokens = _tokenize(query)
    reference_entry = None
    if reference_sample_id:
        reference_entry = next(
            (entry for entry in entries if entry["id"] == reference_sample_id),
            None,
        )

    ranked = []
    for entry in entries:
        score = 0
        entry_tokens = _entry_tokens(entry)
        entry_token_set = set(entry_tokens)
        attribute_values = _attribute_values(entry)

        for token in query_tokens:
            if token == entry.get("category"):
                score += 8
            if token in entry.get("tags", []):
                score += 5
            if token in attribute_values:
                score += 4
            if token in entry_token_set:
                score += 2

        if reference_entry:
            if entry["id"] == reference_entry["id"]:
                continue
            if entry.get("category") == reference_entry.get("category"):
                score += 4

            shared_attributes = len(
                _attribute_values(entry) & _attribute_values(reference_entry)
            )
            score += shared_attributes

        explanation = (
            f"Matched category {entry.get('category')} with tags "
            f"{', '.join(entry.get('tags', [])[:3]) or 'none'}."
        )
        ranked.append({**entry, "score": score, "explanation": explanation})

    ranked.sort(key=lambda row: (-row["score"], row["id"]))
    return ranked[:limit]


def apply_feedback(metadata, note, tags=None):
    """Merge user notes and tags into metadata for future retrieval."""

    updated = deepcopy(metadata)
    updated.setdefault("userNotes", [])
    if note and note not in updated["userNotes"]:
        updated["userNotes"].append(note)

    merged_tags = {tag.lower() for tag in updated.get("tags", [])}
    for tag in tags or []:
        cleaned = tag.strip().lower()
        if cleaned:
            merged_tags.add(cleaned)
    updated["tags"] = sorted(merged_tags)
    updated["updatedAt"] = _timestamp()
    return updated
