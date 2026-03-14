# Retrieval Engine Test Results

**Date:** 2026-03-14
**Catalog:** 299 samples, 28 categories
**Engine:** `sample_agent.retrieval.search_catalog()` (token-based lexical search)

## Query Results (top 3 per query)

### 1. "dark heavy kick" -- PASS

| Rank | ID | Category | Score | Title |
|------|----|----------|-------|-------|
| 1 | kick-cymatics-orchid-kick-clean-f | kick | 15 | Orchid Kick - Clean |
| 2 | kick-cymatics-orchid-kick-dancehall-a | kick | 15 | Orchid Kick - Dancehall |
| 3 | kick-cymatics-orchid-kick-layered-f | kick | 15 | Orchid Kick - Layered |

All results in expected category. Scores are identical -- the engine correctly identifies kick samples but cannot differentiate "dark" or "heavy" characteristics since attribute metadata is empty.

### 2. "bright snare short tail" -- PASS

| Rank | ID | Category | Score | Title |
|------|----|----------|-------|-------|
| 1 | snare-cymatics-orchid-snare-arrow-g | snare | 15 | Orchid Snare - Arrow |
| 2 | snare-cymatics-orchid-snare-breeze-e | snare | 15 | Orchid Snare - Breeze |
| 3 | snare-cymatics-orchid-snare-heft-d | snare | 15 | Orchid Snare - Heft |

All results in expected category. Same flat-score issue -- "bright" and "short" are not discriminating because attributes are unpopulated.

### 3. "melody loop 120 bpm" -- PARTIAL

| Rank | ID | Category | Score | Title |
|------|----|----------|-------|-------|
| 1 | loop-melody-cymatics-vocal-loop-glamorous-120-bpm-c-maj | loop_melody | 8 | Vocal Loop - Glamorous - 120 BPM C Maj |
| 2 | loop-hihat-cymatics-orchid-hihat-loop-120-bpm | loop_hihat | 6 | Orchid Hihat Loop - 120 BPM |
| 3 | loop-melody-cymatics-4-am-thoughts-92-bpm-g-min | loop_melody | 6 | 4 AM Thoughts - 92 BPM G Min |

Result #2 is a hihat loop, not a melody loop. The token "loop" matches multiple loop subcategories. The "120" and "bpm" tokens matched the hihat loop's title. The category token "loop_melody" doesn't get full credit because "melody" and "loop" are scored independently.

### 4. "punchy 808 bass" -- PASS

| Rank | ID | Category | Score | Title |
|------|----|----------|-------|-------|
| 1 | bass-cymatics-orchid-reese-punchy-c | bass | 17 | Orchid REESE Punchy |
| 2 | 808-cymatics-orchid-808-cyclical-c | 808 | 15 | Orchid 808 Cyclical |
| 3 | 808-cymatics-orchid-808-heavyweight-c | 808 | 15 | Orchid 808 Heavyweight |

Both 808 and bass categories are acceptable. "Punchy" appearing in the bass sample title gives it a higher score -- good signal.

### 5. "crispy hi-hat" -- PASS

| Rank | ID | Category | Score | Title |
|------|----|----------|-------|-------|
| 1 | hat-cymatics-orchid-hihat-closed-1 | hat | 15 | Orchid Hihat - Closed 1 |
| 2 | hat-cymatics-orchid-hihat-closed-2 | hat | 15 | Orchid Hihat - Closed 2 |
| 3 | hat-cymatics-orchid-hihat-closed-3 | hat | 15 | Orchid Hihat - Closed 3 |

TOKEN_NORMALIZATION maps "crispy" -> "crisp" and "hihat" -> "hat", so this works well.

### 6. "ambient pad" -- PASS

| Rank | ID | Category | Score | Title |
|------|----|----------|-------|-------|
| 1 | pad-cymatics-orchid-pad-humility-c | pad | 15 | Orchid PAD Humility |
| 2 | pad-cymatics-orchid-pad-suffer-c | pad | 15 | Orchid PAD Suffer |
| 3 | pad-cymatics-pad-crescent-c | pad | 15 | PAD Crescent |

All pad results. Note: "ambient" doesn't appear in any token fields so it effectively contributes nothing to scoring.

### 7. "guitar loop" -- PASS

| Rank | ID | Category | Score | Title |
|------|----|----------|-------|-------|
| 1 | loop-guitar-cymatics-blurry-80-bpm-f-min | loop_guitar | 4 | Blurry - 80 BPM F# Min |
| 2 | loop-guitar-cymatics-madame-90-bpm-b-min | loop_guitar | 4 | Madame - 90 BPM B Min |
| 3 | loop-guitar-cymatics-rose-colored-glasses-130-bpm-b-min | loop_guitar | 4 | Rose Colored Glasses - 130 BPM B Min |

Low scores (4) because "guitar" and "loop" each only match via entry tokens, not the compound category "loop_guitar". The category match bonus requires an exact token match against the category field.

