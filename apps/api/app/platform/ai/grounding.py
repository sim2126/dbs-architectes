from __future__ import annotations

import asyncio
import json
import re
import unicodedata
from collections.abc import Callable, Sequence
from contextlib import AbstractAsyncContextManager
from datetime import UTC, date, datetime, timedelta
from typing import Annotated, Any, Literal, Protocol, TypeVar

from pydantic import BaseModel, ConfigDict, Field
from sqlalchemy import bindparam, text
from sqlalchemy.ext.asyncio import AsyncSession

AiSurface = Literal[
    "meeting-summary",
    "dbs-gpt",
    "chat-agent",
    "translation",
    "project-health",
]
GroundingKind = Literal["user", "project", "phase", "date", "meeting-decision"]


def _to_camel(value: str) -> str:
    head, *tail = value.split("_")
    return head + "".join(part.capitalize() for part in tail)


class GroundingModel(BaseModel):
    model_config = ConfigDict(
        alias_generator=_to_camel,
        extra="forbid",
        populate_by_name=True,
    )


class GroundingSubject(GroundingModel):
    user_id: str
    role: str


class NoEntityResolutionNeed(GroundingModel):
    scope: Literal["none"] = "none"


class MentionEntityResolutionNeed(GroundingModel):
    scope: Literal["mentions"] = "mentions"


class WorkspaceEntityResolutionNeed(GroundingModel):
    scope: Literal["workspace"] = "workspace"


class IdEntityResolutionNeed(GroundingModel):
    scope: Literal["ids"] = "ids"
    ids: tuple[str, ...]


EntityResolutionNeed = Annotated[
    NoEntityResolutionNeed
    | MentionEntityResolutionNeed
    | WorkspaceEntityResolutionNeed
    | IdEntityResolutionNeed,
    Field(discriminator="scope"),
]


class NoPhaseResolutionNeed(GroundingModel):
    scope: Literal["none"] = "none"


class MentionPhaseResolutionNeed(GroundingModel):
    scope: Literal["mentions"] = "mentions"


class ValuePhaseResolutionNeed(GroundingModel):
    scope: Literal["values"] = "values"
    values: tuple[str, ...]


PhaseResolutionNeed = Annotated[
    NoPhaseResolutionNeed | MentionPhaseResolutionNeed | ValuePhaseResolutionNeed,
    Field(discriminator="scope"),
]


class NoDateResolutionNeed(GroundingModel):
    scope: Literal["none"] = "none"


class MentionDateResolutionNeed(GroundingModel):
    scope: Literal["mentions"] = "mentions"


class ValueDateResolutionNeed(GroundingModel):
    scope: Literal["values"] = "values"
    values: tuple[str, ...]


DateResolutionNeed = Annotated[
    NoDateResolutionNeed | MentionDateResolutionNeed | ValueDateResolutionNeed,
    Field(discriminator="scope"),
]


class NoMeetingDecisionNeed(GroundingModel):
    scope: Literal["none"] = "none"


class RecentMeetingDecisionNeed(GroundingModel):
    scope: Literal["recent"] = "recent"
    project_ids: tuple[str, ...] | None = None
    limit: int = Field(ge=0)


MeetingDecisionNeed = Annotated[
    NoMeetingDecisionNeed | RecentMeetingDecisionNeed,
    Field(discriminator="scope"),
]


class GroundingContract(GroundingModel):
    """The complete grounding declaration required from every AI surface."""

    surface: AiSurface
    subject: GroundingSubject
    input: str
    users: EntityResolutionNeed
    projects: EntityResolutionNeed
    phases: PhaseResolutionNeed
    dates: DateResolutionNeed
    recent_meeting_decisions: MeetingDecisionNeed


class ResolvedUser(GroundingModel):
    kind: Literal["user"] = "user"
    id: str
    name: str
    email: str
    aliases: tuple[str, ...]


class ResolvedProject(GroundingModel):
    kind: Literal["project"] = "project"
    id: str
    code: str
    title: str
    phase: str
    client: str | None
    commune: str | None
    aliases: tuple[str, ...]


