"""
Tool: get_project_thread
Fetch team messages from a project's dedicated chat channel.
"""
from __future__ import annotations

import json

import structlog
from langchain_core.tools import tool
from sqlalchemy import text

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
    from app.core.database import AsyncSessionLocal

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
                  AND m."deletedAt" IS NULL
                  AND m."parentId" IS NULL
                ORDER BY m."createdAt" DESC
                LIMIT :limit
                """
            ),
            {"project_id": project_id, "limit": limit},
        )
        messages = [dict(r) for r in result.mappings().all()]

    if not messages:
        return json.dumps({"messages": [], "note": "No thread messages found for this project."})

    # Return in chronological order
    messages.reverse()
    return json.dumps({"messages": messages, "count": len(messages)}, default=str)