### 8. "cinematic impact boom" -- PASS

| Rank | ID | Category | Score | Title |
|------|----|----------|-------|-------|
| 1 | impact-cymatics-orchid-impact-fx-1 | impact | 15 | Orchid Impact FX 1 |
| 2 | impact-cymatics-orchid-impact-fx-2 | impact | 15 | Orchid Impact FX 2 |
| 3 | impact-cymatics-orchid-impact-fx-3 | impact | 15 | Orchid Impact FX 3 |

All impact category. "Cinematic" and "boom" are ignored (no matches), but "impact" is strong enough.

### 9. "vocal chop" -- PASS

| Rank | ID | Category | Score | Title |
|------|----|----------|-------|-------|
| 1 | vocal-cymatics-infinity-vocal-ambience-city-of-atlantis-b | vocal | 30 | Infinity Vocal Ambience - City Of Atlantis - B |
| 2 | vocal-cymatics-infinity-vocal-ambience-flumesque-a | vocal | 30 | Infinity Vocal Ambience - Flumesque - A |
| 3 | vocal-cymatics-infinity-vocal-ambience-intelligent-beings-c | vocal | 30 | Infinity Vocal Ambience - Intelligent Beings - C# |

High scores (30) because TOKEN_NORMALIZATION maps "chop" -> "vocal", so both query tokens resolve to "vocal" and each gets category + tag + entry token bonuses.

### 10. "drum loop for trap" -- PASS

| Rank | ID | Category | Score | Title |
|------|----|----------|-------|-------|
| 1 | loop-drum-cymatics-orchid-trap-drum-loop-1-85-bpm | loop_drum | 6 | Orchid Trap Drum Loop 1 - 85 BPM |
| 2 | loop-drum-cymatics-orchid-trap-drum-loop-2-89-bpm | loop_drum | 6 | Orchid Trap Drum Loop 2 - 89 BPM |
| 3 | loop-drum-cymatics-orchid-trap-drum-loop-3-140-bpm | loop_drum | 6 | Orchid Trap Drum Loop 3 - 140 BPM |

Good -- "trap" in the title helps surface genre-specific drum loops. "for" is correctly filtered as a stop word.

## /catalog/tree Endpoint

| Check | Result |
|-------|--------|
| Status code | 200 |
| Number of categories | 28 |
| Total samples in tree | 299 |
| Matches catalog.jsonl count | Yes |
| All entries have id, title, audioPath | Yes |

### Category Breakdown

| Category | Count |
|----------|-------|
| 808 | 6 |
| bass | 9 |
| bell | 7 |
| clap | 5 |
| crash | 2 |
| hat | 12 |
| impact | 6 |
| keys | 16 |
| kick | 4 |
| lead | 4 |
| loop_drum | 15 |
| loop_guitar | 6 |
| loop_hihat | 8 |
| loop_melody | 87 |
| loop_perc | 14 |
| loop_vocal | 12 |
| pad | 11 |
| perc | 20 |
| pluck | 8 |
| ride | 2 |
| rimshot | 4 |
| shaker | 4 |
| snap | 3 |
| snare | 7 |
| synth | 12 |
| texture | 4 |
| transition | 7 |
| vocal | 4 |

## Summary

**Overall: 9 PASS, 1 PARTIAL, 0 FAIL out of 10 queries**

The retrieval engine correctly routes queries to the right categories in 9/10 cases. The one partial failure ("melody loop 120 bpm") is due to the compound category `loop_melody` not being matched as a single token.

### Key Observations

1. **Empty attributes:** All catalog entries have `"attributes": {}`. The scoring logic awards 4 points for attribute matches, but this bonus is never triggered. Populating attributes (bright/dark, short/long, punchy/soft, etc.) would significantly improve ranking quality.

2. **Flat scores within categories:** When all entries in a category have the same metadata structure, scores are identical and results are sorted alphabetically by ID. There is no way to distinguish "dark kick" from "bright kick" with current data.

3. **Compound categories:** Categories like `loop_melody`, `loop_drum`, `loop_guitar` are tokenized into separate tokens ("loop", "melody"), so queries must match both independently. The category match bonus (+8) only fires when a query token exactly equals the full category string, which never happens for compound categories.

4. **TOKEN_NORMALIZATION side effects:** Mapping "warm" -> "pad" is aggressive. A query like "warm kick" would boost pad samples instead of warm-sounding kicks. Similarly, "chop" -> "vocal" means "chop" always means vocal chop, which may not be intended for other chop-style samples.

### Recommendations

1. Populate the `attributes` field in sidecars with sonic descriptors (bright/dark, short/long, punchy/soft, clean/dirty).
2. Add compound category matching so `loop_melody` gets the +8 bonus when both "loop" and "melody" appear in the query.
3. Review TOKEN_NORMALIZATION for overly broad mappings ("warm" -> "pad", "chop" -> "vocal").
4. Consider adding BPM-range matching so "120 bpm" doesn't just do string matching but also returns nearby tempos.
