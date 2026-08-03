"""
Tool: get_agenda
Fetch upcoming deadlines, milestones, and scheduled tasks.
"""
from __future__ import annotations

import json

import structlog
from langchain_core.tools import tool
from sqlalchemy import text

from .access import require_tool_subject

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

    user_id, is_admin = require_tool_subject()
    effective_date = 'COALESCE(a."startDate", a."dueDate")'
    conditions = [
        'a."legacyTaskId" IS NULL',
        f"{effective_date} IS NOT NULL",
        "((a.\"projectId\" IS NULL AND (:is_admin OR a.\"userId\" = :user_id)) "
        "OR EXISTS ("
        'SELECT 1 FROM "Project" access_project '
        'WHERE access_project.id = a."projectId" '
        "AND access_project.status != 'deleted' "
        "AND (:is_admin OR EXISTS ("
        'SELECT 1 FROM "ProjectAssignment" access_pa '
        'WHERE access_pa."projectId" = access_project.id '
        'AND access_pa."userId" = :user_id))))',
    ]
    params: dict = {
        "limit": limit,
        "user_id": user_id,
        "is_admin": is_admin,
    }

    if from_date:
        conditions.append(f"{effective_date} >= :from_date")
        params["from_date"] = from_date
    elif not include_overdue:
        conditions.append(f"{effective_date} >= NOW()")

    if to_date:
        conditions.append(f"{effective_date} <= :to_date")
        params["to_date"] = to_date

    if priority:
        conditions.append('a."priority" = :priority')
        params["priority"] = priority

    if project_id:
        conditions.append('a."projectId" = :project_id')
        params["project_id"] = project_id

    if status:
        conditions.append('a."status" = :status')
        params["status"] = status

    where = "WHERE " + " AND ".join(conditions)

    async with AsyncSessionLocal() as db:
        result = await db.execute(
            text(
                f"""
                SELECT a.id, a.title, a.description,
                       COALESCE(a."startDate", a."dueDate") AS date,
                       CASE WHEN a."startDate" IS NULL THEN NULL ELSE a."dueDate" END AS "endDate",
                       a.priority, a.status,
                       COALESCE(a."legacyAgendaType", a.type::text) AS type,
                       p.code AS project_code, p.title AS project_title,
                       u.name AS assigned_to
                FROM "WorkItem" a
                LEFT JOIN "Project" p ON p.id = a."projectId"
                LEFT JOIN "User" u ON u.id = a."userId"
                {where}
                ORDER BY COALESCE(a."startDate", a."dueDate") ASC
                LIMIT :limit
                """
            ),
            params,
        )
        items = [dict(r) for r in result.mappings().all()]

    return json.dumps({"agenda": items, "count": len(items)}, default=str)
