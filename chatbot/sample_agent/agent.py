"""OpenAI Agents SDK agent with agentic search, query expansion, and verification loops."""

import argparse
import json
import subprocess
import sys
from collections import Counter
from pathlib import Path

from agents import Agent, Runner, function_tool

PROJECT_ROOT = Path(__file__).resolve().parent.parent
CATALOG_PATH = PROJECT_ROOT / "samples" / "_index" / "catalog.jsonl"
SAMPLES_ROOT = PROJECT_ROOT / "samples"
PROMPT_PATH = PROJECT_ROOT / "prompts" / "sample-retrieval.md"


def _load_catalog():
    """Load and cache catalog entries."""
    if not CATALOG_PATH.exists():
        return []
    return [
        json.loads(line)
        for line in CATALOG_PATH.read_text(encoding="utf-8").splitlines()
        if line.strip()
    ]


def _run_cli(*args: str) -> str:
    """Run a sample_agent.cli command and return its stdout."""
    result = subprocess.run(
        [sys.executable, "-m", "sample_agent.cli", *args],
        capture_output=True,
        text=True,
        cwd=str(PROJECT_ROOT),
    )
    if result.returncode != 0:
        return f"Error: {result.stderr.strip()}"
    return result.stdout.strip()


def _format_results(results: list[dict]) -> str:
    """Format search results with rich detail for the agent to reason about."""
    if not results:
        return "No results found."
    lines = []
    for r in results:
        tags = ", ".join(r.get("tags", [])[:5]) or "none"
        attrs = []
        for axis, vals in r.get("attributes", {}).items():
            attrs.extend(vals)
        attr_str = ", ".join(attrs) if attrs else "none"
        bpm = ""
        title = r.get("title", "")
        # Extract BPM from title if present
        import re
        bpm_match = re.search(r"(\d{2,3})\s*BPM", title, re.IGNORECASE)
        if bpm_match:
            bpm = f" | BPM: {bpm_match.group(1)}"
        key_match = re.search(r"([A-G]#?\s*(?:Min|Maj|min|maj))", title)
        key_str = f" | Key: {key_match.group(1)}" if key_match else ""

        lines.append(
            f"ID: {r['id']}\n"
            f"  Title: {title}\n"
            f"  Category: {r.get('category', '?')}\n"
            f"  Tags: {tags}\n"
            f"  Attributes: {attr_str}{bpm}{key_str}\n"
            f"  Description: {r.get('freeTextDescription', '')}\n"
            f"  Audio: {r.get('audioPath', '')}\n"
            f"  Score: {r.get('score', 0)}"
        )
    return "\n---\n".join(lines)


@function_tool
def search_samples(query: str, limit: int = 10) -> str:
    """Search the sample catalog by natural-language query. Call this MULTIPLE times
    with different queries to cover all dimensions of the user's request.
    Use targeted queries like 'dark kick', 'smooth pad', 'rnb drum loop'.

    Args:
        query: Natural-language description of the desired sound. Be specific.
        limit: Maximum results to return (default 10, use 5 for targeted searches).
    """
    if not CATALOG_PATH.exists():
        return "Error: catalog.jsonl not found. Run build-catalog first."
    entries = _load_catalog()
    from sample_agent.retrieval import search_catalog
    results = search_catalog(entries, query, limit=limit)
    return _format_results(results)


@function_tool
def search_similar(query: str, reference_sample_id: str, limit: int = 5) -> str:
    """Search for samples similar to a reference sample. Use this for
    'more like this' or refinement requests.

    Args:
        query: How to refine the search relative to the reference.
        reference_sample_id: The ID of the reference sample.
        limit: Maximum results to return.
    """
    if not CATALOG_PATH.exists():
        return "Error: catalog.jsonl not found. Run build-catalog first."
    entries = _load_catalog()
    from sample_agent.retrieval import search_catalog
    results = search_catalog(entries, query, limit=limit, reference_sample_id=reference_sample_id)
    return _format_results(results)