class ResolvedPhase(GroundingModel):
    kind: Literal["phase"] = "phase"
    value: str
    aliases: tuple[str, ...]


class ResolvedDate(GroundingModel):
    kind: Literal["date"] = "date"
    source: str
    iso_date: str
    precision: Literal["day", "week"]


class ResolvedMeetingDecision(GroundingModel):
    kind: Literal["meeting-decision"] = "meeting-decision"
    memory_id: str
    project_id: str
    text: str
    decided_by: str | None
    decided_at: str | None


class GroundingMiss(GroundingModel):
    kind: GroundingKind
    reference: str
    reason: Literal["not-found", "invalid"]


class ResolvedContext(GroundingModel):
    surface: AiSurface
    resolved_at: str
    users: tuple[ResolvedUser, ...]
    projects: tuple[ResolvedProject, ...]
    phases: tuple[ResolvedPhase, ...]
    dates: tuple[ResolvedDate, ...]
    recent_meeting_decisions: tuple[ResolvedMeetingDecision, ...]
    unresolved: tuple[GroundingMiss, ...]


class GroundingUserRow(GroundingModel):
    id: str
    name: str | None
    email: str
    initials: str | None


class GroundingProjectRow(GroundingModel):
    id: str
    code: str
    title: str
    phase: str
    client: str | None
    commune: str | None


class GroundingMemoryRow(GroundingModel):
    id: str
    project_id: str
    key_decisions: Any
    updated_at: datetime


class GroundingDataSource(Protocol):
    async def list_users(self, subject: GroundingSubject) -> Sequence[GroundingUserRow]: ...

    async def list_projects(self, subject: GroundingSubject) -> Sequence[GroundingProjectRow]: ...

    async def list_meeting_memories(
        self,
        project_ids: Sequence[str],
    ) -> Sequence[GroundingMemoryRow]: ...


SessionFactory = Callable[[], AbstractAsyncContextManager[AsyncSession]]

WORKSPACE_PROJECT_ROLES = frozenset(
    {"admin", "super_admin", "director", "manager", "project_manager"}
)


class SqlGroundingDataSource:
    """The sole SQL boundary used to assemble Python AI grounding context."""

    def __init__(self, session_factory: SessionFactory | None = None) -> None:
        self._session_factory = session_factory

    def _sessions(self) -> SessionFactory:
        if self._session_factory is not None:
            return self._session_factory
        from app.platform.db.database import AsyncSessionLocal

        return AsyncSessionLocal

    async def list_users(self, subject: GroundingSubject) -> list[GroundingUserRow]:
        del subject
        async with self._sessions()() as db:
            result = await db.execute(
                text(
                    'SELECT id, name, email, initials FROM "User" '
                    'WHERE "isActive" = true ORDER BY name ASC NULLS LAST, email ASC'
                )
            )
        return [
            GroundingUserRow(
                id=row["id"],
                name=row["name"],
                email=row["email"],
                initials=row["initials"],
            )
            for row in result.mappings().all()
        ]

    async def list_projects(self, subject: GroundingSubject) -> list[GroundingProjectRow]:
        params: dict[str, Any] = {}
        access_clause = ""
        if subject.role not in WORKSPACE_PROJECT_ROLES:
            access_clause = (
                ' AND EXISTS (SELECT 1 FROM "ProjectAssignment" pa '
                'WHERE pa."projectId" = p.id AND pa."userId" = :user_id)'
            )
            params["user_id"] = subject.user_id

        async with self._sessions()() as db:
            result = await db.execute(
                text(
                    'SELECT p.id, p.code, p.title, p.phase, p.client, p.commune '
                    'FROM "Project" p WHERE p.status = \'active\''
                    f"{access_clause} ORDER BY p.code ASC"
                ),
                params,
            )
        return [
            GroundingProjectRow(
                id=row["id"],
                code=row["code"],
                title=row["title"],
                phase=row["phase"],
                client=row["client"],
                commune=row["commune"],
            )
            for row in result.mappings().all()
        ]

    async def list_meeting_memories(
        self,
        project_ids: Sequence[str],
    ) -> list[GroundingMemoryRow]:
        unique_project_ids = tuple(dict.fromkeys(project_ids))
        if not unique_project_ids:
            return []
        statement = text(
            'SELECT id, "projectId", "keyDecisions", "updatedAt" '
            'FROM "ProjectMeetingMemory" WHERE "projectId" IN :project_ids '
            'ORDER BY "updatedAt" DESC'
        ).bindparams(bindparam("project_ids", expanding=True))
        async with self._sessions()() as db:
            result = await db.execute(statement, {"project_ids": unique_project_ids})
        return [
            GroundingMemoryRow(
                id=row["id"],
                project_id=row["projectId"],
                key_decisions=row["keyDecisions"],
                updated_at=row["updatedAt"],
            )
            for row in result.mappings().all()
        ]


