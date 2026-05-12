"""
Tool: get_team_messages
Fetch messages from general or announcement team channels.
"""
from __future__ import annotations

import json
from typing import Optional

import structlog
from langchain_core.tools import tool
from sqlalchemy import text

logger = structlog.get_logger(__name__)


@tool
async def get_team_messages(
    channel_name: Optional[str] = None,
    limit: int = 30,
) -> str:
    """
    Get messages from team-wide chat channels (general, announcements, etc.).
    Use this for cross-project team discussions, not project-specific threads.

    Args:
        channel_name: Partial match on channel name (e.g. 'general', 'announcements').
                      If omitted, returns from all non-project channels.
        limit: Number of messages (default: 30, max: 100)
    """
    from app.platform.db.database import AsyncSessionLocal

    limit = min(limit, 100)
    params: dict = {"limit": limit}
    channel_filter = 'c."projectId" IS NULL'

    if channel_name:
        channel_filter += " AND c.name ILIKE :channel_name"
        params["channel_name"] = f"%{channel_name}%"

    async with AsyncSessionLocal() as db:
        result = await db.execute(
            text(
                f"""
                SELECT m.content, u.name AS author, c.name AS channel,
                       m."createdAt", m."deletedAt"
                FROM "Message" m
                JOIN "Channel" c ON c.id = m."channelId"
                JOIN "User" u ON u.id = m."userId"
                WHERE {channel_filter}
                  AND m."deletedAt" IS NULL
                  AND m."parentId" IS NULL
                ORDER BY m."createdAt" DESC
                LIMIT :limit
                """
            ),
            params,
        )
        messages = [dict(r) for r in result.mappings().all()]

    if not messages:
        return json.dumps({"messages": [], "note": "No messages found."})

    messages.reverse()
    return json.dumps({"messages": messages, "count": len(messages)}, default=str)
