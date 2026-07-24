"""
Tool: get_statistics
Aggregate portfolio statistics for dashboard-style summaries.
"""
from __future__ import annotations

import json

import structlog
from langchain_core.tools import tool
from sqlalchemy import text

logger = structlog.get_logger(__name__)


@tool
async def get_statistics() -> str:
    """
    Get aggregate portfolio statistics: total projects, phase distribution,
    work-status breakdown, unassigned count, and billing summary.
    Use this for portfolio health overviews and dashboard summaries.
    """
    from app.platform.db.database import AsyncSessionLocal

    async with AsyncSessionLocal() as db:
        # Total and status counts
        totals = await db.execute(
            text(
                """
                SELECT
                    COUNT(*) AS total,
                    COUNT(CASE WHEN status = 'active' THEN 1 END) AS active,
                    COUNT(CASE WHEN status = 'archived' THEN 1 END) AS archived
                FROM "Project"
                """
            )
        )
        total_mapping = totals.mappings().first()
        total_row = dict(total_mapping) if total_mapping else {"total": 0}

        # Phase distribution
        phases = await db.execute(
            text(
                """
                SELECT phase, COUNT(*) AS count
                FROM "Project" WHERE status = 'active'
                GROUP BY phase ORDER BY count DESC
                """
            )
        )
        phase_dist = [dict(r) for r in phases.mappings().all()]

        # WorkStatus distribution
        statuses = await db.execute(
            text(
                """
                SELECT "workStatus", COUNT(*) AS count
                FROM "Project" WHERE status = 'active'
                GROUP BY "workStatus" ORDER BY count DESC
                """
            )
        )
        status_dist = [dict(r) for r in statuses.mappings().all()]

        # Unassigned projects
        unassigned = await db.execute(
            text(
                """
                SELECT COUNT(*) AS count FROM "Project" p
                WHERE status = 'active'
                  AND NOT EXISTS (
                      SELECT 1 FROM "ProjectAssignment" pa WHERE pa."projectId" = p.id
                  )
                """
            )
        )
        unassigned_count = unassigned.scalar()

        # Category distribution
        categories = await db.execute(
            text(
                """
                SELECT category, COUNT(*) AS count
                FROM "Project" WHERE status = 'active'
                GROUP BY category ORDER BY count DESC
                """
            )
        )
        category_dist = [dict(r) for r in categories.mappings().all()]

    return json.dumps(
        {
            "totals": total_row,
            "phase_distribution": phase_dist,
            "work_status_distribution": status_dist,
            "category_distribution": category_dist,
            "unassigned_projects": unassigned_count,
        },
        default=str,
    )
