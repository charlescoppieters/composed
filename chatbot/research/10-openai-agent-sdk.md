# OpenAI Agent SDK Research

> Research date: 2026-03-14

## 1. GPT-5.4 — Latest OpenAI Model

GPT-5.4 is real and is OpenAI's current frontier model, released March 5, 2026.

### Model IDs for API use

| Model ID | Description | Context | Max Output | Input $/1M | Output $/1M |
|---|---|---|---|---|---|
| `gpt-5.4` | Latest frontier (alias) | 1,050,000 | 128,000 | $2.50 | $15.00 |
| `gpt-5.4-2026-03-05` | Pinned snapshot | 1,050,000 | 128,000 | $2.50 | $15.00 |
| `gpt-5.4-pro` | Premium tier | 1,050,000 | 128,000 | higher | higher |
| `gpt-5.3-instant` | Fast/cheap everyday | — | — | cheaper | cheaper |

GPT-5.4 supports: function calling, vision (input), structured outputs, streaming, distillation, computer use, MCP, and 1M+ context.

Knowledge cutoff: August 31, 2025.

### For hackathon use

Use **`gpt-5.4`** as the model ID. It's the best balance of capability and cost. For budget-constrained work, `gpt-5.3-instant` is faster and cheaper.

---

## 2. OpenAI Agents SDK (Python)

OpenAI has an **official Agents SDK** — a lightweight Python framework for multi-agent workflows. It's the production successor to Swarm.

- **Package**: `openai-agents` (on PyPI)
- **Version**: 0.12.1 (as of March 13, 2026)
- **Repo**: https://github.com/openai/openai-agents-python
- **Docs**: https://openai.github.io/openai-agents-python/
- **Requires**: Python 3.10+

### Installation

```bash
pip install openai-agents
```

### Minimal hello world

```python
from agents import Agent, Runner

agent = Agent(name="Assistant", instructions="You are a helpful assistant")
result = Runner.run_sync(agent, "Write a haiku about recursion.")
print(result.final_output)
```

### Function tools with @function_tool

```python
from agents import Agent, Runner, function_tool

@function_tool
def search_samples(query: str) -> str:
    """Search the sample catalog for audio samples matching the query."""
    import subprocess
    result = subprocess.run(
        ["python3", "-m", "sample_agent.cli", "search",
         "--catalog", "samples/_index/catalog.jsonl",
         "--query", query],
        capture_output=True, text=True
    )
    return result.stdout or result.stderr

@function_tool
def add_feedback(sample_id: str, note: str, tags: str) -> str:
    """Add feedback to a sample. Tags is a comma-separated string."""
    import subprocess
    cmd = [
        "python3", "-m", "sample_agent.cli", "feedback",
        "--samples-root", "samples",
        "--sample-id", sample_id,
        "--note", note,
        "--tags", tags,
    ]
    result = subprocess.run(cmd, capture_output=True, text=True)
    return result.stdout or result.stderr

agent = Agent(
    name="Sample Agent",
    model="gpt-5.4",
    instructions="You help music producers find and organize audio samples.",
    tools=[search_samples, add_feedback],
)

result = Runner.run_sync(agent, "Find me some dark kick samples")
print(result.final_output)
```

**How it works**: The `@function_tool` decorator auto-generates a JSON schema from the function's type hints and docstring. The built-in `Runner` handles the agent loop — it calls the model, executes any tool calls, feeds results back, and loops until the model produces a final text response.

### Shell tool (built-in)

The SDK also provides `ShellTool` and `LocalShellTool` for direct shell command execution with approval workflows:

```python
from agents import Agent, ShellTool

# Full coding agent with shell access
shell_tool = ShellTool(executor=my_shell_executor)

agent = Agent(
    name="Coding Agent",
    model="gpt-5.4",
    instructions="You are a coding assistant.",
    tools=[shell_tool],
)
```

