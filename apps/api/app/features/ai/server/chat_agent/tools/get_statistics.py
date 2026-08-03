"""
Tool: get_statistics
Aggregate portfolio statistics for dashboard-style summaries.
"""
from __future__ import annotations

import json

import structlog
from langchain_core.tools import tool
from sqlalchemy import text

from .access import require_tool_subject

logger = structlog.get_logger(__name__)


@tool
async def get_statistics() -> str:
    """
    Get aggregate portfolio statistics: total projects, phase distribution,
    work-status breakdown, unassigned count, and billing summary.
    Use this for portfolio health overviews and dashboard summaries.
    """
    from app.platform.db.database import AsyncSessionLocal

    user_id, is_admin = require_tool_subject()
    params = {"user_id": user_id, "is_admin": is_admin}
    async with AsyncSessionLocal() as db:
        # Total and status counts
        totals = await db.execute(
            text(
                """
                SELECT
                    COUNT(*) AS total,
                    COUNT(CASE WHEN p.status = 'active' THEN 1 END) AS active,
                    COUNT(CASE WHEN p.status = 'archived' THEN 1 END) AS archived
                FROM "Project" p
                WHERE p.status != 'deleted'
                  AND (:is_admin OR EXISTS (
                      SELECT 1 FROM "ProjectAssignment" access_pa
                      WHERE access_pa."projectId" = p.id
                        AND access_pa."userId" = :user_id
                  ))
                """
            ),
            params,
        )
        total_mapping = totals.mappings().first()
        total_row = dict(total_mapping) if total_mapping else {"total": 0}

        # Phase distribution
        phases = await db.execute(
            text(
                """
                SELECT p.phase, COUNT(*) AS count
                FROM "Project" p
                WHERE p.status = 'active'
                  AND (:is_admin OR EXISTS (
                      SELECT 1 FROM "ProjectAssignment" access_pa
                      WHERE access_pa."projectId" = p.id
                        AND access_pa."userId" = :user_id
                  ))
                GROUP BY p.phase ORDER BY count DESC
                """
            ),
            params,
        )
        phase_dist = [dict(r) for r in phases.mappings().all()]

        # WorkStatus distribution
        statuses = await db.execute(
            text(
                """
                SELECT p."workStatus", COUNT(*) AS count
                FROM "Project" p
                WHERE p.status = 'active'
                  AND (:is_admin OR EXISTS (
                      SELECT 1 FROM "ProjectAssignment" access_pa
                      WHERE access_pa."projectId" = p.id
                        AND access_pa."userId" = :user_id
                  ))
                GROUP BY p."workStatus" ORDER BY count DESC
                """
            ),
            params,
        )
        status_dist = [dict(r) for r in statuses.mappings().all()]

        # Unassigned projects
        unassigned = await db.execute(
            text(
                """
                SELECT COUNT(*) AS count FROM "Project" p
                WHERE p.status = 'active'
                  AND (:is_admin OR EXISTS (
                      SELECT 1 FROM "ProjectAssignment" access_pa
                      WHERE access_pa."projectId" = p.id
                        AND access_pa."userId" = :user_id
                  ))
                  AND NOT EXISTS (
                      SELECT 1 FROM "ProjectAssignment" pa WHERE pa."projectId" = p.id
                  )
                """
            ),
            params,
        )
        unassigned_count = unassigned.scalar()

        # Category distribution
        categories = await db.execute(
            text(
                """
                SELECT p.category, COUNT(*) AS count
                FROM "Project" p
                WHERE p.status = 'active'
                  AND (:is_admin OR EXISTS (
                      SELECT 1 FROM "ProjectAssignment" access_pa
                      WHERE access_pa."projectId" = p.id
                        AND access_pa."userId" = :user_id
                  ))
                GROUP BY p.category ORDER BY count DESC
                """
            ),
            params,
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
