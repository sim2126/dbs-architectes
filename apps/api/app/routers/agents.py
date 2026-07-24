"""
FastAPI routes for DBS GPT agent.

POST /api/agents/chat        → submit a message, get task_id back immediately
GET  /api/agents/tasks/{id}  → poll for task result
GET  /api/agents/stream/{id} → SSE stream for real-time task updates
"""
import asyncio
import json

import structlog
from fastapi import APIRouter, Depends, HTTPException
from fastapi.responses import StreamingResponse
from pydantic import BaseModel, Field
from sqlalchemy import text

from app.platform.auth.auth import TokenData, get_current_user
from app.platform.cache.redis import cache_get, cache_set, get_redis
from app.platform.cache.redis import check_rate_limit as redis_rate_limit
from app.platform.config.config import settings
from app.tasks.agent_tasks import run_dbs_gpt_task

logger = structlog.get_logger(__name__)
router = APIRouter(prefix="/agents", tags=["agents"])


# ── Schemas ───────────────────────────────────────────────────────────────────

class ChatRequest(BaseModel):
    message: str = Field(..., min_length=1, max_length=4000)
    project_id: str | None = None
    thread_id: str | None = None


class ChatResponse(BaseModel):
    task_id: str
    status: str = "queued"
    message: str = "Your request is being processed."


class TaskResult(BaseModel):
    task_id: str
    status: str         # queued | running | completed | failed
    response: str | None = None
    error: str | None = None


class ToolCallTrace(BaseModel):
    name: str
    args: dict
    result: str


class SyncChatResponse(BaseModel):
    response: str
    duration_ms: float
    visited_nodes: list[str]
    tool_calls: list[ToolCallTrace]
    iteration_count: int


async def require_project_access(project_id: str | None, current_user: TokenData) -> None:
    if not project_id or current_user.role in {"admin", "super_admin"}:
        return
    from app.platform.db.database import AsyncSessionLocal

    async with AsyncSessionLocal() as db:
        result = await db.execute(
            text(
                'SELECT 1 FROM "ProjectAssignment" '
                'WHERE "projectId" = :project_id AND "userId" = :user_id'
            ),
            {"project_id": project_id, "user_id": current_user.user_id},
        )
        if result.first() is None:
            raise HTTPException(status_code=404, detail="Project not found")


# ── Routes ────────────────────────────────────────────────────────────────────

@router.post("/chat", response_model=ChatResponse)
async def submit_chat(
    body: ChatRequest,
    current_user: TokenData = Depends(get_current_user),
):
    """
    Submit a message to DBS GPT. Returns immediately with a task_id.
    The agent runs in the background via Celery.
    Poll /tasks/{task_id} or subscribe to /stream/{task_id} for the response.
    """
    # Rate limiting: 20 agent requests per minute per user
    allowed = await redis_rate_limit(
        user_id=current_user.user_id,
        action="agent_chat",
        limit=settings.AGENT_RATE_LIMIT_PER_MINUTE,
    )
    if not allowed:
        raise HTTPException(status_code=429, detail="Too many requests. Please wait a moment.")
    await require_project_access(body.project_id, current_user)

    logger.info("agent.chat_submitted", user_id=current_user.user_id, message_len=len(body.message))

    priority = current_user.role in {"admin", "super_admin", "project_manager", "director"}
    task = run_dbs_gpt_task.apply_async(
        kwargs={
            "message": body.message,
            "user_id": current_user.user_id,
            "user_role": current_user.role,
            "project_id": body.project_id,
            "project_context": None,
            "thread_id": body.thread_id,
        },
        queue="high_priority" if priority else "agents",
    )
    await cache_set(f"agent-task-owner:{task.id}", current_user.user_id, ttl=3600)

    return ChatResponse(task_id=task.id)