@function_tool
def browse_category(category: str, limit: int = 20) -> str:
    """List all samples in a specific category. Use this to see what's available
    when search terms are too specific, or to understand the library's coverage.

    Args:
        category: The category to browse (e.g., 'kick', '808', 'pad', 'loop_melody').
        limit: Maximum results to show.
    """
    entries = _load_catalog()
    matches = [e for e in entries if e.get("category", "").lower() == category.lower()]
    if not matches:
        # Try partial match
        matches = [e for e in entries if category.lower() in e.get("category", "").lower()]
    if not matches:
        return f"No samples found in category '{category}'. Use list_categories to see available categories."
    matches.sort(key=lambda e: e.get("title", ""))
    return f"Found {len(matches)} samples in '{category}' (showing {min(limit, len(matches))}):\n\n" + _format_results(matches[:limit])


@function_tool
def get_sample_details(sample_id: str) -> str:
    """Get full metadata for a specific sample. Use this to verify a search result
    is actually a good match before recommending it to the user.

    Args:
        sample_id: The sample ID to look up.
    """
    entries = _load_catalog()
    entry = next((e for e in entries if e["id"] == sample_id), None)
    if not entry:
        return f"Sample '{sample_id}' not found."
    return json.dumps(entry, indent=2)


@function_tool
def add_feedback(sample_id: str, note: str, tags: str = "") -> str:
    """Save user feedback (notes and tags) to a sample's metadata.

    Args:
        sample_id: The ID of the sample to annotate.
        note: A short note about why this sample was useful.
        tags: Comma-separated tags to add (e.g. "favorite,punchy,dark").
    """
    cli_args = [
        "feedback",
        "--samples-root", str(SAMPLES_ROOT),
        "--sample-id", sample_id,
        "--note", note,
    ]
    if tags:
        cli_args += ["--tags", tags]
    return _run_cli(*cli_args)


@function_tool
def list_categories() -> str:
    """List all categories and their counts in the sample catalog.
    Use this early for broad requests to understand what's available."""
    entries = _load_catalog()
    if not entries:
        return "Catalog is empty."
    counts = Counter(row.get("category", "unknown") for row in entries)
    lines = [f"{cat}: {count} samples" for cat, count in sorted(counts.items(), key=lambda x: -x[1])]
    return f"Total: {len(entries)} samples across {len(counts)} categories\n\n" + "\n".join(lines)


def _load_prompt() -> str:
    """Load the system prompt from prompts/sample-retrieval.md."""
    if PROMPT_PATH.exists():
        return PROMPT_PATH.read_text(encoding="utf-8")
    return "You are a music production assistant that helps find sound samples."


def create_agent(model: str = "gpt-5.4") -> Agent:
    """Create and return the Sample Agent."""
    return Agent(
        name="Sample Agent",
        model=model,
        instructions=_load_prompt(),
        tools=[
            search_samples,
            search_similar,
            browse_category,
            get_sample_details,
            add_feedback,
            list_categories,
        ],
    )


def main():
    parser = argparse.ArgumentParser(prog="sample-agent")
    parser.add_argument("--model", default="gpt-5.4", help="Model to use")
    args = parser.parse_args()

    from dotenv import load_dotenv
    load_dotenv(PROJECT_ROOT / ".env")

    agent = create_agent(model=args.model)

    print("Sample Agent ready. Type your query or 'quit' to exit.")
    print("---")

    while True:
        try:
            user_input = input("\nyou> ").strip()
        except (KeyboardInterrupt, EOFError):
            print("\nBye!")
            break

        if not user_input:
            continue
        if user_input.lower() in ("quit", "exit"):
            print("Bye!")
            break

        result = Runner.run_sync(agent, user_input)
        print(f"\nagent> {result.final_output}")


if __name__ == "__main__":
    main()
