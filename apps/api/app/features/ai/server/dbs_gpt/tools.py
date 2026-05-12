"""
Tools available to DBS GPT agents.
Each tool is a function that the LLM can call to interact with the platform.
"""

import structlog
from langchain_core.tools import tool
from sqlalchemy import text

logger = structlog.get_logger(__name__)


# ── Project Tools ─────────────────────────────────────────────────────────────

# Phases as they actually exist across the DBS schema + seeded data.
# DB seed uses "ETUDE/AP" / "TERMINATO" / "CONCORSO"; UI also references "MAE",
# "CHANTIER", "EXE / DG / DV / 3D", "STUCK". We accept both conventions and
# normalise whitespace around the "/" so users typing either form work.
VALID_PHASES = {
    "ETUDE/AP", "MAE", "CHANTIER", "EXE/DG/DV/3D", "TERMINATO", "STUCK", "CONCORSO",
}


def _normalize_phase(p: str) -> str:
    """Strip whitespace around slashes and uppercase. 'etude / ap' -> 'ETUDE/AP'."""
    return "/".join(part.strip() for part in p.upper().split("/"))


@tool
async def get_projects(
    name: str | None = None,
    phase: str | None = None,
    client: str | None = None,
    commune: str | None = None,
    limit: int = 20,
) -> str:
    """
    Fetch projects from the database. Any combination of filters may be used.

    Args:
      name:    Substring match against title or code. Use this when the user
               asks about a specific project by name like "Le Saillen",
               "Crans Carlton", "Solaris", or by code like "DBS-2025-001".
      phase:   Phase filter (whitespace tolerant, case-insensitive). Valid:
               ETUDE/AP, MAE, CHANTIER, EXE/DG/DV/3D, TERMINATO, STUCK, CONCORSO.
      client:  Substring of client name.
      commune: Substring of commune (e.g. "Sion", "Salins").
      limit:   Max rows, default 20, capped at 50.
    """
    from app.platform.db.database import AsyncSessionLocal
    limit = min(max(limit, 1), 50)
    async with AsyncSessionLocal() as db:
        conditions = ['status != \'deleted\'']
        params: dict = {"limit": limit}
        if name:
            conditions.append("(title ILIKE :name OR code ILIKE :name)")
            params["name"] = f"%{name}%"
        if phase:
            # Tolerate both "ETUDE/AP" and "ETUDE / AP" in DB and input
            conditions.append("REPLACE(phase, ' ', '') ILIKE :phase")
            params["phase"] = _normalize_phase(phase)
        if client:
            conditions.append("client ILIKE :client")
            params["client"] = f"%{client}%"
        if commune:
            conditions.append("commune ILIKE :commune")
            params["commune"] = f"%{commune}%"

        where = " AND ".join(conditions)
        result = await db.execute(
            text(f'SELECT code, title, phase, client, commune, billing FROM "Project" WHERE {where} LIMIT :limit'),
            params,
        )
        rows = result.mappings().all()
        if not rows:
            return "No projects found matching those criteria."
        return "\n".join(
            f"• [{r['code']}] {r['title']} — Phase: {r['phase']}, Client: {r['client'] or 'N/A'}, Billing: {r['billing'] or 'N/A'}"
            for r in rows
        )


@tool
async def update_project_phase(project_code: str, new_phase: str) -> str:
    """
    Move a project to a new phase. Whitespace-tolerant; case-insensitive.
    Valid: ETUDE/AP, MAE, CHANTIER, EXE/DG/DV/3D, TERMINATO, STUCK, CONCORSO.
    """
    norm = _normalize_phase(new_phase)
    if norm not in VALID_PHASES:
        return f"Invalid phase '{new_phase}'. Valid options: {', '.join(sorted(VALID_PHASES))}"

    from app.platform.db.database import AsyncSessionLocal
    async with AsyncSessionLocal() as db:
        result = await db.execute(
            text('UPDATE "Project" SET phase = :phase, "updatedAt" = NOW() WHERE code = :code RETURNING title'),
            {"phase": norm, "code": project_code},
        )
        row = result.fetchone()
        if not row:
            return f"Project with code '{project_code}' not found."
        await db.commit()
        return f"✓ Project '{row[0]}' ({project_code}) moved to phase: {norm}"


@tool
async def get_project_team(project_code: str) -> str:
    """Get the team members assigned to a specific project.

    `project_code` accepts either the full code (e.g. "DBS-2025-001") or
    the project title / a substring of it (e.g. "Le Saillen"). The tool
    resolves the identifier internally, so the LLM does not need to call
    get_projects first.
    """
    from app.platform.db.database import AsyncSessionLocal
    async with AsyncSessionLocal() as db:
        # Accept a code OR a title substring — normalise to a single code
        lookup = await db.execute(
            text('''
                SELECT code FROM "Project"
                WHERE code = :q OR title ILIKE :like OR code ILIKE :like
                ORDER BY CASE WHEN code = :q THEN 0 ELSE 1 END
                LIMIT 1
            '''),
            {"q": project_code, "like": f"%{project_code}%"},
        )
        row = lookup.fetchone()
        if not row:
            return f"No project matching '{project_code}' found."
        resolved_code = row[0]

        result = await db.execute(
            text('''
                SELECT u.name, u.role, u.email, pa.role as project_role
                FROM "ProjectAssignment" pa
                JOIN "User" u ON u.id = pa."userId"
                JOIN "Project" p ON p.id = pa."projectId"
                WHERE p.code = :code
            '''),
            {"code": resolved_code},
        )
        rows = result.mappings().all()
        if not rows:
            return f"No team members found for project {resolved_code} ('{project_code}')."
        return "\n".join(
            f"• {r['name']} ({r['role']}) — Project role: {r['project_role'] or 'Member'} — {r['email']}"
            for r in rows
        )