@router.post("/chat/sync", response_model=SyncChatResponse)
async def submit_chat_sync(
    body: ChatRequest,
    current_user: TokenData = Depends(get_current_user),
):
    """
    Synchronous agent — runs the LangGraph flow inline and returns the final
    response. Used for the demo path and for environments where Celery+Redis
    are unavailable. Trades throughput for simplicity.
    """
    import time

    from app.features.ai.server.dbs_gpt.graph import run_agent_with_trace

    allowed = await redis_rate_limit(
        user_id=current_user.user_id,
        action="agent_chat_sync",
        limit=settings.AGENT_RATE_LIMIT_PER_MINUTE,
    )
    if not allowed:
        raise HTTPException(status_code=429, detail="Too many requests. Please wait a moment.")
    await require_project_access(body.project_id, current_user)

    logger.info("agent.chat_sync_submitted", user_id=current_user.user_id, message_len=len(body.message))
    start = time.perf_counter()
    response_text, trace = await run_agent_with_trace(
        message=body.message,
        user_id=current_user.user_id,
        user_role=current_user.role,
        project_id=body.project_id,
        project_context=None,
        thread_id=body.thread_id,
    )
    duration_ms = (time.perf_counter() - start) * 1000
    logger.info(
        "agent.chat_sync_completed",
        user_id=current_user.user_id,
        duration_ms=round(duration_ms, 1),
        visited=trace.get("visited_nodes"),
        tool_count=len(trace.get("tool_calls", [])),
    )
    return SyncChatResponse(
        response=response_text,
        duration_ms=round(duration_ms, 1),
        visited_nodes=trace.get("visited_nodes", []),
        tool_calls=[
            ToolCallTrace(name=tc["name"], args=tc["args"], result=tc["result"])
            for tc in trace.get("tool_calls", [])
        ],
        iteration_count=trace.get("iteration_count", 0),
    )


@router.get("/tasks/{task_id}", response_model=TaskResult)
async def get_task_result(
    task_id: str,
    current_user: TokenData = Depends(get_current_user),
):
    """Poll for a task result by task_id."""
    owner_id = await cache_get(f"agent-task-owner:{task_id}")
    if owner_id != current_user.user_id:
        raise HTTPException(status_code=404, detail="Task not found")
    from celery.result import AsyncResult
    result = AsyncResult(task_id, app=run_dbs_gpt_task.app)

    if result.state == "PENDING":
        return TaskResult(task_id=task_id, status="queued")
    if result.state == "STARTED":
        return TaskResult(task_id=task_id, status="running")
    if result.state == "SUCCESS":
        data = result.result or {}
        return TaskResult(
            task_id=task_id,
            status=data.get("status", "completed"),
            response=data.get("response"),
        )
    if result.state == "FAILURE":
        return TaskResult(task_id=task_id, status="failed", error=str(result.result))

    return TaskResult(task_id=task_id, status=result.state.lower())


@router.get("/stream/{task_id}")
async def stream_task_updates(
    task_id: str,
    current_user: TokenData = Depends(get_current_user),
):
    """
    Server-Sent Events (SSE) stream for real-time task updates.
    The frontend subscribes to this and gets updates as the agent progresses.
    """
    owner_id = await cache_get(f"agent-task-owner:{task_id}")
    if owner_id != current_user.user_id:
        raise HTTPException(status_code=404, detail="Task not found")
    async def event_generator():
        r = await get_redis()
        pubsub = r.pubsub()
        await pubsub.subscribe(f"task:{task_id}")

        try:
            timeout = 120  # max 2 minutes wait
            elapsed = 0
            while elapsed < timeout:
                message = await pubsub.get_message(ignore_subscribe_messages=True, timeout=1.0)
                if message and message["type"] == "message":
                    data = json.loads(message["data"])
                    yield f"data: {json.dumps(data)}\n\n"
                    if data.get("status") in ("completed", "failed"):
                        break
                else:
                    yield ": heartbeat\n\n"  # keep connection alive
                    await asyncio.sleep(1)
                    elapsed += 1
        finally:
            await pubsub.unsubscribe(f"task:{task_id}")
            await pubsub.aclose()

    return StreamingResponse(
        event_generator(),
        media_type="text/event-stream",
        headers={
            "Cache-Control": "no-cache",
            "Connection": "keep-alive",
            "X-Accel-Buffering": "no",
        },
    )
