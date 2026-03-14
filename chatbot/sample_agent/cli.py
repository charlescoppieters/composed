"""CLI entrypoints for building catalogs and searching samples."""

import argparse
import json
from pathlib import Path

from sample_agent.catalog import build_catalog, load_sidecar
from sample_agent.retrieval import apply_feedback, search_catalog


def _load_catalog_rows(path):
    return [
        json.loads(line)
        for line in Path(path).read_text(encoding="utf-8").splitlines()
        if line.strip()
    ]


def _find_sidecar_by_sample_id(samples_root, sample_id):
    samples_root = Path(samples_root)
    for path in samples_root.rglob("*.json"):
        if path.name == "catalog.jsonl":
            continue
        metadata = json.loads(path.read_text(encoding="utf-8"))
        if metadata.get("id") == sample_id:
            return path
    raise FileNotFoundError(f"No sidecar found for sample id {sample_id}")


def main(argv=None):
    parser = argparse.ArgumentParser(prog="sample-agent")
    subparsers = parser.add_subparsers(dest="command", required=True)

    build_parser = subparsers.add_parser("build-catalog")
    build_parser.add_argument("--samples-root", required=True)
    build_parser.add_argument("--output", required=True)

    search_parser = subparsers.add_parser("search")
    search_parser.add_argument("--catalog", required=True)
    search_parser.add_argument("--query", required=True)
    search_parser.add_argument("--limit", type=int, default=5)
    search_parser.add_argument("--reference-sample-id")

    feedback_parser = subparsers.add_parser("feedback")
    feedback_parser.add_argument("--samples-root", required=True)
    feedback_parser.add_argument("--sample-id", required=True)
    feedback_parser.add_argument("--note", required=True)
    feedback_parser.add_argument("--tags", default="")

    args = parser.parse_args(argv)

    if args.command == "build-catalog":
        rows = build_catalog(args.samples_root, args.output)
        print(f"Built catalog with {len(rows)} rows at {args.output}")
        return 0

    if args.command == "search":
        rows = _load_catalog_rows(args.catalog)
        results = search_catalog(
            rows,
            args.query,
            limit=args.limit,
            reference_sample_id=args.reference_sample_id,
        )
        for result in results:
            print(
                f"{result['id']}\t{result['score']}\t{result['audioPath']}\t"
                f"{result['explanation']}"
            )
        return 0

    sidecar_path = _find_sidecar_by_sample_id(args.samples_root, args.sample_id)
    metadata = load_sidecar(sidecar_path)
    updated = apply_feedback(
        metadata,
        note=args.note,
        tags=[tag for tag in args.tags.split(",") if tag.strip()],
    )
    sidecar_path.write_text(json.dumps(updated, indent=2, sort_keys=True), encoding="utf-8")
    print(f"Updated metadata for {args.sample_id}")
    return 0
