"""
Endpoint tests for /api/agents/* routes.

We exercise the HTTP surface of the FastAPI app end-to-end (middleware,
auth override, request validation, error handling) without Celery, Redis,
or OpenAI being real — all external edges are stubbed in conftest.
"""
from __future__ import annotations

import pytest

from app.platform.ai.provider import ProviderFailure


async def test_health_endpoint_returns_ok(app_client):
    resp = await app_client.get("/health")
    assert resp.status_code == 200
    assert resp.json()["status"] == "ok"


async def test_chat_rejects_empty_message(app_client):
    resp = await app_client.post("/api/agents/chat", json={"message": ""})
    assert resp.status_code == 422  # pydantic min_length violation


async def test_chat_rejects_oversized_message(app_client):
    resp = await app_client.post("/api/agents/chat", json={"message": "x" * 4001})
    assert resp.status_code == 422  # pydantic max_length violation


async def test_chat_submit_returns_task_id(app_client, monkeypatch):
    """Submitting a chat message should return a task_id immediately."""
    from app.routers import agents as agents_router

    fake_task = type("_Task", (), {"id": "task-abc-123"})()
    # Celery's apply_async is synchronous; wrap as Mock not AsyncMock
    from unittest.mock import Mock
    monkeypatch.setattr(
        agents_router.run_dbs_gpt_task,
        "apply_async",
        Mock(return_value=fake_task),
    )

    resp = await app_client.post(
        "/api/agents/chat",
        json={"message": "Give me the status of Le Saillen."},
    )
    assert resp.status_code == 200
    body = resp.json()
    assert body["task_id"] == "task-abc-123"
    assert body["status"] == "queued"


async def test_chat_sync_runs_agent_inline(app_client, monkeypatch):
    """Sync endpoint should execute the agent and return response + trace."""
    async def _fake_run_agent_with_trace(**kwargs):
        return (
            f"Sync response to: {kwargs['message']}",
            {
                "visited_nodes": ["supervisor", "project_manager"],
                "tool_calls": [
                    {"name": "get_projects", "args": {"limit": 5}, "result": "3 rows"},
                ],
                "iteration_count": 1,
            },
        )

    import app.features.ai.server.dbs_gpt.graph as graph_module
    monkeypatch.setattr(graph_module, "run_agent_with_trace", _fake_run_agent_with_trace)

    resp = await app_client.post(
        "/api/agents/chat/sync",
        json={"message": "Hello DBS GPT"},
    )
    assert resp.status_code == 200
    body = resp.json()
    assert body["response"] == "Sync response to: Hello DBS GPT"
    assert body["duration_ms"] >= 0
    assert body["visited_nodes"] == ["supervisor", "project_manager"]
    assert len(body["tool_calls"]) == 1
    assert body["tool_calls"][0]["name"] == "get_projects"
    assert body["iteration_count"] == 1


@pytest.mark.parametrize(
    ("failure", "status_code", "message"),
    [
        (
            ProviderFailure("unavailable", cause=RuntimeError("secret 500 payload")),
            503,
            "AI Assistant is temporarily unavailable. Please try again shortly.",
        ),
        (
            ProviderFailure("timeout", cause=RuntimeError("secret timeout payload")),
            503,
            "AI Assistant did not receive a response in time. Please try again.",
        ),
        (
            ProviderFailure("rate_limited", cause=RuntimeError("secret quota payload")),
            429,
            "AI Assistant is temporarily busy. Please try again shortly.",
        ),
    ],
)
async def test_chat_sync_returns_safe_provider_failures(
    app_client,
    monkeypatch,
    failure: ProviderFailure,
    status_code: int,
    message: str,
):
    async def _fail(**_kwargs):
        raise failure

    import app.features.ai.server.dbs_gpt.graph as graph_module

    monkeypatch.setattr(graph_module, "run_agent_with_trace", _fail)
    response = await app_client.post(
        "/api/agents/chat/sync",
        json={"message": "Show project health"},
    )

    assert response.status_code == status_code
    assert response.json() == {"detail": message}
    assert "secret" not in response.text


async def test_chat_sync_rate_limited_after_threshold(app_client, patched_redis, monkeypatch):
    """Hitting the rate limit should return 429."""
    from app.platform.config import config

    # Lower the limit to make the test fast
    monkeypatch.setattr(config.settings, "AGENT_RATE_LIMIT_PER_MINUTE", 2)

    # Stub the agent so we don't care about its output
    async def _noop(**_):
        return ("ok", {"visited_nodes": [], "tool_calls": [], "iteration_count": 0})
    import app.features.ai.server.dbs_gpt.graph as graph_module
    monkeypatch.setattr(graph_module, "run_agent_with_trace", _noop)

    # Two requests succeed, third should hit 429
    for _ in range(2):
        r = await app_client.post("/api/agents/chat/sync", json={"message": "hi"})
        assert r.status_code == 200, r.text

    r3 = await app_client.post("/api/agents/chat/sync", json={"message": "hi"})
    assert r3.status_code == 429
    assert "Too many requests" in r3.json()["detail"]
