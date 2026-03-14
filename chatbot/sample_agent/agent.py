"""OpenAI Agents SDK agent with search, feedback, and interactive REPL."""

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


@function_tool
def search_samples(query: str, limit: int = 5) -> str:
    """Search the sample catalog by natural-language query.

    Args:
        query: Natural-language description of the desired sound.
        limit: Maximum number of results to return.
    """
    if not CATALOG_PATH.exists():
        return "Error: catalog.jsonl not found. Run build-catalog first."
    return _run_cli(
        "search",
        "--catalog", str(CATALOG_PATH),
        "--query", query,
        "--limit", str(limit),
    )


@function_tool
def search_similar(query: str, reference_sample_id: str, limit: int = 5) -> str:
    """Search for samples similar to a reference sample.

    Args:
        query: Natural-language description of how to refine the search.
        reference_sample_id: The ID of the reference sample to find similar sounds to.
        limit: Maximum number of results to return.
    """
    if not CATALOG_PATH.exists():
        return "Error: catalog.jsonl not found. Run build-catalog first."
    return _run_cli(
        "search",
        "--catalog", str(CATALOG_PATH),
        "--query", query,
        "--reference-sample-id", reference_sample_id,
        "--limit", str(limit),
    )


@function_tool
def add_feedback(sample_id: str, note: str, tags: str = "") -> str:
    """Save user feedback (notes and tags) to a sample's metadata.

    Args:
        sample_id: The ID of the sample to annotate.
        note: A short note about why this sample was useful.
        tags: Comma-separated tags to add (e.g. "favorite,punchy,dark").
    """
    return _run_cli(
        "feedback",
        "--samples-root", str(SAMPLES_ROOT),
        "--sample-id", sample_id,
        "--note", note,
        "--tags", tags,
    )


@function_tool
def list_categories() -> str:
    """List all categories and their counts in the sample catalog."""
    if not CATALOG_PATH.exists():
        return "Error: catalog.jsonl not found. Run build-catalog first."
    rows = [
        json.loads(line)
        for line in CATALOG_PATH.read_text(encoding="utf-8").splitlines()
        if line.strip()
    ]
    if not rows:
        return "Catalog is empty."
    counts = Counter(row.get("category", "unknown") for row in rows)
    lines = [f"{cat}: {count}" for cat, count in sorted(counts.items(), key=lambda x: -x[1])]
    return f"Total samples: {len(rows)}\n" + "\n".join(lines)


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
        tools=[search_samples, search_similar, add_feedback, list_categories],
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