# ── Schedule Tools ────────────────────────────────────────────────────────────

@tool
async def create_agenda_item(
    title: str,
    date: str,
    project_code: str | None = None,
    priority: str = "medium",
    description: str | None = None,
    user_id: str = "",
) -> str:
    """
    Create a new agenda/task item. Date must be ISO format: YYYY-MM-DD or YYYY-MM-DDTHH:MM:SS.
    Priority: low | medium | high
    """
    import uuid
    from datetime import datetime

    from app.platform.db.database import AsyncSessionLocal

    try:
        parsed_date = datetime.fromisoformat(date)
    except ValueError:
        return f"Invalid date format '{date}'. Use YYYY-MM-DD or YYYY-MM-DDTHH:MM:SS."

    async with AsyncSessionLocal() as db:
        project_id = None
        if project_code:
            result = await db.execute(
                text('SELECT id FROM "Project" WHERE code = :code'), {"code": project_code}
            )
            row = result.fetchone()
            if row:
                project_id = row[0]

        item_id = str(uuid.uuid4())
        await db.execute(
            text('''
                INSERT INTO "AgendaItem" (id, title, description, date, priority, status, "projectId", "userId", "createdAt", "updatedAt")
                VALUES (:id, :title, :desc, :date, :priority, 'pending', :project_id, :user_id, NOW(), NOW())
            '''),
            {
                "id": item_id, "title": title, "desc": description,
                "date": parsed_date, "priority": priority,
                "project_id": project_id, "user_id": user_id,
            },
        )
        await db.commit()
        project_info = f" for project {project_code}" if project_code else ""
        return f"✓ Task created{project_info}: '{title}' on {parsed_date.strftime('%d %b %Y')} (Priority: {priority})"


@tool
async def get_upcoming_agenda(days_ahead: int = 7, user_id: str = "") -> str:
    """Get upcoming agenda items for the next N days."""
    from app.platform.db.database import AsyncSessionLocal
    days_ahead = min(max(days_ahead, 1), 365)
    async with AsyncSessionLocal() as db:
        result = await db.execute(
            text('''
                SELECT a.title, a.date, a.priority, a.status, p.code as project_code
                FROM "AgendaItem" a
                LEFT JOIN "Project" p ON p.id = a."projectId"
                WHERE a.date >= NOW()
                AND a.date <= NOW() + (:days * INTERVAL '1 day')
                AND a.status != 'done'
                ORDER BY a.date ASC
                LIMIT 20
            '''),
            {"days": days_ahead},
        )
        rows = result.mappings().all()
        if not rows:
            return f"No upcoming tasks in the next {days_ahead} days."

        def _fmt(r: dict) -> str:
            code = f"({r['project_code']})" if r["project_code"] else ""
            return f"• {r['date'].strftime('%d %b %Y')} — {r['title']} [{r['priority']}] {code}"

        return "\n".join(_fmt(r) for r in rows)


# ── Regulations Tools ─────────────────────────────────────────────────────────

@tool
async def search_regulations(query: str) -> str:
    """
    Search Swiss building regulations knowledge base (VSS standards, PROCAP accessibility,
    RCCZ Sion regulations, DBS internal standards). Uses semantic search via Qdrant.
    """
    from app.features.ai.server.memory.qdrant import search_memory
    results = await search_memory(query, collection="regulations", limit=5)
    if not results:
        return "No relevant regulations found. Please consult the official Swiss building code directly."
    return "\n\n".join(
        f"**{r['source']}** (relevance: {r['score']:.0%})\n{r['content']}"
        for r in results
    )


# ── Analytics Tools ───────────────────────────────────────────────────────────

@tool
async def get_project_statistics() -> str:
    """Get a summary of project statistics: counts by phase, billing status, active vs stuck."""
    from app.platform.db.database import AsyncSessionLocal
    async with AsyncSessionLocal() as db:
        result = await db.execute(
            text('''
                SELECT
                    phase,
                    COUNT(*) as count,
                    COUNT(CASE WHEN billing = 'Completo' THEN 1 END) as billed,
                    COUNT(CASE WHEN billing = 'Parziale' THEN 1 END) as partial
                FROM "Project"
                WHERE status != 'deleted'
                GROUP BY phase
                ORDER BY count DESC
            ''')
        )
        rows = result.mappings().all()
        total = sum(r["count"] for r in rows)
        lines = [f"Total projects: {total}\n"]
        for r in rows:
            lines.append(f"• {r['phase']}: {r['count']} projects (Billed: {r['billed']}, Partial: {r['partial']})")
        return "\n".join(lines)


# ── Tool registry (passed to each agent) ──────────────────────────────────────

PROJECT_TOOLS = [get_projects, update_project_phase, get_project_team]
SCHEDULE_TOOLS = [create_agenda_item, get_upcoming_agenda]
REGULATIONS_TOOLS = [search_regulations]
ANALYTICS_TOOLS = [get_project_statistics]

ALL_TOOLS = [*PROJECT_TOOLS, *SCHEDULE_TOOLS, *REGULATIONS_TOOLS, *ANALYTICS_TOOLS]
