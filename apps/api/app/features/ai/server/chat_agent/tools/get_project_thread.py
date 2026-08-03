"""
Tool: get_project_thread
Fetch team messages from a project's dedicated chat channel.
"""
from __future__ import annotations

import json

import structlog
from langchain_core.tools import tool
from sqlalchemy import text

from .access import require_tool_subject

logger = structlog.get_logger(__name__)


@tool
async def get_project_thread(project_id: str, limit: int = 20) -> str:
    """
    Get the update thread / internal messages for a specific project.
    Returns the most recent messages from the project's channel.

    Args:
        project_id: The project's database ID
        limit: Number of messages to return (default: 20, max: 50)
    """
    from app.platform.db.database import AsyncSessionLocal

    user_id, is_admin = require_tool_subject()
    limit = min(limit, 50)

    async with AsyncSessionLocal() as db:
        result = await db.execute(
            text(
                """
                SELECT m.content, u.name AS author, m."createdAt",
                       m.type, m."editedAt", m."deletedAt"
                FROM "Message" m
                JOIN "Channel" c ON c.id = m."channelId"
                JOIN "User" u ON u.id = m."userId"
                WHERE c."projectId" = :project_id
                  AND EXISTS (
                      SELECT 1 FROM "Project" access_project
                      WHERE access_project.id = c."projectId"
                        AND access_project.status != 'deleted'
                        AND (:is_admin OR EXISTS (
                            SELECT 1 FROM "ProjectAssignment" access_pa
                            WHERE access_pa."projectId" = access_project.id
                              AND access_pa."userId" = :user_id
                        ))
                  )
                  AND m."deletedAt" IS NULL
                  AND m."parentId" IS NULL
                ORDER BY m."createdAt" DESC
                LIMIT :limit
                """
            ),
            {
                "project_id": project_id,
                "limit": limit,
                "user_id": user_id,
                "is_admin": is_admin,
            },
        )
        messages = [dict(r) for r in result.mappings().all()]

    if not messages:
        return json.dumps({"messages": [], "note": "No thread messages found for this project."})

    # Return in chronological order
    messages.reverse()
    return json.dumps({"messages": messages, "count": len(messages)}, default=str)
