# Sample Taxonomy

This MVP uses a small controlled vocabulary so retrieval stays predictable and future embeddings stay clean.

## Categories

- `kick`
- `snare`
- `clap`
- `hat`
- `perc`
- `tom`
- `impact`
- `riser`
- `whoosh`
- `texture`
- `foley`

## Attribute axes

### `tone`

- `bright`
- `dark`
- `warm`
- `cold`
- `punchy`
- `smooth`

### `envelope`

- `short`
- `tight`
- `long`
- `boomy`

### `texture`

- `clean`
- `dirty`
- `gritty`
- `crisp`

### `space`

- `dry`
- `roomy`
- `wet`

### `sourceFeel`

- `acoustic`
- `electronic`
- `foley`
- `cinematic`
- `synthetic`

## Authoring rules

- Use one stable `category` per sample.
- Keep `tags` short and searchable.
- Put broader vibe language in `freeTextDescription`.
- Use `userNotes` for retrieval feedback from real usage.
- Treat generated or edited assets as first-class samples with provenance.
