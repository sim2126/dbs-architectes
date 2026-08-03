from __future__ import annotations

import json
from collections.abc import Sequence
from datetime import UTC, datetime
from typing import Any, cast

from app.platform.ai.grounding import (
    GroundingContract,
    GroundingMemoryRow,
    GroundingMiss,
    GroundingProjectRow,
    GroundingSubject,
    GroundingUserRow,
    IdEntityResolutionNeed,
    MentionDateResolutionNeed,
    MentionEntityResolutionNeed,
    MentionPhaseResolutionNeed,
    NoDateResolutionNeed,
    NoEntityResolutionNeed,
    NoMeetingDecisionNeed,
    NoPhaseResolutionNeed,
    RecentMeetingDecisionNeed,
    ResolvedContext,
    ResolvedDate,
    SqlGroundingDataSource,
    ValueDateResolutionNeed,
    ValuePhaseResolutionNeed,
    WorkspaceEntityResolutionNeed,
    extend_grounding_with_trusted_tool_result,
    resolve_grounding,
    serialise_resolved_context,
)


class FakeGroundingDataSource:
    def __init__(
        self,
        *,
        users: list[GroundingUserRow] | None = None,
        projects: list[GroundingProjectRow] | None = None,
        memories: list[GroundingMemoryRow] | None = None,
    ) -> None:
        self.users = users or []
        self.projects = projects or []
        self.memories = memories or []
        self.user_subjects: list[GroundingSubject] = []
        self.project_subjects: list[GroundingSubject] = []
        self.memory_project_ids: list[tuple[str, ...]] = []

    async def list_users(self, subject: GroundingSubject) -> list[GroundingUserRow]:
        self.user_subjects.append(subject)
        return self.users

    async def list_projects(self, subject: GroundingSubject) -> list[GroundingProjectRow]:
        self.project_subjects.append(subject)
        return self.projects

    async def list_meeting_memories(
        self,
        project_ids: Sequence[str],
    ) -> list[GroundingMemoryRow]:
        self.memory_project_ids.append(tuple(project_ids))
        requested = set(project_ids)
        return [memory for memory in self.memories if memory.project_id in requested]


def no_grounding_contract(**overrides: Any) -> GroundingContract:
    values: dict[str, Any] = {
        "surface": "dbs-gpt",
        "subject": GroundingSubject(user_id="requester-1", role="collaborator"),
        "input": "Hello",
        "users": NoEntityResolutionNeed(),
        "projects": NoEntityResolutionNeed(),
        "phases": NoPhaseResolutionNeed(),
        "dates": NoDateResolutionNeed(),
        "recent_meeting_decisions": NoMeetingDecisionNeed(),
    }
    values.update(overrides)
    return GroundingContract(**values)


async def test_resolves_mentions_phases_dates_and_recent_decisions() -> None:
    subject = GroundingSubject(user_id="requester-1", role="collaborator")
    data_source = FakeGroundingDataSource(
        users=[
            GroundingUserRow(
                id="user-giulio",
                name="Giulio Sovran",
                email="giulio.sovran@dbsarc.com",
                initials="GS",
            ),
            GroundingUserRow(
                id="user-luigi",
                name="Luigi Di Berardino",
                email="luigi.di.berardino@dbsarc.com",
                initials="LD",
            ),
        ],
        projects=[
            GroundingProjectRow(
                id="project-saillen",
                code="DBS-2025-001",
                title="Le Saillen",
                phase="ETUDE/AP",
                client="Private",
                commune="Salins",
            )
        ],
        memories=[
            GroundingMemoryRow(
                id="memory-1",
                project_id="project-saillen",
                key_decisions=[
                    {
                        "what": "Retain the stone facade",
                        "who": "Giulio Sovran",
                        "at": "2026-08-01T09:30:00Z",
                    }
                ],
                updated_at=datetime(2026, 8, 2, 8, tzinfo=UTC),
            )
        ],
    )
    contract = no_grounding_contract(
        subject=subject,
        input="Ask Giulio about Le Saillen in ETUDE / AP tomorrow and next week.",
        users=MentionEntityResolutionNeed(),
        projects=MentionEntityResolutionNeed(),
        phases=MentionPhaseResolutionNeed(),
        dates=MentionDateResolutionNeed(),
        recent_meeting_decisions=RecentMeetingDecisionNeed(
            project_ids=("project-saillen",),
            limit=3,
        ),
    )

    resolved = await resolve_grounding(
        contract,
        data_source=data_source,
        now=datetime(2026, 8, 3, 12, tzinfo=UTC),
    )

    assert [user.id for user in resolved.users] == ["user-giulio"]
    assert "Giulio" in resolved.users[0].aliases
    assert [project.id for project in resolved.projects] == ["project-saillen"]
    assert [phase.value for phase in resolved.phases] == ["ETUDE/AP"]
    assert [(item.source, item.iso_date, item.precision) for item in resolved.dates] == [
        ("tomorrow", "2026-08-04", "day"),
        ("next week", "2026-08-10", "week"),
    ]
    assert resolved.recent_meeting_decisions[0].text == "Retain the stone facade"
    assert resolved.recent_meeting_decisions[0].decided_by == "user-giulio"
    assert data_source.user_subjects == [subject]
    assert data_source.project_subjects == [subject]
    assert data_source.memory_project_ids == [("project-saillen",)]
    assert resolved.unresolved == ()