sql_grounding_data_source = SqlGroundingDataSource()

CANONICAL_PHASES = (
    "ETUDE/AP",
    "MAE",
    "CHANTIER",
    "EXE/DG/DV/3D",
    "TERMINATO",
    "STUCK",
    "CONCORSO",
)


def _normalise(value: str) -> str:
    decomposed = unicodedata.normalize("NFKD", value)
    without_marks = "".join(char for char in decomposed if not unicodedata.combining(char))
    return " ".join(re.sub(r"[^a-z0-9]+", " ", without_marks.casefold()).split())


def _unique(values: Sequence[str | None]) -> tuple[str, ...]:
    return tuple(dict.fromkeys(value for value in values if value and value.strip()))


def _contains_alias(normalised_input: str, alias: str) -> bool:
    normalised_alias = _normalise(alias)
    return bool(normalised_alias) and f" {normalised_alias} " in f" {normalised_input} "


def _user_aliases(row: GroundingUserRow, unique_first_names: set[str]) -> tuple[str, ...]:
    name_parts = (row.name or "").strip().split()
    first_name = name_parts[0] if name_parts else None
    email_local = row.email.split("@", 1)[0]
    return _unique(
        (
            row.name,
            row.email,
            email_local,
            row.initials,
            first_name if first_name and _normalise(first_name) in unique_first_names else None,
        )
    )


class _ResolvableEntity(Protocol):
    id: str
    aliases: tuple[str, ...]


EntityT = TypeVar("EntityT", bound=_ResolvableEntity)


def _select_entities(  # noqa: UP047 - PEP 695 syntax requires Python 3.13
    entities: Sequence[EntityT],
    need: EntityResolutionNeed,
    normalised_input: str,
    kind: Literal["user", "project"],
) -> tuple[list[EntityT], list[GroundingMiss]]:
    if need.scope == "none":
        return [], []
    if need.scope == "workspace":
        return list(entities), []
    if need.scope == "mentions":
        return [
            entity
            for entity in entities
            if any(_contains_alias(normalised_input, alias) for alias in entity.aliases)
        ], []

    by_id = {entity.id: entity for entity in entities}
    resolved = [by_id[entity_id] for entity_id in need.ids if entity_id in by_id]
    unresolved = [
        GroundingMiss(kind=kind, reference=entity_id, reason="not-found")
        for entity_id in need.ids
        if entity_id not in by_id
    ]
    return resolved, unresolved


def _canonical_phase(value: str) -> str | None:
    compact = "/".join(part.strip() for part in value.strip().split("/"))
    candidates = {phase.casefold(): phase for phase in CANONICAL_PHASES}
    return candidates.get(compact.casefold())


