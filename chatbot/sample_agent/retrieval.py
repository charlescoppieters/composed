"""Search and feedback helpers for sample retrieval."""

import re
from copy import deepcopy
from datetime import datetime, timezone


# ── Token normalization: map alternate spellings / synonyms to canonical forms ──

TOKEN_NORMALIZATION = {
    # Adjective normalization
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
    "heavier": "heavy",
    "softer": "soft",
    "harder": "hard",
    "thicker": "thick",
    "thinner": "thin",
    "fatter": "fat",
    "wider": "wide",
    # Category aliases
    "hihat": "hat",
    "hihats": "hat",
    "hi-hat": "hat",
    "hi-hats": "hat",
    "hats": "hat",
    "kicks": "kick",
    "snares": "snare",
    "claps": "clap",
    "pads": "pad",
    "leads": "lead",
    "basses": "bass",
    "bells": "bell",
    "plucks": "pluck",
    "synths": "synth",
    "vocals": "vocal",
    "percs": "perc",
    "percussion": "perc",
    "riser": "transition",
    "risers": "transition",
    "fx": "transition",
    "effects": "transition",
    "808s": "808",
    "sub": "808",
    "subs": "808",
    # Instrument mappings
    "piano": "keys",
    "organ": "keys",
    "rhodes": "keys",
    "electric_piano": "keys",
    "guitar": "loop_guitar",
    "melody": "loop_melody",
    "drum": "loop_drum",
    "drums": "loop_drum",
}

# ── Genre-aware query expansion: vibe words → additional search tokens ──

VIBE_EXPANSION = {
    # Tonal vibes
    "dark": ["dark", "eerie", "shadow", "midnight", "minor", "deep"],
    "bright": ["bright", "crisp", "airy", "clean", "shimmer"],
    "warm": ["warm", "smooth", "soft", "lush", "mellow"],
    "cold": ["cold", "icy", "metallic", "sterile", "thin"],
    # Textural vibes
    "punchy": ["punchy", "tight", "hard", "attack", "clean"],
    "smooth": ["smooth", "warm", "soft", "mellow", "lush"],
    "gritty": ["gritty", "dirty", "distorted", "raw", "crushed"],
    "crisp": ["crisp", "bright", "tight", "clean", "sharp"],
    "dusty": ["dusty", "warm", "vinyl", "lofi", "mellow"],
    "lush": ["lush", "warm", "wide", "rich", "layered"],
    # Energy vibes
    "heavy": ["heavy", "thick", "massive", "heavyweight", "hard"],
    "chill": ["chill", "mellow", "soft", "gentle", "relaxed"],
    "aggressive": ["aggressive", "hard", "sharp", "intense", "attack"],
    "spacey": ["spacey", "wide", "ethereal", "ambient", "reverb"],
    "bouncy": ["bouncy", "rhythmic", "groove", "swing", "dancehall"],
    "dreamy": ["dreamy", "ethereal", "soft", "ambient", "pad"],
    "ethereal": ["ethereal", "spacey", "ambient", "dreamy", "wide"],
    "atmospheric": ["atmospheric", "ambient", "spacey", "texture", "pad"],
    # Genre-adjacent vibes
    "lofi": ["lofi", "dusty", "warm", "mellow", "vinyl"],
    "trap": ["trap", "dark", "808", "hat", "hard"],
    "rnb": ["rnb", "smooth", "warm", "soulful", "groove"],
    "r&b": ["rnb", "smooth", "warm", "soulful", "groove"],
    "drill": ["drill", "dark", "cold", "808", "sliding"],
    "house": ["house", "groove", "four", "kick", "hat"],
    "ambient": ["ambient", "texture", "pad", "ethereal", "spacey"],
    "cinematic": ["cinematic", "impact", "texture", "epic", "wide"],
    "soulful": ["soulful", "warm", "smooth", "keys", "vocal"],
    "tropical": ["tropical", "bouncy", "dancehall", "bright", "rhythmic"],
    "dancehall": ["dancehall", "bouncy", "rhythmic", "tropical"],
}

STOP_WORDS = {
    "a", "an", "and", "are", "at", "be", "but", "by", "do",
    "for", "from", "get", "give", "good", "great", "have",
    "i", "if", "in", "is", "it", "just", "know", "like",
    "looking", "make", "me", "more", "my", "need", "no",
    "not", "of", "on", "or", "out", "really", "sample",
    "samples", "should", "so", "some", "something", "sound",
    "sounds", "than", "that", "the", "them", "then", "there",
    "these", "they", "thing", "think", "this", "to", "track",
    "up", "use", "want", "was", "what", "when", "which",
    "will", "with", "would", "you",
    "less", "can", "could", "find", "got", "help",
}


def _timestamp():
    return datetime.now(timezone.utc).replace(microsecond=0).isoformat()


def _tokenize(text):
    """Tokenize text into normalized search tokens."""
    tokens = []
    for token in re.findall(r"[a-z0-9]+", text.lower()):
        normalized = TOKEN_NORMALIZATION.get(token, token)
        if normalized not in STOP_WORDS:
            tokens.append(normalized)
    return tokens