async def test_explicit_memory_ids_are_intersected_with_accessible_projects() -> None:
    data_source = FakeGroundingDataSource(
        projects=[
            GroundingProjectRow(
                id="accessible-project",
                code="DBS-2025-001",
                title="Le Saillen",
                phase="ETUDE/AP",
                client=None,
                commune="Salins",
            )
        ],
        memories=[
            GroundingMemoryRow(
                id="secret-memory",
                project_id="unassigned-project",
                key_decisions=[{"what": "Confidential decision"}],
                updated_at=datetime(2026, 8, 1, tzinfo=UTC),
            )
        ],
    )
    contract = no_grounding_contract(
        recent_meeting_decisions=RecentMeetingDecisionNeed(
            project_ids=("unassigned-project",),
            limit=5,
        )
    )

    resolved = await resolve_grounding(contract, data_source=data_source)

    assert resolved.recent_meeting_decisions == ()
    assert data_source.memory_project_ids == [()]
    assert [miss.model_dump() for miss in resolved.unresolved] == [
        {
            "kind": "meeting-decision",
            "reference": "unassigned-project",
            "reason": "not-found",
        }
    ]


async def test_recent_decisions_without_ids_use_mentions_not_workspace_scope() -> None:
    data_source = FakeGroundingDataSource(
        projects=[
            GroundingProjectRow(
                id="project-saillen",
                code="DBS-2025-001",
                title="Le Saillen",
                phase="ETUDE/AP",
                client=None,
                commune="Salins",
            ),
            GroundingProjectRow(
                id="project-solaris",
                code="DBS-2015-048",
                title="Solaris",
                phase="TERMINATO",
                client=None,
                commune="Sion",
            ),
        ]
    )
    contract = no_grounding_contract(
        input="What was decided for Le Saillen?",
        projects=WorkspaceEntityResolutionNeed(),
        recent_meeting_decisions=RecentMeetingDecisionNeed(project_ids=None, limit=5),
    )

    resolved = await resolve_grounding(contract, data_source=data_source)

    assert [project.id for project in resolved.projects] == [
        "project-saillen",
        "project-solaris",
    ]
    assert data_source.memory_project_ids == [("project-saillen",)]


