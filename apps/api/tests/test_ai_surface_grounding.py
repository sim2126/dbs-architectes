from __future__ import annotations

import json
from types import SimpleNamespace
from unittest.mock import AsyncMock

import pytest
from langchain_core.messages import AIMessage, HumanMessage, ToolMessage

from app.platform.ai.grounding import (
    AiSurface,
    ResolvedContext,
    ResolvedProject,
    ResolvedUser,
)
from app.platform.ai.provider import ProviderFailure


class _ProviderHttpError(RuntimeError):
    def __init__(self, status_code: int) -> None:
        super().__init__(f"upstream detail must not escape: {status_code}")
        self.status_code = status_code


PROVIDER_FAILURES = [
    pytest.param(_ProviderHttpError(500), "unavailable", id="http-500"),
    pytest.param(TimeoutError("secret timeout detail"), "timeout", id="timeout"),
    pytest.param(_ProviderHttpError(429), "rate_limited", id="rate-limit"),
]


def _resolved_context(surface: AiSurface = "dbs-gpt") -> ResolvedContext:
    return ResolvedContext(
        surface=surface,
        resolved_at="2026-08-03T12:00:00Z",
        users=(
            ResolvedUser(
                id="user-giulio",
                name="Giulio Sovran",
                email="giulio.sovran@dbsarc.com",
                aliases=("Giulio Sovran", "Giulio"),
            ),
        ),
        projects=(
            ResolvedProject(
                id="project-saillen",
                code="DBS-2025-001",
                title="Le Saillen",
                phase="ETUDE/AP",
                client=None,
                commune="Salins",
                aliases=("DBS-2025-001", "Le Saillen"),
            ),
        ),
        phases=(),
        dates=(),
        recent_meeting_decisions=(),
        unresolved=(),
    )


def _answer(**overrides: object) -> str:
    value: dict[str, object] = {
        "answer": "Le Saillen is available.",
        "userIds": [],
        "projectIds": ["project-saillen"],
        "phases": [],
        "dates": [],
    }
    value.update(overrides)
    return json.dumps(value)


@pytest.mark.parametrize(
    "prompt",
    [
        "Project health report",
        "Show blocked projects",
        "Show stuck projects",
        "Give me an at-risk projects overview",
    ],
)
def test_project_health_surface_classification_matches_entry_points(prompt: str) -> None:
    from app.features.ai.server.grounding_contracts import (
        surface_for_portfolio_request,
    )

    assert surface_for_portfolio_request(prompt, "dbs-gpt") == "project-health"


async def test_dbs_gpt_resolves_grounding_before_graph_and_validates_output(
    monkeypatch,
) -> None:
    from app.features.ai.server.dbs_gpt import graph

    order: list[str] = []
    resolved = _resolved_context("project-health")

    async def resolve(contract):
        order.append("resolve")
        assert contract.surface == "project-health"
        return resolved

    async def invoke(initial_state, config):
        del config
        order.append("provider")
        assert initial_state["resolved_context"] is resolved
        return {
            **initial_state,
            "messages": [AIMessage(content=_answer())],
            "visited_nodes": ["supervisor", "data_analyst"],
        }

    monkeypatch.setattr(graph, "resolve_grounding", resolve)
    monkeypatch.setattr(graph, "compiled_graph", SimpleNamespace(ainvoke=invoke))

    answer, trace = await graph.run_agent_with_trace(
        message="Portfolio health overview",
        user_id="user-giulio",
    )

    assert order == ["resolve", "provider"]
    assert answer == "Le Saillen is available."
    assert trace["grounding_surface"] == "project-health"


async def test_dbs_gpt_rejects_unresolved_final_project(monkeypatch) -> None:
    from app.features.ai.server.dbs_gpt import graph

    resolved = _resolved_context()

    async def invoke(initial_state, config):
        del config
        return {
            **initial_state,
            "messages": [
                AIMessage(content=_answer(projectIds=["invented-project"]))
            ],
        }

    monkeypatch.setattr(graph, "resolve_grounding", AsyncMock(return_value=resolved))
    monkeypatch.setattr(graph, "compiled_graph", SimpleNamespace(ainvoke=invoke))

    with pytest.raises(ProviderFailure, match="validated response"):
        await graph.run_agent_with_trace(
            message="Show Le Saillen",
            user_id="user-giulio",
        )


async def test_chat_agent_emits_only_validated_answer(monkeypatch) -> None:
    from app.features.ai.server.chat_agent import agent

    order: list[str] = []
    resolved = _resolved_context("chat-agent")

    async def resolve(contract):
        order.append("resolve")
        assert contract.surface == "chat-agent"
        return resolved

    class FakeModel:
        def bind_tools(self, tools):
            assert tools
            return self

        async def ainvoke(self, history):
            order.append("provider")
            assert "resolvedContext" not in str(history[0].content)
            assert "project-saillen" in str(history[0].content)
            return AIMessage(content=_answer())

    monkeypatch.setattr(agent, "resolve_grounding", resolve)
    monkeypatch.setattr(
        agent,
        "create_openai_structured_chat_model",
        lambda **_kwargs: FakeModel(),
    )

    events = [
        event
        async for event in agent.run_chat_agent(
            [{"role": "user", "content": "Show Le Saillen"}],
            user_id="user-giulio",
            stream=False,
        )
    ]

    assert order == ["resolve", "provider"]
    assert events == [
        {"type": "text", "content": "Le Saillen is available."},
        {"type": "done"},
    ]