def _expand_query_tokens(tokens):
    """Expand query tokens using vibe/genre synonyms for broader matching."""
    expanded = list(tokens)
    for token in tokens:
        if token in VIBE_EXPANSION:
            for synonym in VIBE_EXPANSION[token]:
                if synonym not in expanded:
                    expanded.append(synonym)
    return expanded


def _entry_tokens(entry):
    """Extract all searchable tokens from a catalog entry."""
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


def _extract_bpm(text):
    """Extract BPM value from text if present."""
    match = re.search(r"(\d{2,3})\s*(?:bpm|BPM)", text)
    return int(match.group(1)) if match else None


def search_catalog(entries, query, limit=10, reference_sample_id=None):
    """Rank entries against a query with synonym expansion and optional reference bias."""

    raw_tokens = _tokenize(query)
    query_tokens = _expand_query_tokens(raw_tokens)
    query_bpm = _extract_bpm(query)

    reference_entry = None
    if reference_sample_id:
        reference_entry = next(
            (entry for entry in entries if entry["id"] == reference_sample_id),
            None,
        )

    ranked = []
    for entry in entries:
        score = 0.0
        entry_tok_list = _entry_tokens(entry)
        entry_token_set = set(entry_tok_list)
        attribute_values = _attribute_values(entry)
        title_lower = entry.get("title", "").lower()
        desc_lower = entry.get("freeTextDescription", "").lower()

        # ── Primary token matching (original query tokens get higher weight) ──
        for token in raw_tokens:
            if token == entry.get("category"):
                score += 10  # Direct category match is strongest
            if token in entry.get("tags", []):
                score += 6
            if token in attribute_values:
                score += 5
            # Title match (most descriptive field)
            if token in title_lower.split():
                score += 4
            elif token in title_lower:
                score += 2
            # Description match
            if token in desc_lower:
                score += 1.5
            # General token match
            if token in entry_token_set:
                score += 1

        # ── Expanded token matching (lower weight — fuzzy relevance) ──
        expanded_only = [t for t in query_tokens if t not in raw_tokens]
        for token in expanded_only:
            if token == entry.get("category"):
                score += 4
            if token in entry.get("tags", []):
                score += 2
            if token in attribute_values:
                score += 2
            if token in title_lower:
                score += 1.5
            if token in entry_token_set:
                score += 0.5

        # ── BPM proximity bonus ──
        if query_bpm:
            entry_bpm = _extract_bpm(entry.get("title", ""))
            if entry_bpm:
                bpm_diff = abs(query_bpm - entry_bpm)
                if bpm_diff == 0:
                    score += 8
                elif bpm_diff <= 5:
                    score += 5
                elif bpm_diff <= 15:
                    score += 2

        # ── Multi-token bonus: reward entries matching multiple query dimensions ──
        matched_raw = sum(1 for t in raw_tokens if t in entry_token_set or t == entry.get("category"))
        if matched_raw >= 2:
            score += matched_raw * 1.5

        # ── Reference sample bias ──
        if reference_entry:
            if entry["id"] == reference_entry["id"]:
                continue
            if entry.get("category") == reference_entry.get("category"):
                score += 4
            shared_attributes = len(
                _attribute_values(entry) & _attribute_values(reference_entry)
            )
            score += shared_attributes * 1.5
            # Title similarity bonus
            ref_title_tokens = set(_tokenize(reference_entry.get("title", "")))
            entry_title_tokens = set(_tokenize(entry.get("title", "")))
            shared_title = len(ref_title_tokens & entry_title_tokens)
            score += shared_title * 1.0

        if score > 0:
            explanation = _build_explanation(entry, raw_tokens, query_tokens, query_bpm)
            ranked.append({**entry, "score": round(score, 1), "explanation": explanation})

    ranked.sort(key=lambda row: (-row["score"], row["id"]))
    return ranked[:limit]


def _build_explanation(entry, raw_tokens, expanded_tokens, query_bpm):
    """Build a human-readable explanation of why an entry matched."""
    reasons = []
    category = entry.get("category", "")
    tags = entry.get("tags", [])
    title = entry.get("title", "")

    for token in raw_tokens:
        if token == category:
            reasons.append(f"category '{category}'")
        if token in tags:
            reasons.append(f"tag '{token}'")

    entry_bpm = _extract_bpm(title)
    if query_bpm and entry_bpm:
        diff = abs(query_bpm - entry_bpm)
        if diff <= 5:
            reasons.append(f"BPM {entry_bpm} (close to {query_bpm})")

    if not reasons:
        # Fall back to expanded matches
        entry_tokens = set(_entry_tokens(entry))
        matched = [t for t in expanded_tokens if t in entry_tokens][:3]
        if matched:
            reasons.append(f"matched: {', '.join(matched)}")
        else:
            reasons.append(f"category {category}")

    return f"Matched {'; '.join(reasons[:3])}. Tags: {', '.join(tags[:4]) or 'none'}."


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