async def test_broad_recent_decision_intent_uses_all_accessible_projects() -> None:
    data_source = FakeGroundingDataSource(
        projects=[
            GroundingProjectRow(
                id="project-saillen",
                code="DBS-2025-001",
                title="Le Saillen",
                phase="ETUDE/AP",
                client=None,
                commune="Salins",
            ),
            GroundingProjectRow(
                id="project-solaris",
                code="DBS-2015-048",
                title="Solaris",
                phase="TERMINATO",
                client=None,
                commune="Sion",
            ),
        ],
        memories=[
            GroundingMemoryRow(
                id="memory-saillen",
                project_id="project-saillen",
                key_decisions=[{"what": "Retain the stone facade"}],
                updated_at=datetime(2026, 8, 2, tzinfo=UTC),
            ),
            GroundingMemoryRow(
                id="memory-solaris",
                project_id="project-solaris",
                key_decisions=[{"what": "Issue the final dossier"}],
                updated_at=datetime(2026, 8, 1, tzinfo=UTC),
            ),
        ],
    )
    contract = no_grounding_contract(
        input="Show me the latest meeting decisions.",
        projects=WorkspaceEntityResolutionNeed(),
        recent_meeting_decisions=RecentMeetingDecisionNeed(project_ids=None, limit=5),
    )

    resolved = await resolve_grounding(contract, data_source=data_source)

    assert data_source.memory_project_ids == [
        ("project-saillen", "project-solaris")
    ]
    assert [decision.memory_id for decision in resolved.recent_meeting_decisions] == [
        "memory-saillen",
        "memory-solaris",
    ]


async def test_generic_prompt_does_not_load_portfolio_meeting_memory() -> None:
    data_source = FakeGroundingDataSource(
        projects=[
            GroundingProjectRow(
                id="project-saillen",
                code="DBS-2025-001",
                title="Le Saillen",
                phase="ETUDE/AP",
                client=None,
                commune="Salins",
            )
        ]
    )
    contract = no_grounding_contract(
        input="How is the portfolio doing?",
        projects=WorkspaceEntityResolutionNeed(),
        recent_meeting_decisions=RecentMeetingDecisionNeed(project_ids=None, limit=5),
    )

    await resolve_grounding(contract, data_source=data_source)

    assert data_source.memory_project_ids == [()]


async def test_ids_and_invalid_phase_and_date_values_are_reported() -> None:
    data_source = FakeGroundingDataSource(
        users=[
            GroundingUserRow(
                id="known-user",
                name="Giulio Sovran",
                email="giulio.sovran@dbsarc.com",
                initials="GS",
            )
        ],
        projects=[
            GroundingProjectRow(
                id="known-project",
                code="DBS-2025-001",
                title="Le Saillen",
                phase="ETUDE/AP",
                client=None,
                commune="Salins",
            )
        ],
    )
    contract = no_grounding_contract(
        users=IdEntityResolutionNeed(ids=("known-user", "missing-user")),
        projects=IdEntityResolutionNeed(ids=("known-project", "missing-project")),
        phases=ValuePhaseResolutionNeed(values=("etude / ap", "invented")),
        dates=ValueDateResolutionNeed(values=("04/08/2026", "31/02/2026")),
    )

    resolved = await resolve_grounding(contract, data_source=data_source)

    assert [user.id for user in resolved.users] == ["known-user"]
    assert [project.id for project in resolved.projects] == ["known-project"]
    assert [phase.value for phase in resolved.phases] == ["ETUDE/AP"]
    assert [item.iso_date for item in resolved.dates] == ["2026-08-04"]
    assert {(miss.kind, miss.reference, miss.reason) for miss in resolved.unresolved} == {
        ("user", "missing-user", "not-found"),
        ("project", "missing-project", "not-found"),
        ("phase", "invented", "invalid"),
        ("date", "31/02/2026", "invalid"),
    }


async def test_ambiguous_first_names_are_not_used_as_aliases() -> None:
    data_source = FakeGroundingDataSource(
        users=[
            GroundingUserRow(
                id="michele-1",
                name="Michele Moretti",
                email="michele.moretti@dbsarc.com",
                initials="MM",
            ),
            GroundingUserRow(
                id="michele-2",
                name="Michèle Jemini",
                email="michele.jemini@dbsarc.com",
                initials="MJ",
            ),
        ]
    )
    contract = no_grounding_contract(
        input="Ask Michele for an update",
        users=MentionEntityResolutionNeed(),
    )

    resolved = await resolve_grounding(contract, data_source=data_source)

    assert resolved.users == ()
    assert [(miss.kind, miss.reference, miss.reason) for miss in resolved.unresolved] == [
        ("user", "Michele", "invalid")
    ]


