from __future__ import annotations

from copy import deepcopy
from typing import Any

import pytest

from app.platform.ai.grounding import (
    ResolvedContext,
    ResolvedDate,
    ResolvedMeetingDecision,
    ResolvedPhase,
    ResolvedProject,
    ResolvedUser,
)
from app.platform.ai.validation import validate_grounding


@pytest.fixture
def resolved_context() -> ResolvedContext:
    return ResolvedContext(
        surface="dbs-gpt",
        resolved_at="2026-08-03T12:00:00Z",
        users=(
            ResolvedUser(
                id="user-giulio",
                name="Giulio Sovran",
                email="giulio.sovran@dbsarc.com",
                aliases=("Giulio Sovran", "Giulio", "GS"),
            ),
            ResolvedUser(
                id="user-luigi",
                name="Luigi Di Berardino",
                email="luigi.di.berardino@dbsarc.com",
                aliases=("Luigi Di Berardino", "Luigi", "LD"),
            ),
        ),
        projects=(
            ResolvedProject(
                id="project-saillen",
                code="DBS-2025-001",
                title="Le Saillen",
                phase="ETUDE/AP",
                client="Private",
                commune="Salins",
                aliases=("DBS-2025-001", "Le Saillen"),
            ),
        ),
        phases=(ResolvedPhase(value="ETUDE/AP", aliases=("ETUDE / AP",)),),
        dates=(
            ResolvedDate(source="tomorrow", iso_date="2026-08-04", precision="day"),
        ),
        recent_meeting_decisions=(
            ResolvedMeetingDecision(
                memory_id="memory-1",
                project_id="project-saillen",
                text="Retain the stone facade",
                decided_by="user-giulio",
                decided_at="2026-08-02T09:30:00Z",
            ),
        ),
        unresolved=(),
    )


def test_accepts_nested_resolved_entity_references(
    resolved_context: ResolvedContext,
) -> None:
    output = {
        "people": [
            {
                "userId": "user-giulio",
                "name": "Giulio Sovran",
                "email": "giulio.sovran@dbsarc.com",
            }
        ],
        "participants": ["Giulio", "Luigi Di Berardino"],
        "reviewer": "Luigi",
        "reviewerId": "user-luigi",
        "projects": [
            {
                "projectId": "project-saillen",
                "code": "DBS-2025-001",
                "title": "Le Saillen",
                "phase": "ETUDE / AP",
            }
        ],
        "dueDate": "2026-08-04T09:00:00Z",
    }

    result = validate_grounding(output, resolved_context)

    assert result.valid is True
    assert result.issues == ()
    assert result.output == output
    assert result.output is not output
    assert result.output["people"] is not output["people"]


def test_unresolved_user_names_and_dates_are_warnings(
    resolved_context: ResolvedContext,
) -> None:
    output = {
        "ownerName": "Made Up Person",
        "whoDecided": "Unknown Decider",
        "meetingDate": "2027-01-01",
    }

    result = validate_grounding(output, resolved_context)

    assert result.output == output
    assert result.valid is True
    assert [issue.model_dump() for issue in result.issues] == [
        {
            "kind": "user",
            "path": "$.ownerName",
            "value": "Made Up Person",
            "severity": "warning",
            "action": "flagged",
            "reason": "not-in-resolved-context",
        },
        {
            "kind": "user",
            "path": "$.whoDecided",
            "value": "Unknown Decider",
            "severity": "warning",
            "action": "flagged",
            "reason": "not-in-resolved-context",
        },
        {
            "kind": "date",
            "path": "$.meetingDate",
            "value": "2027-01-01",
            "severity": "warning",
            "action": "flagged",
            "reason": "not-in-resolved-context",
        },
    ]


def test_strip_mode_only_removes_high_severity_entity_values(
    resolved_context: ResolvedContext,
) -> None:
    output: dict[str, Any] = {
        "assigneeId": "user-invented",
        "assigneeName": "Made Up Person",
        "projectTitle": "Invented Tower",
        "projectIds": ["project-saillen", "project-invented"],
        "phase": "INVENTED",
        "dueDate": "2027-01-01",
    }
    original = deepcopy(output)

    result = validate_grounding(output, resolved_context, mode="strip")

    assert output == original
    assert result.output == {
        "assigneeId": None,
        "assigneeName": "Made Up Person",
        "projectTitle": None,
        "projectIds": ["project-saillen"],
        "phase": None,
        "dueDate": "2027-01-01",
    }
    assert result.valid is False
    by_path = {issue.path: issue for issue in result.issues}
    assert by_path["$.assigneeId"].action == "stripped"
    assert by_path["$.assigneeName"].severity == "warning"
    assert by_path["$.assigneeName"].action == "flagged"
    assert by_path["$.projectTitle"].action == "stripped"
    assert by_path["$.projectIds[1]"].action == "stripped"
    assert by_path["$.phase"].action == "stripped"
    assert by_path["$.dueDate"].severity == "warning"


def test_unknown_dbs_code_in_prose_is_flagged_but_never_stripped(
    resolved_context: ResolvedContext,
) -> None:
    output = {
        "summary": "Compare DBS-2025-001 with DBS-2099-999 before issuing the note."
    }

    result = validate_grounding(output, resolved_context, mode="strip")

    assert result.output == output
    assert result.valid is False
    assert [issue.model_dump() for issue in result.issues] == [
        {
            "kind": "project",
            "path": "$.summary",
            "value": "DBS-2099-999",
            "severity": "error",
            "action": "flagged",
            "reason": "not-in-resolved-context",
        }
    ]


