"""
Tool: get_agenda
Fetch upcoming deadlines, milestones, and scheduled tasks.
"""
from __future__ import annotations

import json

import structlog
from langchain_core.tools import tool
from sqlalchemy import text

logger = structlog.get_logger(__name__)


@tool
async def get_agenda(
    from_date: str | None = None,
    to_date: str | None = None,
    priority: str | None = None,
    project_id: str | None = None,
    status: str | None = None,
    include_overdue: bool = True,
    limit: int = 30,
) -> str:
    """
    Get upcoming deadlines, milestones, and scheduled tasks.

    Args:
        from_date: ISO date string (YYYY-MM-DD). Defaults to today.
        to_date: ISO date string (YYYY-MM-DD). Defaults to 30 days out.
        priority: 'critical' | 'high' | 'medium' | 'low'
        project_id: Filter by specific project
        status: 'pending' | 'completed' | 'cancelled'
        include_overdue: Include past-due items (default: True)
        limit: Max items to return (default: 30)
    """
    from app.platform.db.database import AsyncSessionLocal

    conditions = []
    params: dict = {"limit": limit}

    if from_date:
        conditions.append('"date" >= :from_date')
        params["from_date"] = from_date
    elif not include_overdue:
        conditions.append('"date" >= NOW()')

    if to_date:
        conditions.append('"date" <= :to_date')
        params["to_date"] = to_date

    if priority:
        conditions.append('"priority" = :priority')
        params["priority"] = priority

    if project_id:
        conditions.append('"projectId" = :project_id')
        params["project_id"] = project_id

    if status:
        conditions.append('"status" = :status')
        params["status"] = status

    where = ("WHERE " + " AND ".join(conditions)) if conditions else ""

    async with AsyncSessionLocal() as db:
        result = await db.execute(
            text(
                f"""
                SELECT a.id, a.title, a.description, a.date, a."endDate",
                       a.priority, a.status, a.type,
                       p.code AS project_code, p.title AS project_title,
                       u.name AS assigned_to
                FROM "AgendaItem" a
                LEFT JOIN "Project" p ON p.id = a."projectId"
                LEFT JOIN "User" u ON u.id = a."userId"
                {where}
                ORDER BY a.date ASC
                LIMIT :limit
                """
            ),
            params,
        )
        items = [dict(r) for r in result.mappings().all()]

    return json.dumps({"agenda": items, "count": len(items)}, default=str)
