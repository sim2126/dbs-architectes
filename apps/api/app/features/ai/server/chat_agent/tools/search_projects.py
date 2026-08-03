"""
Tool: search_projects
Search and filter the DBS project portfolio.
"""
from __future__ import annotations

import json

import structlog
from langchain_core.tools import tool
from sqlalchemy import text

from .access import require_tool_subject

logger = structlog.get_logger(__name__)


def _normalize_phase(value: str) -> str:
    return "/".join(part.strip() for part in value.upper().split("/"))


@tool
async def search_projects(
    query: str | None = None,
    phase: str | None = None,
    work_status: str | None = None,
    category: str | None = None,
    client: str | None = None,
    commune: str | None = None,
    year: int | None = None,
    status: str = "active",
    limit: int = 20,
) -> str:
    """
    Search and filter the project portfolio.

    Args:
        query: Free-text search across title, code, client, commune
        phase: Filter by phase — 'ETUDE/AP', 'MAE', 'CHANTIER',
               'EXE/DG/DV/3D', 'TERMINATO', 'STUCK'
        work_status: 'todo' | 'doing' | 'stuck' | 'completed'
        category: e.g. 'Residenziale', 'Commerciale'
        client: Partial match on client name
        commune: Partial match on commune name
        year: Filter by project year
        status: 'active' | 'archived' (default: active)
        limit: Max results to return (default: 20, max: 50)
    """
    from app.platform.db.database import AsyncSessionLocal

    user_id, is_admin = require_tool_subject()
    limit = min(limit, 50)
    conditions = [
        'p."status" = :status',
        "(:is_admin OR EXISTS ("
        'SELECT 1 FROM "ProjectAssignment" access_pa '
        'WHERE access_pa."projectId" = p.id AND access_pa."userId" = :user_id))',
    ]
    params: dict = {
        "status": status,
        "limit": limit,
        "user_id": user_id,
        "is_admin": is_admin,
    }

    if query:
        conditions.append(
            "(p.title ILIKE :query OR p.code ILIKE :query OR "
            "p.client ILIKE :query OR p.commune ILIKE :query)"
        )
        params["query"] = f"%{query}%"
    if phase:
        conditions.append('p."phase" = :phase')
        params["phase"] = _normalize_phase(phase)
    if work_status:
        conditions.append('p."workStatus" = :work_status')
        params["work_status"] = work_status
    if category:
        conditions.append('p."category" ILIKE :category')
        params["category"] = f"%{category}%"
    if client:
        conditions.append('p."client" ILIKE :client')
        params["client"] = f"%{client}%"
    if commune:
        conditions.append('p."commune" ILIKE :commune')
        params["commune"] = f"%{commune}%"
    if year:
        conditions.append('p."year" = :year')
        params["year"] = year

    where = " AND ".join(conditions)

    async with AsyncSessionLocal() as db:
        result = await db.execute(
            text(
                f"""
                SELECT p.id, p.code, p.title, p.phase, p."workStatus",
                       p.category, p.client, p.commune, p.year, p.billing,
                       COUNT(pa.id) AS team_count
                FROM "Project" p
                LEFT JOIN "ProjectAssignment" pa ON pa."projectId" = p.id
                WHERE {where}
                GROUP BY p.id
                ORDER BY p."updatedAt" DESC
                LIMIT :limit
                """
            ),
            params,
        )
        rows = result.mappings().all()

    if not rows:
        return json.dumps({"projects": [], "count": 0, "note": "No projects matched the filters."})

    projects = [
        {
            "id": r["id"],
            "code": r["code"],
            "title": r["title"],
            "phase": r["phase"],
            "work_status": r["workStatus"],
            "category": r["category"],
            "client": r["client"],
            "commune": r["commune"],
            "year": r["year"],
            "billing": r["billing"],
            "team_count": r["team_count"],
        }
        for r in rows
    ]

    return json.dumps({"projects": projects, "count": len(projects)}, default=str)
