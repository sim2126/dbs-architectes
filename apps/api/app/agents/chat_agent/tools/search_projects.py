"""
Tool: search_projects
Search and filter the DBS project portfolio.
"""
from __future__ import annotations

import json
from typing import Optional

import structlog
from langchain_core.tools import tool
from sqlalchemy import text

logger = structlog.get_logger(__name__)


@tool
async def search_projects(
    query: Optional[str] = None,
    phase: Optional[str] = None,
    work_status: Optional[str] = None,
    category: Optional[str] = None,
    client: Optional[str] = None,
    commune: Optional[str] = None,
    year: Optional[int] = None,
    status: str = "active",
    limit: int = 20,
) -> str:
    """
    Search and filter the project portfolio.

    Args:
        query: Free-text search across title, code, client, commune
        phase: Filter by phase — 'ETUDE / AP', 'MAE', 'CHANTIER',
               'EXE / DG / DV / 3D', 'TERMINATO', 'STUCK'
        work_status: 'todo' | 'doing' | 'stuck' | 'completed'
        category: e.g. 'Residenziale', 'Commerciale'
        client: Partial match on client name
        commune: Partial match on commune name
        year: Filter by project year
        status: 'active' | 'archived' (default: active)
        limit: Max results to return (default: 20, max: 50)
    """
    from app.core.database import AsyncSessionLocal

    limit = min(limit, 50)
    conditions = ['"status" = :status']
    params: dict = {"status": status, "limit": limit}

    if query:
        conditions.append(
            '(title ILIKE :query OR code ILIKE :query OR client ILIKE :query OR commune ILIKE :query)'
        )
        params["query"] = f"%{query}%"
    if phase:
        conditions.append('"phase" = :phase')
        params["phase"] = phase
    if work_status:
        conditions.append('"workStatus" = :work_status')
        params["work_status"] = work_status
    if category:
        conditions.append('"category" ILIKE :category')
        params["category"] = f"%{category}%"
    if client:
        conditions.append('"client" ILIKE :client')
        params["client"] = f"%{client}%"
    if commune:
        conditions.append('"commune" ILIKE :commune')
        params["commune"] = f"%{commune}%"
    if year:
        conditions.append('"year" = :year')
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
