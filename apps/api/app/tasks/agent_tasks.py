"""
Celery tasks for DBS GPT agent execution.

Every agent request goes through here — the FastAPI endpoint submits the task
and immediately returns a task_id. The frontend polls /tasks/{task_id} for the result.
This keeps the API non-blocking regardless of how long the agent takes.
"""
import asyncio

from celery import Task
from celery.utils.log import get_task_logger

from app.platform.ai.provider import to_safe_provider_failure
from app.platform.cache.redis import publish_task_update
from app.tasks.celery_app import celery_app

logger = get_task_logger(__name__)


def _run_agent_task(
    task_id: str,
    message: str,
    user_id: str,
    user_role: str = "viewer",
    project_id: str | None = None,
    project_context: dict | None = None,
    thread_id: str | None = None,
) -> dict:
    from app.features.ai.server.dbs_gpt.graph import run_agent_with_trace

    response, trace = asyncio.run(
        run_agent_with_trace(
            message=message,
            user_id=user_id,
            user_role=user_role,
            project_id=project_id,
            project_context=project_context,
            thread_id=thread_id or task_id,
        )
    )

    result = {
        "status": "completed",
        "response": response,
        "grounding_issues": trace.get("grounding_issues", []),
        "task_id": task_id,
    }
    asyncio.run(publish_task_update(task_id, result))
    return result


class AgentTask(Task):
    """Base task class with retry logic and error handling."""
    abstract = True
    max_retries = 3

    def on_failure(self, exc, task_id, args, kwargs, einfo):
        failure = to_safe_provider_failure("dbs-gpt", exc)
        logger.error("Agent task %s failed (%s)", task_id, failure["kind"])
        asyncio.run(publish_task_update(task_id, {
            "status": "failed",
            "error": failure["message"],
            "task_id": task_id,
        }))

    def on_retry(self, exc, task_id, args, kwargs, einfo):
        failure = to_safe_provider_failure("dbs-gpt", exc)
        logger.warning("Agent task %s retrying (%s)", task_id, failure["kind"])


@celery_app.task(
    bind=True,
    base=AgentTask,
    name="app.tasks.agent_tasks.run_dbs_gpt_task",
    queue="agents",
)
def run_dbs_gpt_task(
    self,
    message: str,
    user_id: str,
    user_role: str = "viewer",
    project_id: str | None = None,
    project_context: dict | None = None,
    thread_id: str | None = None,
) -> dict:
    """
    Run DBS GPT agent asynchronously.
    Returns: { status, response, task_id }
    """
    task_id = self.request.id

    # Publish "running" status
    asyncio.run(publish_task_update(task_id, {"status": "running", "task_id": task_id}))

    try:
        return _run_agent_task(
            task_id=task_id,
            message=message,
            user_id=user_id,
            user_role=user_role,
            project_id=project_id,
            project_context=project_context,
            thread_id=thread_id,
        )

    except Exception as exc:
        failure = to_safe_provider_failure("dbs-gpt", exc)
        logger.error("Agent task failed (%s)", failure["kind"], exc_info=True)
        try:
            raise self.retry(exc=exc, countdown=2 ** self.request.retries * 10)
        except self.MaxRetriesExceededError:
            return {
                "status": "failed",
                "error": failure["message"],
                "task_id": task_id,
            }


@celery_app.task(
    bind=True,
    base=AgentTask,
    name="app.tasks.agent_tasks.run_dbs_gpt_task_priority",
    queue="high_priority",
)
def run_dbs_gpt_task_priority(self, **kwargs) -> dict:
    """High-priority version — same as above but goes to the priority queue."""
    task_id = self.request.id
    asyncio.run(publish_task_update(task_id, {"status": "running", "task_id": task_id}))
    return _run_agent_task(task_id=task_id, **kwargs)
