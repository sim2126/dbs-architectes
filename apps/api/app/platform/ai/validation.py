from __future__ import annotations

import re
import unicodedata
from dataclasses import dataclass
from typing import Any, Literal, cast

from app.platform.ai.grounding import GroundingModel, ResolvedContext

GroundingIssueKind = Literal["user", "project", "phase", "date"]
GroundingIssueSeverity = Literal["warning", "error"]
GroundingIssueAction = Literal["flagged", "stripped"]
GroundingValidationMode = Literal["flag", "strip"]

class GroundingValidationIssue(GroundingModel):
    kind: GroundingIssueKind
    path: str
    value: str
    severity: GroundingIssueSeverity
    action: GroundingIssueAction
    reason: Literal["not-in-resolved-context"] = "not-in-resolved-context"


class GroundingValidationResult[OutputT](GroundingModel):
    output: OutputT
    issues: tuple[GroundingValidationIssue, ...]
    valid: bool


@dataclass(frozen=True, slots=True)
class _AllowedGroundingValues:
    users: frozenset[str]
    projects: frozenset[str]
    project_codes: frozenset[str]
    phases: frozenset[str]
    dates: frozenset[str]
    iso_dates: frozenset[str]
    explicitly_unresolved: frozenset[str]


_STRIPPED = object()
_DBS_PROJECT_CODE = re.compile(
    r"\bDBS-?\d[A-Z0-9]*(?:-[A-Z0-9]+)*\b", re.IGNORECASE
)
_USER_COLLECTIONS = (
    ".users[",
    ".people[",
    ".participants[",
    ".attendees[",
    ".team[",
    ".members[",
    ".attendance.",
)
_PROJECT_COLLECTIONS = (".projects[", ".project.")


def _normalise(value: str) -> str:
    decomposed = unicodedata.normalize("NFKD", value)
    without_marks = "".join(
        character for character in decomposed if not unicodedata.combining(character)
    )
    return " ".join(re.sub(r"[^a-z0-9]+", " ", without_marks.casefold()).split())


def _build_allowed_values(context: ResolvedContext) -> _AllowedGroundingValues:
    users = {
        _normalise(value)
        for user in context.users
        for value in (user.id, user.name, user.email, *user.aliases)
        if value.strip()
    }
    projects = {
        _normalise(value)
        for project in context.projects
        for value in (project.id, project.code, project.title, *project.aliases)
        if value.strip()
    }
    projects.update(
        _normalise(decision.project_id)
        for decision in context.recent_meeting_decisions
        if decision.project_id.strip()
    )
    project_codes = {
        _normalise(project.code) for project in context.projects if project.code.strip()
    }
    phases = {
        _normalise(value)
        for value in (
            *(phase.value for phase in context.phases),
            *(project.phase for project in context.projects),
        )
        if value.strip()
    }
    date_values = {
        value
        for resolved_date in context.dates
        for value in (resolved_date.source, resolved_date.iso_date)
        if value.strip()
    }
    date_values.update(
        decision.decided_at
        for decision in context.recent_meeting_decisions
        if decision.decided_at and decision.decided_at.strip()
    )
    iso_dates = {
        canonical
        for value in date_values
        if (canonical := _canonical_date(value)) is not None
    }
    return _AllowedGroundingValues(
        users=frozenset(users),
        projects=frozenset(projects),
        project_codes=frozenset(project_codes),
        phases=frozenset(phases),
        dates=frozenset(_normalise(value) for value in date_values),
        iso_dates=frozenset(iso_dates),
        explicitly_unresolved=frozenset(
            _normalise(miss.reference) for miss in context.unresolved
        ),
    )


def _compact_key(key: str) -> str:
    return re.sub(r"[^a-z0-9]", "", key.casefold())


def _path_contains_any(path: str, segments: tuple[str, ...]) -> bool:
    lowered = path.casefold()
    return any(segment in lowered for segment in segments)


