"""
Celery tasks for monday.com migration runs.
"""
import asyncio
from pathlib import Path

from celery.utils.log import get_task_logger

from app.importers.monday import MondayImportService
from app.importers.monday.mappings import load_board_mappings
from app.tasks.agent_tasks import AgentTask
from app.tasks.celery_app import celery_app

logger = get_task_logger(__name__)


def _resolve_mapping_paths(mapping_paths: list[str]) -> list[str]:
    base_dir = Path(__file__).resolve().parents[1] / "importers" / "monday" / "configs"
    resolved: list[str] = []
    for path in mapping_paths:
        candidate = Path(path)
        if not candidate.is_absolute():
            candidate = base_dir / candidate
        resolved.append(str(candidate))
    return resolved


@celery_app.task(
    bind=True,
    base=AgentTask,
    name="app.tasks.monday_tasks.run_monday_dry_run",
    queue="default",
)
def run_monday_dry_run(self, mapping_paths: list[str]) -> dict:
    logger.info("monday.dry_run.start", task_id=self.request.id, mapping_paths=mapping_paths)
    mappings = load_board_mappings(_resolve_mapping_paths(mapping_paths))
    result = asyncio.run(MondayImportService().run_full_import(mappings, mode="dry_run"))
    payload = result.model_dump()
    payload["task_id"] = self.request.id
    return payload


@celery_app.task(
    bind=True,
    base=AgentTask,
    name="app.tasks.monday_tasks.run_monday_full_import",
    queue="default",
)
def run_monday_full_import(self, mapping_paths: list[str]) -> dict:
    logger.info("monday.full_import.start", task_id=self.request.id, mapping_paths=mapping_paths)
    mappings = load_board_mappings(_resolve_mapping_paths(mapping_paths))
    result = asyncio.run(MondayImportService().run_full_import(mappings, mode="full"))
    payload = result.model_dump()
    payload["task_id"] = self.request.id
    return payload

