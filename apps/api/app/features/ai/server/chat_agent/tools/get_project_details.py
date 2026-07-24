"""
Tool: get_project_details
Fetch full detail for a single project including team, agenda, and recent activity.
"""
from __future__ import annotations

import json

import structlog
from langchain_core.tools import tool
from sqlalchemy import text

logger = structlog.get_logger(__name__)


@tool
async def get_project_details(project_id: str) -> str:
    """
    Get full detail for one project: metadata, team assignments,
    upcoming agenda items, and recent activity.

    Args:
        project_id: The project's database ID (from search_projects results)
    """
    from app.platform.db.database import AsyncSessionLocal

    async with AsyncSessionLocal() as db:
        # Core project data
        proj = await db.execute(
            text(
                """
                SELECT id, code, title, phase, "workStatus", category, client,
                       commune, year, billing, description, notes, status,
                       "createdAt", "updatedAt"
                FROM "Project" WHERE id = :id
                """
            ),
            {"id": project_id},
        )
        row = proj.mappings().first()
        if not row:
            return json.dumps({"error": f"Project {project_id} not found."})

        # Team assignments
        team_result = await db.execute(
            text(
                """
                SELECT u.name, u.email, u.role, pa.role AS project_role, pa."assignedAt"
                FROM "ProjectAssignment" pa
                JOIN "User" u ON u.id = pa."userId"
                WHERE pa."projectId" = :id
                ORDER BY pa."assignedAt"
                """
            ),
            {"id": project_id},
        )
        team = [dict(r) for r in team_result.mappings().all()]

        # Upcoming agenda items
        agenda_result = await db.execute(
            text(
                """
                SELECT title, COALESCE("startDate", "dueDate") AS date,
                       priority, status, description
                FROM "WorkItem"
                WHERE "projectId" = :id
                  AND "legacyTaskId" IS NULL
                  AND COALESCE("startDate", "dueDate") >= NOW()
                ORDER BY COALESCE("startDate", "dueDate") ASC
                LIMIT 5
                """
            ),
            {"id": project_id},
        )
        agenda = [dict(r) for r in agenda_result.mappings().all()]

        # Recent activity
        activity_result = await db.execute(
            text(
                """
                SELECT a.type, a.description, u.name AS user_name, a."createdAt"
                FROM "Activity" a
                JOIN "User" u ON u.id = a."userId"
                WHERE a."projectId" = :id
                ORDER BY a."createdAt" DESC
                LIMIT 10
                """
            ),
            {"id": project_id},
        )
        activities = [dict(r) for r in activity_result.mappings().all()]

    return json.dumps(
        {
            "project": dict(row),
            "team": team,
            "agenda": agenda,
            "recent_activity": activities,
        },
        default=str,
    )