async def test_duplicate_initials_and_project_titles_are_not_resolved() -> None:
    data_source = FakeGroundingDataSource(
        users=[
            GroundingUserRow(
                id="ali-1",
                name="Ali Reza Hakim",
                email="ali.hakim@dbsarc.com",
                initials="AR",
            ),
            GroundingUserRow(
                id="anna-1",
                name="Anna Rossi",
                email="anna.rossi@dbsarc.com",
                initials="AR",
            ),
        ],
        projects=[
            GroundingProjectRow(
                id="tower-1",
                code="DBS-2025-001",
                title="Garden Tower",
                phase="ETUDE/AP",
                client=None,
                commune="Sion",
            ),
            GroundingProjectRow(
                id="tower-2",
                code="DBS-2025-002",
                title="Garden Tower",
                phase="CHANTIER",
                client=None,
                commune="Milan",
            ),
        ],
    )
    contract = no_grounding_contract(
        input="Ask AR about Garden Tower",
        users=MentionEntityResolutionNeed(),
        projects=MentionEntityResolutionNeed(),
    )

    resolved = await resolve_grounding(contract, data_source=data_source)

    assert resolved.users == ()
    assert resolved.projects == ()
    assert {(miss.kind, miss.reference, miss.reason) for miss in resolved.unresolved} == {
        ("user", "AR", "invalid"),
        ("project", "Garden Tower", "invalid"),
    }


async def test_recognisable_unknown_mentions_are_reported() -> None:
    data_source = FakeGroundingDataSource(
        users=[
            GroundingUserRow(
                id="known-user",
                name="Giulio Sovran",
                email="giulio.sovran@dbsarc.com",
                initials="GS",
            )
        ],
        projects=[
            GroundingProjectRow(
                id="known-project",
                code="DBS-2025-001",
                title="Le Saillen",
                phase="ETUDE/AP",
                client=None,
                commune="Salins",
            )
        ],
    )
    contract = no_grounding_contract(
        input=(
            "Ask user_id:known-user and missing.person@dbsarc.com about "
            "project_id:known-project, project_id:missing-project and DBS-2099-999."
        ),
        users=MentionEntityResolutionNeed(),
        projects=MentionEntityResolutionNeed(),
    )

    resolved = await resolve_grounding(contract, data_source=data_source)

    assert [user.id for user in resolved.users] == ["known-user"]
    assert [project.id for project in resolved.projects] == ["known-project"]
    assert {(miss.kind, miss.reference, miss.reason) for miss in resolved.unresolved} == {
        ("user", "missing.person@dbsarc.com", "not-found"),
        ("project", "missing-project", "not-found"),
        ("project", "DBS-2099-999", "not-found"),
    }


async def test_workspace_scope_still_reports_recognisable_unknown_mentions() -> None:
    contract = no_grounding_contract(
        input="Contact missing.person@dbsarc.com about DBS-2099-999.",
        users=WorkspaceEntityResolutionNeed(),
        projects=WorkspaceEntityResolutionNeed(),
    )

    resolved = await resolve_grounding(
        contract,
        data_source=FakeGroundingDataSource(),
    )

    assert {(miss.kind, miss.reference, miss.reason) for miss in resolved.unresolved} == {
        ("user", "missing.person@dbsarc.com", "not-found"),
        ("project", "DBS-2099-999", "not-found"),
    }


def test_trusted_tool_result_extends_dates_without_mutating_context() -> None:
    context = ResolvedContext(
        surface="chat-agent",
        resolved_at="2026-08-03T12:00:00Z",
        users=(),
        projects=(),
        phases=(),
        dates=(ResolvedDate(source="2026-08-04", iso_date="2026-08-04", precision="day"),),
        recent_meeting_decisions=(),
        unresolved=(GroundingMiss(kind="user", reference="unknown", reason="not-found"),),
    )

    extended = extend_grounding_with_trusted_tool_result(
        context,
        {
            "deadline": "04/08/2026",
            "events": ["Review on 2026-08-05", {"invalid": "31/02/2026"}],
        },
        now=datetime(2026, 8, 3, tzinfo=UTC),
    )

    assert extended is not context
    assert context.dates[0].source == "2026-08-04"
    assert [(item.source, item.iso_date) for item in extended.dates] == [
        ("2026-08-04", "2026-08-04"),
        ("04/08/2026", "2026-08-04"),
        ("2026-08-05", "2026-08-05"),
    ]
    assert [(miss.kind, miss.reference) for miss in extended.unresolved] == [
        ("user", "unknown"),
        ("date", "31/02/2026"),
    ]