def _resolve_phases(
    need: PhaseResolutionNeed,
    input_value: str,
) -> tuple[list[ResolvedPhase], list[GroundingMiss]]:
    if need.scope == "none":
        return [], []
    values = need.values if need.scope == "values" else CANONICAL_PHASES
    compact_input = re.sub(r"\s*/\s*", "/", input_value.upper())
    resolved: list[ResolvedPhase] = []
    unresolved: list[GroundingMiss] = []
    seen: set[str] = set()
    for source in values:
        canonical = _canonical_phase(source)
        if canonical is None:
            unresolved.append(GroundingMiss(kind="phase", reference=source, reason="invalid"))
            continue
        if canonical in seen:
            continue
        seen.add(canonical)
        if need.scope == "mentions" and canonical not in compact_input:
            continue
        resolved.append(
            ResolvedPhase(
                value=canonical,
                aliases=_unique((canonical, canonical.replace("/", " / "))),
            )
        )
    return resolved, unresolved


def _to_iso_date(year: int, month: int, day: int) -> str | None:
    try:
        return date(year, month, day).isoformat()
    except ValueError:
        return None


def _as_utc(value: datetime) -> datetime:
    if value.tzinfo is None:
        return value.replace(tzinfo=UTC)
    return value.astimezone(UTC)


def _resolve_dates(
    need: DateResolutionNeed,
    input_value: str,
    now: datetime,
) -> tuple[list[ResolvedDate], list[GroundingMiss]]:
    if need.scope == "none":
        return [], []
    values = list(need.values) if need.scope == "values" else []
    if need.scope == "mentions":
        values.extend(re.findall(r"\b\d{4}-\d{2}-\d{2}\b", input_value))
        values.extend(re.findall(r"\b\d{1,2}[/.]\d{1,2}[/.]\d{4}\b", input_value))
        lowered = input_value.casefold()
        for relative in ("today", "tomorrow", "yesterday", "next week"):
            if relative in lowered:
                values.append(relative)

    resolved: list[ResolvedDate] = []
    unresolved: list[GroundingMiss] = []
    current_date = _as_utc(now).date()
    for source in _unique(values):
        lowered = source.casefold()
        iso_date: str | None = None
        precision: Literal["day", "week"] = "day"
        if lowered in {"today", "tomorrow", "yesterday"}:
            offset = 1 if lowered == "tomorrow" else -1 if lowered == "yesterday" else 0
            iso_date = (current_date + timedelta(days=offset)).isoformat()
        elif lowered == "next week":
            iso_date = (current_date + timedelta(days=7 - current_date.weekday())).isoformat()
            precision = "week"
        elif iso_match := re.fullmatch(r"(\d{4})-(\d{2})-(\d{2})", source):
            iso_date = _to_iso_date(*(int(part) for part in iso_match.groups()))
        elif european_match := re.fullmatch(r"(\d{1,2})[/.](\d{1,2})[/.](\d{4})", source):
            day, month, year = (int(part) for part in european_match.groups())
            iso_date = _to_iso_date(year, month, day)

        if iso_date is None:
            unresolved.append(GroundingMiss(kind="date", reference=source, reason="invalid"))
        else:
            resolved.append(
                ResolvedDate(source=source, iso_date=iso_date, precision=precision)
            )
    return resolved, unresolved


def _decision_time(value: Any, fallback: datetime) -> str:
    if isinstance(value, str) and value.strip():
        return value
    return _as_utc(fallback).isoformat().replace("+00:00", "Z")


def _resolve_decisions(
    memories: Sequence[GroundingMemoryRow],
    limit: int,
) -> list[ResolvedMeetingDecision]:
    decisions: list[ResolvedMeetingDecision] = []
    for memory in memories:
        if not isinstance(memory.key_decisions, list):
            continue
        for item in memory.key_decisions:
            if not isinstance(item, dict):
                continue
            decision_text = item.get("what")
            if not isinstance(decision_text, str) or not decision_text.strip():
                continue
            decided_by = item.get("who")
            decisions.append(
                ResolvedMeetingDecision(
                    memory_id=memory.id,
                    project_id=memory.project_id,
                    text=decision_text.strip(),
                    decided_by=decided_by if isinstance(decided_by, str) else None,
                    decided_at=_decision_time(item.get("at"), memory.updated_at),
                )
            )
    decisions.sort(key=lambda decision: decision.decided_at or "", reverse=True)
    return decisions[: max(0, limit)]