def _infer_kind(key: str, path: str) -> GroundingIssueKind | None:
    compact = _compact_key(key)
    if "phase" in compact:
        return "phase"
    if (
        "date" in compact
        or "deadline" in compact
        or compact in {
            "sincewhen",
            "timestamp",
            "dueat",
            "startat",
            "endat",
            "scheduledat",
            "decidedat",
        }
        or compact.endswith("timestamp")
    ):
        return "date"
    if (
        any(
            token in compact
            for token in ("projectid", "projectcode", "projecttitle", "projectname")
        )
        or compact in {"projectlink", "project"}
    ):
        return "project"
    if (
        "userid" in compact
        or compact.endswith(
            (
                "assigneeid",
                "ownerid",
                "attendeeid",
                "participantid",
                "memberid",
                "personid",
                "speakerid",
                "authorid",
                "reviewerid",
            )
        )
        or compact
        in {
            "owner",
            "ownername",
            "assignee",
            "assigneename",
            "assignedto",
            "username",
            "attendee",
            "participant",
            "membername",
            "personname",
            "author",
            "authorname",
            "reviewer",
            "reviewername",
            "whodecided",
            "speaker",
            "askedby",
            "directedto",
            "present",
            "absent",
            "leftearly",
            "participants",
            "teaminitials",
        }
    ):
        return "user"
    if compact in {"id", "name", "email", "initials"} and _path_contains_any(
        path, _USER_COLLECTIONS
    ):
        return "user"
    if compact in {"id", "code", "title", "name"} and _path_contains_any(
        path, _PROJECT_COLLECTIONS
    ):
        return "project"
    return None


def _is_id_or_code_field(key: str) -> bool:
    compact = _compact_key(key)
    return (
        compact.endswith(("id", "ids"))
        or "code" in compact
        or compact in {"projectlink", "project"}
    )


def _split_user_values(value: str) -> list[str]:
    return [
        item
        for item in re.split(r"\s*(?:,|;|&|\+|\band\b)\s*", value, flags=re.IGNORECASE)
        if item
    ]


def _canonical_date(value: str) -> str | None:
    if match := re.match(r"^(\d{4})-(\d{2})-(\d{2})(?:$|[T\s])", value.strip()):
        return "-".join(match.groups())
    if match := re.fullmatch(r"(\d{1,2})[/.](\d{1,2})[/.](\d{4})", value.strip()):
        day, month, year = match.groups()
        return f"{year}-{int(month):02d}-{int(day):02d}"
    return None


def _value_is_allowed(
    kind: GroundingIssueKind,
    value: str,
    allowed: _AllowedGroundingValues,
) -> bool:
    normalised = _normalise(value)
    if not normalised or normalised in allowed.explicitly_unresolved:
        return False
    if kind == "user":
        parts = _split_user_values(value)
        return bool(parts) and all(_normalise(part) in allowed.users for part in parts)
    if kind == "project":
        return normalised in allowed.projects
    if kind == "phase":
        return normalised in allowed.phases
    if normalised in allowed.dates:
        return True
    if (canonical := _canonical_date(value)) is not None:
        return canonical in allowed.iso_dates
    return any(normalised.startswith(f"{resolved_date} ") for resolved_date in allowed.dates)


def _issue_severity(
    kind: GroundingIssueKind,
    key: str,
) -> GroundingIssueSeverity:
    if kind == "date":
        return "warning"
    if kind == "user" and not _is_id_or_code_field(key):
        return "warning"
    return "error"


def _append_issue(
    issues: list[GroundingValidationIssue],
    *,
    kind: GroundingIssueKind,
    path: str,
    value: str,
    severity: GroundingIssueSeverity,
    action: GroundingIssueAction,
) -> None:
    normalised = _normalise(value)
    if any(
        issue.kind == kind
        and issue.path == path
        and _normalise(issue.value) == normalised
        for issue in issues
    ):
        return
    issues.append(
        GroundingValidationIssue(
            kind=kind,
            path=path,
            value=value,
            severity=severity,
            action=action,
        )
    )


def _flag_value(
    issues: list[GroundingValidationIssue],
    *,
    mode: GroundingValidationMode,
    kind: GroundingIssueKind,
    key: str,
    path: str,
    value: str,
    can_strip: bool,
) -> object | str:
    severity = _issue_severity(kind, key)
    should_strip = mode == "strip" and severity == "error" and can_strip
    _append_issue(
        issues,
        kind=kind,
        path=path,
        value=value,
        severity=severity,
        action="stripped" if should_strip else "flagged",
    )
    return _STRIPPED if should_strip else value


