import os

import pytest

pytestmark = pytest.mark.skipif(
    not os.environ.get("OPENAI_API_KEY"),
    reason="OPENAI_API_KEY not set",
)


def test_agent_imports():
    from sample_agent.agent import create_agent

    agent = create_agent()
    assert agent.name == "Sample Agent"
    assert len(agent.tools) >= 2