def _resolved_at(value: datetime) -> str:
    return _as_utc(value).isoformat().replace("+00:00", "Z")


async def resolve_grounding(
    contract: GroundingContract,
    *,
    data_source: GroundingDataSource | None = None,
    now: datetime | None = None,
) -> ResolvedContext:
    """Resolve a surface declaration before any provider call is made."""

    source = data_source or sql_grounding_data_source
    needs_projects = (
        contract.projects.scope != "none" or contract.recent_meeting_decisions.scope != "none"
    )
    user_rows, project_rows = await asyncio.gather(
        source.list_users(contract.subject) if contract.users.scope != "none" else _empty_users(),
        source.list_projects(contract.subject) if needs_projects else _empty_projects(),
    )

    first_name_counts: dict[str, int] = {}
    for row in user_rows:
        name_parts = (row.name or "").split()
        first_name = _normalise(name_parts[0]) if name_parts else ""
        if first_name:
            first_name_counts[first_name] = first_name_counts.get(first_name, 0) + 1
    unique_first_names = {
        first_name for first_name, count in first_name_counts.items() if count == 1
    }

    all_users = [
        ResolvedUser(
            id=row.id,
            name=(row.name or "").strip() or row.email,
            email=row.email,
            aliases=_user_aliases(row, unique_first_names),
        )
        for row in user_rows
    ]
    all_projects = [
        ResolvedProject(
            id=row.id,
            code=row.code,
            title=row.title,
            phase=row.phase,
            client=row.client,
            commune=row.commune,
            aliases=_unique((row.code, row.title)),
        )
        for row in project_rows
    ]

    normalised_input = _normalise(contract.input)
    selected_users, user_misses = _select_entities(
        all_users, contract.users, normalised_input, "user"
    )
    selected_projects, project_misses = _select_entities(
        all_projects, contract.projects, normalised_input, "project"
    )
    resolved_phases, phase_misses = _resolve_phases(contract.phases, contract.input)
    resolution_time = now or datetime.now(UTC)
    resolved_dates, date_misses = _resolve_dates(contract.dates, contract.input, resolution_time)

    recent_decisions: list[ResolvedMeetingDecision] = []
    decision_misses: list[GroundingMiss] = []
    if contract.recent_meeting_decisions.scope == "recent":
        accessible_ids = {project.id for project in all_projects}
        requested_ids = contract.recent_meeting_decisions.project_ids
        if requested_ids is not None:
            decision_project_ids = [
                project_id for project_id in requested_ids if project_id in accessible_ids
            ]
            decision_misses = [
                GroundingMiss(
                    kind="meeting-decision",
                    reference=project_id,
                    reason="not-found",
                )
                for project_id in requested_ids
                if project_id not in accessible_ids
            ]
        elif contract.projects.scope == "ids":
            decision_project_ids = [project.id for project in selected_projects]
        else:
            mentioned_projects, _ = _select_entities(
                all_projects,
                MentionEntityResolutionNeed(),
                normalised_input,
                "project",
            )
            decision_project_ids = [project.id for project in mentioned_projects]
        memories = await source.list_meeting_memories(decision_project_ids)
        recent_decisions = _resolve_decisions(
            memories,
            contract.recent_meeting_decisions.limit,
        )

    return ResolvedContext(
        surface=contract.surface,
        resolved_at=_resolved_at(resolution_time),
        users=tuple(selected_users),
        projects=tuple(selected_projects),
        phases=tuple(resolved_phases),
        dates=tuple(resolved_dates),
        recent_meeting_decisions=tuple(recent_decisions),
        unresolved=tuple(
            [
                *user_misses,
                *project_misses,
                *phase_misses,
                *date_misses,
                *decision_misses,
            ]
        ),
    )


async def _empty_users() -> Sequence[GroundingUserRow]:
    return ()


async def _empty_projects() -> Sequence[GroundingProjectRow]:
    return ()


def serialise_resolved_context(context: ResolvedContext) -> str:
    return json.dumps(context.model_dump(mode="json", by_alias=True), separators=(",", ":"))
