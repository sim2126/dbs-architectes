from celery import Celery
from kombu import Queue
import structlog

from app.platform.config.config import settings

logger = structlog.get_logger(__name__)

# ── Celery app ─────────────────────────────────────────────────────────────────
celery_app = Celery(
    "dbs_architectes",
    broker=settings.CELERY_BROKER_URL,
    backend=settings.CELERY_RESULT_BACKEND,
    include=["app.tasks.agent_tasks", "app.tasks.monday_tasks"],
)

# ── Configuration ──────────────────────────────────────────────────────────────
celery_app.conf.update(
    # Serialization
    task_serializer="json",
    result_serializer="json",
    accept_content=["json"],

    # Timeouts
    task_soft_time_limit=settings.CELERY_TASK_SOFT_TIME_LIMIT,
    task_time_limit=settings.CELERY_TASK_TIME_LIMIT,
    task_acks_late=True,           # only ack after task completes (safer)
    task_reject_on_worker_lost=True,

    # Retries
    task_max_retries=3,
    task_default_retry_delay=30,   # 30s between retries

    # Result backend
    result_expires=3600,           # results kept for 1 hour
    result_backend_transport_options={"visibility_timeout": 3600},

    # Workers
    worker_prefetch_multiplier=1,  # one task at a time per worker (fair for long agent tasks)
    worker_max_tasks_per_child=100,  # restart worker after 100 tasks (prevent memory leaks)

    # Queues with priorities
    task_queues=(
        Queue("high_priority", routing_key="high"),
        Queue("agents", routing_key="agents"),
        Queue("default", routing_key="default"),
    ),
    task_default_queue="default",
    task_routes={
        "app.tasks.agent_tasks.run_dbs_gpt_task": {"queue": "agents"},
        "app.tasks.agent_tasks.run_dbs_gpt_task_priority": {"queue": "high_priority"},
        "app.tasks.monday_tasks.run_monday_dry_run": {"queue": "default"},
        "app.tasks.monday_tasks.run_monday_full_import": {"queue": "default"},
    },

    # Timezone
    timezone="Europe/Zurich",
    enable_utc=True,

    # Beat schedule (periodic tasks)
    beat_schedule={},
)
