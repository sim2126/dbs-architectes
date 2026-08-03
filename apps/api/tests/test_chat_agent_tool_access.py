"""Access-scope regression tests for Aria's read-only database tools."""

from __future__ import annotations

import json
from typing import Any

import pytest
from langchain_core.messages import AIMessage

from app.features.ai.server.chat_agent.tools import (
    get_activity_log,
    get_agenda,
    get_project_details,
    get_project_thread,
    get_statistics,
    get_team_messages,
    get_team_workload,
    search_projects,
)
from app.features.ai.server.dbs_gpt.security_context import (
    require_agent_subject,
    reset_agent_subject,
    set_agent_subject,
)
from app.platform.ai.grounding import ResolvedContext


class _EmptyResult:
    def mappings(self) -> _EmptyResult:
        return self

    def all(self) -> list[dict[str, Any]]:
        return []

    def first(self) -> None:
        return None

    def scalar(self) -> int:
        return 0


class _RecordingSession:
    def __init__(self) -> None:
        self.queries: list[tuple[str, dict[str, Any]]] = []

    async def execute(self, query: object, params: dict[str, Any] | None = None) -> _EmptyResult:
        self.queries.append((str(query), params or {}))
        return _EmptyResult()


@pytest.fixture
def recording_db(monkeypatch) -> _RecordingSession:
    session = _RecordingSession()

    class _SessionContext:
        async def __aenter__(self) -> _RecordingSession:
            return session

        async def __aexit__(self, *_args: object) -> None:
            return None

    from app.platform.db import database

    monkeypatch.setattr(database, "AsyncSessionLocal", _SessionContext)
    return session


@pytest.mark.parametrize(
    ("agent_tool", "arguments"),
    [
        (search_projects, {}),
        (get_project_details, {"project_id": "project-private"}),
        (get_project_thread, {"project_id": "project-private"}),
        (get_agenda, {}),
        (get_statistics, {}),
        (get_team_workload, {}),
        (get_activity_log, {}),
    ],
)
async def test_project_derived_tools_apply_request_subject_scope(
    agent_tool,
    arguments: dict[str, Any],
    recording_db: _RecordingSession,
) -> None:
    tokens = set_agent_subject("employee-1", "employee")
    try:
        await agent_tool.ainvoke(arguments)
    finally:
        reset_agent_subject(tokens)

    assert recording_db.queries
    for query, params in recording_db.queries:
        assert ":is_admin" in query
        assert ":user_id" in query
        assert '"ProjectAssignment"' in query
        assert params["is_admin"] is False
        assert params["user_id"] == "employee-1"


async def test_workspace_admin_retains_portfolio_access(
    recording_db: _RecordingSession,
) -> None:
    tokens = set_agent_subject("admin-1", "admin")
    try:
        await search_projects.ainvoke({})
    finally:
        reset_agent_subject(tokens)

    _query, params = recording_db.queries[0]
    assert params["is_admin"] is True
    assert params["user_id"] == "admin-1"


async def test_team_messages_only_read_visible_non_project_channels(
    recording_db: _RecordingSession,
) -> None:
    tokens = set_agent_subject("employee-1", "employee")
    try:
        await get_team_messages.ainvoke({})
    finally:
        reset_agent_subject(tokens)

    query, params = recording_db.queries[0]
    assert 'c."projectId" IS NULL' in query
    assert "c.type = 'public'" in query
    assert '"ChannelMember"' in query
    assert 'c."createdBy" = :user_id' in query
    assert params == {"limit": 30, "user_id": "employee-1", "is_admin": False}


def _resolved_context() -> ResolvedContext:
    return ResolvedContext(
        surface="chat-agent",
        resolved_at="2026-08-03T12:00:00Z",
        users=(),
        projects=(),
        phases=(),
        dates=(),
        recent_meeting_decisions=(),
        unresolved=(),
    )


async def test_run_chat_agent_sets_tool_subject_and_restores_previous_context(
    monkeypatch,
) -> None:
    from app.features.ai.server.chat_agent import agent

    observed_subjects: list[tuple[str, str]] = []

    class _ScopeProbe:
        name = "scope_probe"

        async def ainvoke(self, _arguments: dict[str, Any]) -> str:
            observed_subjects.append(require_agent_subject())
            return json.dumps({"ok": True})

    class _FakeModel:
        calls = 0

        def bind_tools(self, _tools: list[Any]) -> _FakeModel:
            return self

        async def ainvoke(self, _history: list[Any]) -> AIMessage:
            self.calls += 1
            if self.calls == 1:
                return AIMessage(
                    content="",
                    tool_calls=[
                        {
                            "name": "scope_probe",
                            "args": {},
                            "id": "scope-call",
                            "type": "tool_call",
                        }
                    ],
                )
            return AIMessage(
                content=json.dumps(
                    {
                        "answer": "Scope confirmed.",
                        "userIds": [],
                        "projectIds": [],
                        "phases": [],
                        "dates": [],
                    }
                )
            )

    async def resolve(_contract: object) -> ResolvedContext:
        assert require_agent_subject() == ("request-user", "employee")
        return _resolved_context()

    monkeypatch.setattr(agent, "resolve_grounding", resolve)
    monkeypatch.setattr(agent, "ALL_TOOLS", [_ScopeProbe()])
    monkeypatch.setattr(
        agent,
        "create_openai_structured_chat_model",
        lambda **_kwargs: _FakeModel(),
    )

    outer_tokens = set_agent_subject("outer-user", "viewer")
    try:
        events = [
            event
            async for event in agent.run_chat_agent(
                [{"role": "user", "content": "Check scope"}],
                user_id="request-user",
                user_role="employee",
                stream=False,
            )
        ]
        assert require_agent_subject() == ("outer-user", "viewer")
    finally:
        reset_agent_subject(outer_tokens)

    assert observed_subjects == [("request-user", "employee")]
    assert events[-2:] == [
        {"type": "text", "content": "Scope confirmed."},
        {"type": "done"},
    ]
