"""
Tool: get_activity_log
Fetch recent activity events across the portfolio.
"""
from __future__ import annotations

import json
from typing import Optional

import structlog
from langchain_core.tools import tool
from sqlalchemy import text

logger = structlog.get_logger(__name__)


@tool
async def get_activity_log(
    project_id: Optional[str] = None,
    from_date: Optional[str] = None,
    limit: int = 30,
) -> str:
    """
    Get recent activity events: project created/updated, assignments, status changes.

    Args:
        project_id: Filter to a specific project (optional)
        from_date: ISO date string (YYYY-MM-DD) to filter events from
        limit: Max events to return (default: 30, max: 100)
    """
    from app.platform.db.database import AsyncSessionLocal

    limit = min(limit, 100)
    conditions = []
    params: dict = {"limit": limit}

    if project_id:
        conditions.append('a."projectId" = :project_id')
        params["project_id"] = project_id

    if from_date:
        conditions.append('a."createdAt" >= :from_date')
        params["from_date"] = from_date

    where = ("WHERE " + " AND ".join(conditions)) if conditions else ""

    async with AsyncSessionLocal() as db:
        result = await db.execute(
            text(
                f"""
                SELECT a.type, a.description, a."createdAt",
                       u.name AS user_name,
                       p.code AS project_code,
                       p.title AS project_title
                FROM "Activity" a
                LEFT JOIN "User" u ON u.id = a."userId"
                LEFT JOIN "Project" p ON p.id = a."projectId"
                {where}
                ORDER BY a."createdAt" DESC
                LIMIT :limit
                """
            ),
            params,
        )
        events = [dict(r) for r in result.mappings().all()]

    return json.dumps({"events": events, "count": len(events)}, default=str)
