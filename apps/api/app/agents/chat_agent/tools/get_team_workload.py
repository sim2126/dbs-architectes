"""
Tool: get_team_workload
Per-person project assignment counts and work-status breakdown.
"""
from __future__ import annotations

import json

import structlog
from langchain_core.tools import tool
from sqlalchemy import text

logger = structlog.get_logger(__name__)


@tool
async def get_team_workload() -> str:
    """
    Get per-person project assignment counts and work-status breakdown.
    Returns: name, role, total assigned, breakdown by workStatus (todo/doing/stuck/completed).
    Use this for capacity analysis and identifying overloaded or blocked team members.
    """
    from app.core.database import AsyncSessionLocal

    async with AsyncSessionLocal() as db:
        result = await db.execute(
            text(
                """
                SELECT
                    u.id,
                    u.name,
                    u.role,
                    COUNT(pa.id) AS total_assigned,
                    COUNT(CASE WHEN p."workStatus" = 'todo' THEN 1 END) AS todo_count,
                    COUNT(CASE WHEN p."workStatus" = 'doing' THEN 1 END) AS doing_count,
                    COUNT(CASE WHEN p."workStatus" = 'stuck' THEN 1 END) AS stuck_count,
                    COUNT(CASE WHEN p."workStatus" = 'completed' THEN 1 END) AS completed_count
                FROM "User" u
                LEFT JOIN "ProjectAssignment" pa ON pa."userId" = u.id
                LEFT JOIN "Project" p ON p.id = pa."projectId" AND p.status = 'active'
                WHERE u."isActive" = true
                GROUP BY u.id, u.name, u.role
                ORDER BY total_assigned DESC
                """
            )
        )
        rows = [dict(r) for r in result.mappings().all()]

    return json.dumps({"team_workload": rows, "count": len(rows)}, default=str)
