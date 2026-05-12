"""
Shared pytest fixtures for DBS Architectes API tests.

The harness assumes nothing about the environment:
- Redis is mocked via a tiny in-memory stand-in (FakeRedis) so tests run
  without Docker.
- LLM calls use langchain's FakeListChatModel / FakeMessagesListChatModel
  to produce deterministic responses without hitting OpenAI.
- DB access is patched per-test with `AsyncSessionLocal` overrides.
- The FastAPI `get_current_user` dependency is overridden to a fixed test
  user so we don't need to mint real JWTs.
"""
from __future__ import annotations

import asyncio
import os
from collections.abc import AsyncIterator
from typing import Any
from unittest.mock import AsyncMock, MagicMock

import pytest
import pytest_asyncio
from asgi_lifespan import LifespanManager
from httpx import ASGITransport, AsyncClient

# Force safe defaults before the app imports settings — keeps tests hermetic.
os.environ.setdefault("DATABASE_URL", "postgresql+asyncpg://test:test@localhost/test")
os.environ.setdefault("REDIS_URL", "redis://localhost:6379/0")
os.environ.setdefault("OPENAI_API_KEY", "sk-test-fake-key-for-unit-tests")
os.environ.setdefault("SECRET_KEY", "test-secret-key-do-not-use-in-prod")
os.environ.setdefault("ENVIRONMENT", "test")
os.environ.setdefault("DEBUG", "true")


# ── Test user ─────────────────────────────────────────────────────────────────

TEST_USER_ID = "test-user-001"
TEST_USER_EMAIL = "tester@dbsarc.com"
TEST_USER_ROLE = "project_manager"


# ── Fake Redis (in-memory stand-in) ───────────────────────────────────────────

class FakeRedis:
    """A tiny Redis surrogate covering the methods our code uses.

    Not exhaustive — we add capabilities as tests need them. The goal is to run
    the full request path (rate limiting, pub/sub, cache) without a real server.
    """

    def __init__(self) -> None:
        self.store: dict[str, Any] = {}
        self.published: list[tuple[str, str]] = []
        self._pubsub_channels: dict[str, asyncio.Queue[str]] = {}

    async def ping(self) -> bool:
        return True

    async def get(self, key: str) -> Any:
        return self.store.get(key)

    async def setex(self, key: str, ttl: int, value: Any) -> bool:
        self.store[key] = value
        return True

    async def delete(self, *keys: str) -> int:
        deleted = 0
        for k in keys:
            if k in self.store:
                del self.store[k]
                deleted += 1
        return deleted

    async def keys(self, pattern: str) -> list[str]:
        import fnmatch
        return [k for k in self.store if fnmatch.fnmatchcase(k, pattern)]

    async def publish(self, channel: str, message: str) -> int:
        self.published.append((channel, message))
        q = self._pubsub_channels.get(channel)
        if q:
            await q.put(message)
        return 1

    async def aclose(self) -> None:
        return None

    def pipeline(self) -> "FakePipeline":
        return FakePipeline(self)


class FakePipeline:
    def __init__(self, redis: FakeRedis) -> None:
        self.redis = redis
        self._ops: list[tuple[str, tuple[Any, ...]]] = []

    def incr(self, key: str) -> "FakePipeline":
        self._ops.append(("incr", (key,)))
        return self

    def expire(self, key: str, seconds: int) -> "FakePipeline":
        self._ops.append(("expire", (key, seconds)))
        return self

    async def execute(self) -> list[Any]:
        results = []
        for op, args in self._ops:
            if op == "incr":
                key = args[0]
                self.redis.store[key] = int(self.redis.store.get(key, 0)) + 1
                results.append(self.redis.store[key])
            elif op == "expire":
                results.append(True)
        return results


@pytest.fixture
def fake_redis() -> FakeRedis:
    return FakeRedis()


@pytest_asyncio.fixture
async def patched_redis(monkeypatch, fake_redis: FakeRedis):
    """Swap the Redis singleton so every caller uses the in-memory fake.

    Because `get_redis()` lazily creates the client and caches it in the
    module-global `_redis_client`, pre-seeding that global with our fake
    ensures no real Redis connection is ever attempted.
    """
    from app.platform.cache import redis as redis_module

    monkeypatch.setattr(redis_module, "_redis_client", fake_redis)
    yield fake_redis


# ── FastAPI app with overridden auth ──────────────────────────────────────────

@pytest_asyncio.fixture
async def app_client(patched_redis) -> AsyncIterator[AsyncClient]:
    """Yield an httpx AsyncClient wired to the real FastAPI app.

    The `get_current_user` dep is overridden to return a fixed test user, so
    tests never need to mint JWTs.
    """
    from app.platform.auth.auth import TokenData, get_current_user
    from app.main import app

    async def _test_user() -> TokenData:
        return TokenData(user_id=TEST_USER_ID, email=TEST_USER_EMAIL, role=TEST_USER_ROLE)

    app.dependency_overrides[get_current_user] = _test_user
    async with LifespanManager(app):
        transport = ASGITransport(app=app)
        async with AsyncClient(transport=transport, base_url="http://test") as client:
            yield client
    app.dependency_overrides.clear()


# ── Mock DB session ───────────────────────────────────────────────────────────

class FakeResult:
    """Stand-in for SQLAlchemy Result — just enough for our tools."""

    def __init__(self, rows: list[dict[str, Any]] | None = None) -> None:
        self._rows = rows or []

    def mappings(self) -> "FakeResult":
        return self

    def all(self) -> list[dict[str, Any]]:
        return list(self._rows)

    def fetchone(self) -> tuple | None:
        if not self._rows:
            return None
        # Return tuple of values in order — matches result.fetchone() behavior
        return tuple(self._rows[0].values())


@pytest.fixture
def mock_db_session(monkeypatch):
    """Patch AsyncSessionLocal to return a session whose execute() is controllable.

    Usage::

        async def test_foo(mock_db_session):
            mock_db_session.set_rows([{"code": "DBS-2025-001", "title": "Le Saillen"}])
            result = await get_projects.ainvoke({})
    """

    class SessionController:
        def __init__(self) -> None:
            self._rows: list[dict[str, Any]] = []
            self.executed_queries: list[tuple[str, dict[str, Any]]] = []
            self.committed = False

        def set_rows(self, rows: list[dict[str, Any]]) -> None:
            self._rows = rows

        async def execute(self, query, params=None):
            self.executed_queries.append((str(query), params or {}))
            return FakeResult(self._rows)

        async def commit(self) -> None:
            self.committed = True

        async def rollback(self) -> None:
            pass

        async def close(self) -> None:
            pass

    controller = SessionController()

    class _FakeSessionContext:
        async def __aenter__(self):
            return controller

        async def __aexit__(self, *_):
            return None

    def _fake_session_local() -> _FakeSessionContext:
        return _FakeSessionContext()

    from app.platform.db import database
    monkeypatch.setattr(database, "AsyncSessionLocal", _fake_session_local)
    return controller


# ── Fake LLM ──────────────────────────────────────────────────────────────────

@pytest.fixture
def fake_llm_supervisor_route():
    """Patch the supervisor LLM to deterministically route to a given agent."""

    def _factory(target: str = "project_manager"):
        mock_response = MagicMock()
        mock_response.content = target
        mock_llm = MagicMock()
        mock_llm.ainvoke = AsyncMock(return_value=mock_response)
        return mock_llm

    return _factory