def test_dbsarc_email_is_not_treated_as_a_project_code(
    resolved_context: ResolvedContext,
) -> None:
    result = validate_grounding(
        {"summary": "Contact giulio.sovran@dbsarc.com about the review."},
        resolved_context,
    )

    assert result.issues == ()


def test_table_columns_are_validated_without_rewriting_cells(
    resolved_context: ResolvedContext,
) -> None:
    output = {
        "type": "table",
        "columns": ["Project code", "Owner", "Deadline"],
        "rows": [
            ["DBS-2025-001", "Giulio", "2026-08-04"],
            ["DBS-2099-999", "Unknown Person", "2027-01-01"],
        ],
    }

    result = validate_grounding(output, resolved_context, mode="strip")

    assert result.output == output
    assert [(issue.path, issue.severity, issue.action) for issue in result.issues] == [
        ("$.rows[1][0]", "error", "flagged"),
        ("$.rows[1][1]", "warning", "flagged"),
        ("$.rows[1][2]", "warning", "flagged"),
    ]
    assert result.valid is False


def test_rejects_invalid_validation_mode(resolved_context: ResolvedContext) -> None:
    with pytest.raises(ValueError, match="mode must be"):
        validate_grounding({}, resolved_context, mode="delete")  # type: ignore[arg-type]


def test_rejects_known_mentions_omitted_from_entity_citations(
    resolved_context: ResolvedContext,
) -> None:
    result = validate_grounding(
        {
            "answer": "Giulio Sovran is reviewing Le Saillen.",
            "userIds": [],
            "projectIds": [],
            "phases": [],
            "dates": [],
        },
        resolved_context,
    )

    assert result.valid is False
    assert [
        (issue.kind, issue.value, issue.reason) for issue in result.issues
    ] == [
        ("user", "user-giulio", "missing-entity-citation"),
        ("project", "project-saillen", "missing-entity-citation"),
    ]


def test_rejects_known_phase_and_date_mentions_omitted_from_citations(
    resolved_context: ResolvedContext,
) -> None:
    result = validate_grounding(
        {
            "answer": "ETUDE / AP is due tomorrow (2026-08-04T09:00:00Z).",
            "userIds": [],
            "projectIds": [],
            "phases": [],
            "dates": [],
        },
        resolved_context,
    )

    assert result.valid is False
    assert [
        (issue.kind, issue.value, issue.reason) for issue in result.issues
    ] == [
        ("phase", "ETUDE/AP", "missing-entity-citation"),
        ("date", "2026-08-04", "missing-entity-citation"),
    ]


def test_accepts_canonical_phase_and_date_citations(
    resolved_context: ResolvedContext,
) -> None:
    result = validate_grounding(
        {
            "answer": "ETUDE / AP is due tomorrow (2026-08-04).",
            "userIds": [],
            "projectIds": [],
            "phases": ["ETUDE/AP"],
            "dates": ["2026-08-04"],
        },
        resolved_context,
    )

    assert result.valid is True
    assert result.issues == ()


def test_rejects_inconsistent_fields_within_structured_entities(
    resolved_context: ResolvedContext,
) -> None:
    context = resolved_context.model_copy(
        update={
            "projects": (
                *resolved_context.projects,
                ResolvedProject(
                    id="project-solaris",
                    code="DBS-2015-048",
                    title="Solaris",
                    phase="TERMINATO",
                    client=None,
                    commune="Sion",
                    aliases=("DBS-2015-048", "Solaris"),
                ),
            )
        }
    )
    result = validate_grounding(
        {
            "people": [{"userId": "user-giulio", "name": "Luigi"}],
            "action_items": [
                {"owner_user_id": "user-giulio", "owner_name": "Luigi"}
            ],
            "projects": [
                {"projectId": "project-saillen", "title": "Solaris"}
            ],
        },
        context,
    )

    assert result.valid is False
    assert [
        (issue.kind, issue.path, issue.reason) for issue in result.issues
    ] == [
        ("user", "$.people[0].name", "inconsistent-entity-reference"),
        (
            "user",
            "$.action_items[0].owner_name",
            "inconsistent-entity-reference",
        ),
        ("project", "$.projects[0].title", "inconsistent-entity-reference"),
    ]


def test_flags_unknown_dates_in_prose(resolved_context: ResolvedContext) -> None:
    result = validate_grounding(
        {"summary": "The review is planned for 2027-01-01."},
        resolved_context,
    )

    assert result.valid is True
    assert [(issue.kind, issue.value, issue.severity) for issue in result.issues] == [
        ("date", "2027-01-01", "warning")
    ]


def test_flags_unknown_natural_entities_in_prose(
    resolved_context: ResolvedContext,
) -> None:
    result = validate_grounding(
        {"summary": "John Smith proposed the Alpine Tower option."},
        resolved_context,
    )

    assert result.valid is True
    assert [(issue.kind, issue.value, issue.severity) for issue in result.issues] == [
        ("entity", "John Smith", "warning"),
        ("entity", "Alpine Tower", "warning"),
    ]