For the full shell executor pattern (with workspace isolation, timeouts, and approval), see the OpenAI Cookbook: [Build a coding agent with GPT-5.1](https://developers.openai.com/cookbook/examples/build_a_coding_agent_with_gpt-5.1).

### Key features

- **Agent loop**: Built-in via `Runner.run_sync()` or `Runner.run_streamed()`
- **Function tools**: `@function_tool` decorator with auto schema generation
- **Shell tools**: `ShellTool`, `LocalShellTool` for command execution
- **Handoffs**: Agent-to-agent delegation
- **Guardrails**: Input/output validation
- **Tracing**: Built-in for debugging and monitoring
- **Streaming**: Real-time event streaming
- **Provider-agnostic**: Works with OpenAI, plus 100+ other LLMs

### Caveat

Requires Python 3.10+. The existing project uses `>=3.9` in pyproject.toml — would need to bump to 3.10.

---

## 3. Raw OpenAI Python SDK (function calling loop)

If you want even less abstraction, you can use the base `openai` package with manual function calling:

```python
import json
import subprocess
from openai import OpenAI

client = OpenAI()

tools = [
    {
        "type": "function",
        "function": {
            "name": "search_samples",
            "description": "Search the sample catalog for audio samples",
            "parameters": {
                "type": "object",
                "properties": {
                    "query": {"type": "string", "description": "Search query"}
                },
                "required": ["query"],
            },
        },
    },
    {
        "type": "function",
        "function": {
            "name": "add_feedback",
            "description": "Add feedback to a sample",
            "parameters": {
                "type": "object",
                "properties": {
                    "sample_id": {"type": "string"},
                    "note": {"type": "string"},
                    "tags": {"type": "string"},
                },
                "required": ["sample_id", "note", "tags"],
            },
        },
    },
]

def execute_tool(name, args):
    if name == "search_samples":
        r = subprocess.run(
            ["python3", "-m", "sample_agent.cli", "search",
             "--catalog", "samples/_index/catalog.jsonl",
             "--query", args["query"]],
            capture_output=True, text=True,
        )
        return r.stdout or r.stderr
    elif name == "add_feedback":
        r = subprocess.run(
            ["python3", "-m", "sample_agent.cli", "feedback",
             "--samples-root", "samples",
             "--sample-id", args["sample_id"],
             "--note", args["note"],
             "--tags", args["tags"]],
            capture_output=True, text=True,
        )
        return r.stdout or r.stderr
    return "Unknown tool"

def run_agent(user_message: str):
    messages = [
        {"role": "system", "content": "You help music producers find and organize audio samples."},
        {"role": "user", "content": user_message},
    ]

    while True:
        response = client.chat.completions.create(
            model="gpt-5.4",
            messages=messages,
            tools=tools,
        )
        msg = response.choices[0].message
        messages.append(msg)

        if not msg.tool_calls:
            return msg.content

        for tc in msg.tool_calls:
            result = execute_tool(tc.function.name, json.loads(tc.function.arguments))
            messages.append({
                "role": "tool",
                "tool_call_id": tc.id,
                "content": result,
            })

print(run_agent("Find me some dark kick samples"))
```

**Pros**: Zero extra dependencies, full control, ~50 lines of code.
**Cons**: Manual loop, manual schema, no streaming/tracing built in.

---

## 4. Vercel AI SDK (TypeScript)

The Vercel AI SDK (`ai` package) provides a TypeScript-first agent framework. As of 2026, it's at version 6 with a dedicated `Agent` abstraction.

```bash
npm install ai @ai-sdk/openai zod
```

```typescript
import { Agent } from 'ai';
import { openai } from '@ai-sdk/openai';
import { z } from 'zod';
import { execSync } from 'child_process';

const agent = new Agent({
  model: openai('gpt-5.4'),
  system: 'You help music producers find and organize audio samples.',
  tools: {
    searchSamples: {
      description: 'Search the sample catalog',
      parameters: z.object({ query: z.string() }),
      execute: async ({ query }) => {
        const result = execSync(
          `python3 -m sample_agent.cli search --catalog samples/_index/catalog.jsonl --query "${query}"`,
          { encoding: 'utf-8' }
        );
        return result;
      },
    },
    addFeedback: {
      description: 'Add feedback to a sample',
      parameters: z.object({
        sampleId: z.string(),
        note: z.string(),
        tags: z.string(),
      }),
      execute: async ({ sampleId, note, tags }) => {
        const result = execSync(
          `python3 -m sample_agent.cli feedback --samples-root samples --sample-id ${sampleId} --note "${note}" --tags "${tags}"`,
          { encoding: 'utf-8' }
        );
        return result;
      },
    },
  },
});

// Usage
const result = await agent.run('Find me some dark kick samples');
console.log(result.text);
```

**Pros**: Excellent TypeScript DX, Zod schemas, streaming built-in, works in Next.js.
**Cons**: TypeScript (project is Python), extra Node.js runtime, would shell out to Python CLI.

---

## 5. Other Minimal Agent Frameworks

### smolagents (HuggingFace)
- ~10K lines of code, radically simple
- Agents write Python code to achieve goals (not JSON tool schemas)
- Good for quick prototypes
- Less structured than OpenAI Agents SDK

### Pydantic AI
- Type-safe agent framework with Pydantic validation
- Good for Python developers who want explicit contracts
- More structured than smolagents

### LangChain / LangGraph
- Heavy, lots of abstractions
- Overkill for a hackathon

### Raw function calling (no framework)
- See Section 3 above — ~50 lines of Python
- Maximum simplicity, zero learning curve

---

## 6. Recommendation for Hackathon

### Winner: OpenAI Agents SDK (`openai-agents`)

For a 2-day hackathon with an existing Python codebase, the **OpenAI Agents SDK** is the best choice:

1. **Minimal code** — ~15 lines to get a working tool-calling agent
2. **Python-native** — matches the existing codebase
3. **@function_tool** — just decorate your functions, schema is auto-generated
4. **Built-in agent loop** — `Runner.run_sync()` handles everything
5. **Shell tools** — `ShellTool` / `LocalShellTool` built in if needed
6. **GPT-5.4 support** — first-class, it's OpenAI's own SDK
7. **Streaming** — `Runner.run_streamed()` for real-time output
8. **Tracing** — built-in debugging, useful during hackathon development

### Runner-up: Raw `openai` SDK

If you want zero extra dependencies and full control, the raw function calling loop (~50 lines) is perfectly fine. You lose streaming/tracing/handoffs but gain simplicity.

### Quick start plan

```bash
# 1. Bump Python requirement to 3.10+ in pyproject.toml
# 2. Install
pip install openai-agents

# 3. Set API key
export OPENAI_API_KEY=sk-...

# 4. Create agent (see Section 2 example above)
# 5. Run it
python3 -m your_agent_module
```

### What NOT to use

- **Vercel AI SDK** — great but adds TypeScript/Node when project is Python
- **LangChain** — too heavy for a hackathon
- **smolagents** — code-execution model is interesting but less predictable for structured CLI tool calling

---

## Sources

- [OpenAI Agents SDK docs](https://openai.github.io/openai-agents-python/)
- [OpenAI Agents SDK on PyPI](https://pypi.org/project/openai-agents/)
- [OpenAI Agents SDK GitHub](https://github.com/openai/openai-agents-python)
- [GPT-5.4 model docs](https://developers.openai.com/api/docs/models/gpt-5.4)
- [GPT-5.4 announcement](https://openai.com/index/introducing-gpt-5-4/)
- [OpenAI function calling guide](https://platform.openai.com/docs/guides/function-calling)
- [Build a coding agent cookbook](https://developers.openai.com/cookbook/examples/build_a_coding_agent_with_gpt-5.1)
- [Vercel AI SDK](https://ai-sdk.dev/docs/introduction)
- [Vercel AI SDK 6 announcement](https://vercel.com/blog/ai-sdk-6)
- [AI agent framework comparison (Langfuse)](https://langfuse.com/blog/2025-03-19-ai-agent-comparison)
- [Pydantic AI](https://ai.pydantic.dev/)