async def test_workspace_scope_and_serialisation_match_the_typescript_shape() -> None:
    data_source = FakeGroundingDataSource(
        users=[
            GroundingUserRow(
                id="user-1",
                name=None,
                email="user@dbsarc.com",
                initials=None,
            )
        ]
    )
    contract = no_grounding_contract(
        surface="translation",
        users=WorkspaceEntityResolutionNeed(),
    )

    resolved = await resolve_grounding(
        contract,
        data_source=data_source,
        now=datetime(2026, 8, 3, tzinfo=UTC),
    )
    payload = json.loads(serialise_resolved_context(resolved))

    assert payload["surface"] == "translation"
    assert payload["resolvedAt"] == "2026-08-03T00:00:00Z"
    assert payload["users"][0]["name"] == "user@dbsarc.com"
    assert payload["recentMeetingDecisions"] == []


class FakeMappings:
    def __init__(self, rows: list[dict[str, Any]]) -> None:
        self.rows = rows

    def all(self) -> list[dict[str, Any]]:
        return self.rows


class FakeSqlResult:
    def __init__(self, rows: list[dict[str, Any]]) -> None:
        self.rows = rows

    def mappings(self) -> FakeMappings:
        return FakeMappings(self.rows)


class FakeSqlSession:
    def __init__(self, rows: list[dict[str, Any]]) -> None:
        self.rows = rows
        self.calls: list[tuple[str, dict[str, Any]]] = []

    async def execute(self, statement: Any, params: dict[str, Any] | None = None) -> FakeSqlResult:
        self.calls.append((str(statement), params or {}))
        return FakeSqlResult(self.rows)


class FakeSqlSessionContext:
    def __init__(self, session: FakeSqlSession) -> None:
        self.session = session

    async def __aenter__(self) -> FakeSqlSession:
        return self.session

    async def __aexit__(self, *_: Any) -> None:
        return None


async def test_sql_datasource_scopes_collaborator_projects_by_assignment() -> None:
    session = FakeSqlSession(
        [
            {
                "id": "project-1",
                "code": "DBS-2025-001",
                "title": "Le Saillen",
                "phase": "ETUDE/AP",
                "client": None,
                "commune": "Salins",
            }
        ]
    )

    def session_factory() -> FakeSqlSessionContext:
        return FakeSqlSessionContext(session)

    data_source = SqlGroundingDataSource(session_factory=cast(Any, session_factory))
    rows = await data_source.list_projects(
        GroundingSubject(user_id="collaborator-1", role="collaborator")
    )

    query, params = session.calls[0]
    assert rows[0].id == "project-1"
    assert 'FROM "ProjectAssignment"' in query
    assert params == {"user_id": "collaborator-1"}


async def test_sql_datasource_keeps_manager_projects_assignment_scoped() -> None:
    session = FakeSqlSession([])

    def session_factory() -> FakeSqlSessionContext:
        return FakeSqlSessionContext(session)

    data_source = SqlGroundingDataSource(session_factory=cast(Any, session_factory))
    await data_source.list_projects(GroundingSubject(user_id="manager-1", role="manager"))

    query, params = session.calls[0]
    assert "p.status != 'deleted'" in query
    assert 'FROM "ProjectAssignment"' in query
    assert params == {"user_id": "manager-1"}


async def test_sql_datasource_allows_only_admins_without_assignment_filter() -> None:
    session = FakeSqlSession([])

    def session_factory() -> FakeSqlSessionContext:
        return FakeSqlSessionContext(session)

    data_source = SqlGroundingDataSource(session_factory=cast(Any, session_factory))
    await data_source.list_projects(GroundingSubject(user_id="admin-1", role="admin"))

    query, params = session.calls[0]
    assert 'FROM "ProjectAssignment"' not in query
    assert params == {}