def _scan_unknown_project_codes(
    value: str,
    path: str,
    allowed: _AllowedGroundingValues,
    issues: list[GroundingValidationIssue],
) -> None:
    for match in _DBS_PROJECT_CODE.finditer(value):
        code = match.group(0)
        if _normalise(code) in allowed.project_codes:
            continue
        _append_issue(
            issues,
            kind="project",
            path=path,
            value=code,
            severity="error",
            action="flagged",
        )


def _validate_table(
    value: dict[str, Any],
    path: str,
    allowed: _AllowedGroundingValues,
    issues: list[GroundingValidationIssue],
) -> None:
    columns = value.get("columns")
    rows = value.get("rows")
    if value.get("type") != "table" or not isinstance(columns, list) or not isinstance(rows, list):
        return
    column_names = [str(column) for column in columns]
    for row_index, row in enumerate(rows):
        if not isinstance(row, list):
            continue
        for column_index, cell in enumerate(row):
            if not isinstance(cell, str):
                continue
            column = column_names[column_index] if column_index < len(column_names) else ""
            kind = _infer_kind(column, f"table.{_normalise(column)}")
            if kind is None or _value_is_allowed(kind, cell, allowed):
                continue
            _flag_value(
                issues,
                mode="flag",
                kind=kind,
                key=column,
                path=f"{path}.rows[{row_index}][{column_index}]",
                value=cell,
                can_strip=False,
            )


def _walk(
    value: Any,
    *,
    key: str,
    path: str,
    allowed: _AllowedGroundingValues,
    issues: list[GroundingValidationIssue],
    mode: GroundingValidationMode,
) -> Any:
    if isinstance(value, str):
        kind = _infer_kind(key, path)
        if kind is not None and not _value_is_allowed(kind, value, allowed):
            return _flag_value(
                issues,
                mode=mode,
                kind=kind,
                key=key,
                path=path,
                value=value,
                can_strip=True,
            )
        _scan_unknown_project_codes(value, path, allowed, issues)
        return value

    if isinstance(value, list):
        kind = _infer_kind(key, path)
        validated_items: list[Any] = []
        for index, item in enumerate(value):
            item_path = f"{path}[{index}]"
            if isinstance(item, str) and kind is not None and not _value_is_allowed(
                kind, item, allowed
            ):
                validated = _flag_value(
                    issues,
                    mode=mode,
                    kind=kind,
                    key=key,
                    path=item_path,
                    value=item,
                    can_strip=True,
                )
            else:
                validated = _walk(
                    item,
                    key=key,
                    path=item_path,
                    allowed=allowed,
                    issues=issues,
                    mode=mode,
                )
            if validated is not _STRIPPED:
                validated_items.append(validated)
        return validated_items

    if isinstance(value, dict):
        _validate_table(value, path, allowed, issues)
        validated_record: dict[Any, Any] = {}
        for child_key, child in value.items():
            string_key = str(child_key)
            child_path = f"{path}.{string_key}" if path else string_key
            validated = _walk(
                child,
                key=string_key,
                path=child_path,
                allowed=allowed,
                issues=issues,
                mode=mode,
            )
            validated_record[child_key] = None if validated is _STRIPPED else validated
        return validated_record

    return value


def validate_grounding[OutputT](
    output: OutputT,
    resolved: ResolvedContext,
    *,
    mode: GroundingValidationMode = "flag",
) -> GroundingValidationResult[OutputT]:
    """Validate structured provider output without mutating the provider value."""

    if mode not in {"flag", "strip"}:
        raise ValueError("mode must be 'flag' or 'strip'")
    issues: list[GroundingValidationIssue] = []
    validated = _walk(
        output,
        key="",
        path="$",
        allowed=_build_allowed_values(resolved),
        issues=issues,
        mode=mode,
    )
    return GroundingValidationResult[OutputT](
        output=cast(OutputT, validated),
        issues=tuple(issues),
        valid=not any(issue.severity == "error" for issue in issues),
    )