async def test_chat_agent_fails_closed_on_unresolved_output(monkeypatch) -> None:
    from app.features.ai.server.chat_agent import agent

    class FakeModel:
        def bind_tools(self, _tools):
            return self

        async def ainvoke(self, _history):
            return AIMessage(content=_answer(projectIds=["invented-project"]))

    monkeypatch.setattr(
        agent,
        "resolve_grounding",
        AsyncMock(return_value=_resolved_context("chat-agent")),
    )
    monkeypatch.setattr(
        agent,
        "create_openai_structured_chat_model",
        lambda **_kwargs: FakeModel(),
    )

    events = [
        event
        async for event in agent.run_chat_agent(
            [{"role": "user", "content": "Invent a project"}],
            stream=False,
        )
    ]

    assert events == [
        {
            "type": "error",
            "kind": "invalid_output",
            "message": "AI Assistant could not produce a validated response. Please try again.",
        }
    ]


@pytest.mark.parametrize(("provider_error", "expected_kind"), PROVIDER_FAILURES)
async def test_chat_agent_fails_closed_on_provider_failures(
    monkeypatch,
    provider_error: BaseException,
    expected_kind: str,
) -> None:
    from app.features.ai.server.chat_agent import agent

    class FakeModel:
        def bind_tools(self, _tools):
            return self

        async def ainvoke(self, _history):
            raise provider_error

    monkeypatch.setattr(
        agent,
        "resolve_grounding",
        AsyncMock(return_value=_resolved_context("chat-agent")),
    )
    monkeypatch.setattr(
        agent,
        "create_openai_structured_chat_model",
        lambda **_kwargs: FakeModel(),
    )

    events = [
        event
        async for event in agent.run_chat_agent(
            [{"role": "user", "content": "Show Le Saillen"}],
            stream=False,
        )
    ]

    assert events[0]["type"] == "error"
    assert events[0]["kind"] == expected_kind
    assert "AI Assistant" in events[0]["message"]
    assert "upstream detail" not in events[0]["message"]
    assert "secret timeout" not in events[0]["message"]


@pytest.mark.parametrize("surface", ["dbs-gpt", "project-health"])
@pytest.mark.parametrize(("provider_error", "expected_kind"), PROVIDER_FAILURES)
async def test_dbs_gpt_nodes_normalise_provider_failures(
    monkeypatch,
    surface: AiSurface,
    provider_error: BaseException,
    expected_kind: str,
) -> None:
    from app.features.ai.server.dbs_gpt import nodes

    class FakeModel:
        def bind_tools(self, _tools):
            return self

        async def ainvoke(self, _messages):
            raise provider_error

    monkeypatch.setattr(nodes, "_llm", lambda **_kwargs: FakeModel())
    state = {
        "messages": [HumanMessage(content="Show project health")],
        "user_id": "user-giulio",
        "user_role": "viewer",
        "project_id": None,
        "project_context": None,
        "resolved_context": _resolved_context(surface),
        "next": None,
        "task_type": None,
        "final_response": None,
        "error": None,
        "iteration_count": 0,
        "visited_nodes": [],
    }
    call = nodes.data_analyst_node if surface == "project-health" else nodes.project_manager_node

    with pytest.raises(ProviderFailure) as caught:
        await call(state)  # type: ignore[arg-type]
    assert caught.value.kind == expected_kind
    assert "upstream detail" not in str(caught.value)
    assert "secret timeout" not in str(caught.value)


async def test_chat_title_uses_structured_output_and_grounding(monkeypatch) -> None:
    from app.features.ai.server.chat_agent import title_generator

    response = SimpleNamespace(
        choices=[
            SimpleNamespace(
                message=SimpleNamespace(
                    content=json.dumps(
                        {
                            "title": "Le Saillen status",
                            "userIds": [],
                            "projectIds": ["project-saillen"],
                        }
                    )
                )
            )
        ]
    )
    create = AsyncMock(return_value=response)
    client = SimpleNamespace(
        chat=SimpleNamespace(completions=SimpleNamespace(create=AsyncMock()))
    )
    monkeypatch.setattr(
        title_generator,
        "resolve_grounding",
        AsyncMock(return_value=_resolved_context("chat-agent")),
    )
    monkeypatch.setattr(title_generator, "AsyncOpenAI", lambda: client)
    monkeypatch.setattr(title_generator, "create_openai_structured_completion", create)

    title = await title_generator.generate_chat_title(
        "What is happening with Le Saillen?",
        user_id="user-giulio",
    )

    assert title == "Le Saillen status"
    assert create.await_args is not None
    assert create.await_args.kwargs["schema_name"] == "GroundedChatTitle"


def test_dbs_gpt_tool_messages_extend_grounding_dates() -> None:
    from app.features.ai.server.dbs_gpt.nodes import (
        extend_grounding_from_tool_messages,
    )

    context = _resolved_context("dbs-gpt")
    extended = extend_grounding_from_tool_messages(
        context,
        [
            ToolMessage(
                content='{"deadline":"2026-08-19T10:00:00Z"}',
                tool_call_id="deadline-1",
            )
        ],
    )

    assert [item.iso_date for item in extended.dates] == ["2026-08-19"]
    assert context.dates == ()


def test_dbs_gpt_checkpoints_are_user_scoped_and_strip_provider_history() -> None:
    from app.features.ai.server.dbs_gpt.graph import (
        checkpoint_history_removals,
        checkpoint_thread_key,
    )

    assert checkpoint_thread_key("user-a", "shared") != checkpoint_thread_key(
        "user-b", "shared"
    )
    history = [
        HumanMessage(content="Show the project", id="human-1"),
        AIMessage(content="Restricted result", id="assistant-1"),
        ToolMessage(content='{"secret":true}', tool_call_id="tool-1", id="tool-message-1"),
    ]
    removals = checkpoint_history_removals(history)
    assert [message.id for message in removals] == ["assistant-1", "tool-message-1"]
