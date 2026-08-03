from __future__ import annotations

import re
import unicodedata
from dataclasses import dataclass
from typing import Any, Literal, cast

from app.platform.ai.grounding import GroundingModel, ResolvedContext

GroundingIssueKind = Literal["user", "project", "phase", "date", "entity"]
GroundingIssueSeverity = Literal["warning", "error"]
GroundingIssueAction = Literal["flagged", "stripped"]
GroundingValidationMode = Literal["flag", "strip"]

class GroundingValidationIssue(GroundingModel):
    kind: GroundingIssueKind
    path: str
    value: str
    severity: GroundingIssueSeverity
    action: GroundingIssueAction
    reason: Literal[
        "not-in-resolved-context",
        "missing-entity-citation",
        "inconsistent-entity-reference",
    ] = "not-in-resolved-context"


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
    user_alias_ids: dict[str, frozenset[str]]
    project_alias_ids: dict[str, frozenset[str]]
    phase_alias_values: dict[str, frozenset[str]]
    date_alias_values: dict[str, frozenset[str]]


_STRIPPED = object()
_DBS_PROJECT_CODE = re.compile(
    r"\bDBS-?\d[A-Z0-9]*(?:-[A-Z0-9]+)*\b", re.IGNORECASE
)
_NATURAL_ENTITY = re.compile(
    r"[A-ZÀ-ÖØ-Þ][A-Za-zÀ-ÖØ-öø-ÿ'’.-]+"
    r"(?:\s+[A-ZÀ-ÖØ-Þ][A-Za-zÀ-ÖØ-öø-ÿ'’.-]+){1,3}"
)
_NATURAL_ENTITY_ALLOWLIST = frozenset(
    {"ai assistant", "dbs architectes", "dbs gpt", "openai", "read ai"}
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
    user_alias_ids: dict[str, set[str]] = {}
    for user in context.users:
        for value in (user.id, user.name, user.email, *user.aliases):
            alias = _normalise(value)
            if alias:
                user_alias_ids.setdefault(alias, set()).add(user.id)
    project_alias_ids: dict[str, set[str]] = {}
    for project in context.projects:
        for value in (project.id, project.code, project.title, *project.aliases):
            alias = _normalise(value)
            if alias:
                project_alias_ids.setdefault(alias, set()).add(project.id)
    for decision in context.recent_meeting_decisions:
        alias = _normalise(decision.project_id)
        if alias:
            project_alias_ids.setdefault(alias, set()).add(decision.project_id)
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
    phase_alias_values: dict[str, set[str]] = {}
    for phase in context.phases:
        for value in (phase.value, *phase.aliases):
            alias = _normalise(value)
            if alias:
                phase_alias_values.setdefault(alias, set()).add(phase.value)
    for project in context.projects:
        alias = _normalise(project.phase)
        if alias:
            phase_alias_values.setdefault(alias, set()).add(project.phase)
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
    date_alias_values: dict[str, set[str]] = {}
    for resolved_date in context.dates:
        for value in (resolved_date.source, resolved_date.iso_date):
            alias = _normalise(value)
            if alias:
                date_alias_values.setdefault(alias, set()).add(resolved_date.iso_date)
    for decision in context.recent_meeting_decisions:
        if not decision.decided_at:
            continue
        canonical = _canonical_date(decision.decided_at)
        if canonical is None:
            continue
        for value in (decision.decided_at, canonical):
            alias = _normalise(value)
            if alias:
                date_alias_values.setdefault(alias, set()).add(canonical)
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
        user_alias_ids={
            alias: frozenset(ids) for alias, ids in user_alias_ids.items()
        },
        project_alias_ids={
            alias: frozenset(ids) for alias, ids in project_alias_ids.items()
        },
        phase_alias_values={
            alias: frozenset(values) for alias, values in phase_alias_values.items()
        },
        date_alias_values={
            alias: frozenset(values) for alias, values in date_alias_values.items()
        },
    )


def _reference_array(
    value: dict[Any, Any], keys: tuple[str, ...]
) -> tuple[str, list[str]] | None:
    for key in keys:
        candidate = value.get(key)
        if isinstance(candidate, list) and all(isinstance(item, str) for item in candidate):
            return key, candidate
    return None


def _collect_output_text(value: Any, key: str = "") -> list[str]:
    if _compact_key(key) in {"userids", "projectids", "phases", "dates"}:
        return []
    if isinstance(value, str):
        return [value]
    if isinstance(value, list):
        return [text for item in value for text in _collect_output_text(item, key)]
    if isinstance(value, dict):
        return [
            text
            for child_key, child in value.items()
            for text in _collect_output_text(child, str(child_key))
        ]
    return []


def _mentioned_entity_ids(
    output_text: str,
    aliases: dict[str, frozenset[str]],
) -> set[str]:
    normalised_text = f" {_normalise(output_text)} "
    mentioned: set[str] = set()
    for alias, ids in aliases.items():
        if len(alias) < 3 or len(ids) != 1 or f" {alias} " not in normalised_text:
            continue
        mentioned.add(next(iter(ids)))
    return mentioned


def _mentioned_grounding_values(
    output_text: str,
    aliases: dict[str, frozenset[str]],
) -> set[str]:
    normalised_text = f" {_normalise(output_text)} "
    mentioned: set[str] = set()
    for alias, values in aliases.items():
        if not alias or len(values) != 1 or f" {alias} " not in normalised_text:
            continue
        mentioned.add(next(iter(values)))
    return mentioned


def _cited_grounding_values(
    references: list[str],
    aliases: dict[str, frozenset[str]],
    *,
    canonicalise_dates: bool = False,
) -> set[str]:
    cited: set[str] = set()
    for reference in references:
        values = aliases.get(_normalise(reference), frozenset())
        if not values and canonicalise_dates:
            canonical = _canonical_date(reference)
            values = aliases.get(_normalise(canonical or ""), frozenset())
        if len(values) == 1:
            cited.add(next(iter(values)))
    return cited


def _mentioned_date_values(
    output_text: str,
    aliases: dict[str, frozenset[str]],
) -> set[str]:
    mentioned = _mentioned_grounding_values(output_text, aliases)
    references = [
        *re.findall(r"\b\d{4}-\d{2}-\d{2}\b", output_text),
        *re.findall(r"\b\d{1,2}[/.]\d{1,2}[/.]\d{4}\b", output_text),
    ]
    for reference in references:
        values = aliases.get(_normalise(reference), frozenset())
        if len(values) == 1:
            mentioned.add(next(iter(values)))
    return mentioned


def _validate_entity_citations(
    value: dict[Any, Any],
    path: str,
    allowed: _AllowedGroundingValues,
    issues: list[GroundingValidationIssue],
) -> None:
    user_references = _reference_array(value, ("userIds", "user_ids"))
    project_references = _reference_array(value, ("projectIds", "project_ids"))
    phase_references = _reference_array(value, ("phases",))
    date_references = _reference_array(value, ("dates",))
    if all(
        reference is None
        for reference in (
            user_references,
            project_references,
            phase_references,
            date_references,
        )
    ):
        return

    output_text = " ".join(_collect_output_text(value))
    missing: list[tuple[GroundingIssueKind, str, str]] = []
    if user_references is not None:
        missing.extend(
            (
                "user",
                user_references[0],
                entity_id,
            )
            for entity_id in _mentioned_entity_ids(output_text, allowed.user_alias_ids)
            if entity_id not in set(user_references[1])
        )
    if project_references is not None:
        missing.extend(
            (
                "project",
                project_references[0],
                entity_id,
            )
            for entity_id in _mentioned_entity_ids(output_text, allowed.project_alias_ids)
            if entity_id not in set(project_references[1])
        )
    if phase_references is not None:
        cited_phases = _cited_grounding_values(
            phase_references[1], allowed.phase_alias_values
        )
        missing.extend(
            ("phase", phase_references[0], phase)
            for phase in _mentioned_grounding_values(
                output_text, allowed.phase_alias_values
            )
            if phase not in cited_phases
        )
    if date_references is not None:
        cited_dates = _cited_grounding_values(
            date_references[1],
            allowed.date_alias_values,
            canonicalise_dates=True,
        )
        missing.extend(
            ("date", date_references[0], date_value)
            for date_value in _mentioned_date_values(
                output_text, allowed.date_alias_values
            )
            if date_value not in cited_dates
        )
    for kind, key, entity_id in missing:
        issues.append(
            GroundingValidationIssue(
                kind=kind,
                path=f"{path}.{key}",
                value=entity_id,
                severity="error",
                action="flagged",
                reason="missing-entity-citation",
            )
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


_USER_RELATION_PREFIXES = (
    "user",
    "owner",
    "assignee",
    "attendee",
    "participant",
    "member",
    "person",
    "speaker",
    "author",
    "reviewer",
    "whodecided",
)
_PROJECT_RELATION_PREFIXES = ("project",)
_RELATION_SUFFIXES = (
    "",
    "id",
    "userid",
    "name",
    "email",
    "initials",
    "code",
    "title",
)


def _relationship_group(
    key: str,
    path: str,
    kind: GroundingIssueKind,
) -> str | None:
    compact = _compact_key(key)
    if kind == "user":
        if _path_contains_any(path, _USER_COLLECTIONS) and compact in {
            "id",
            "userid",
            "name",
            "username",
            "email",
            "initials",
        }:
            return "user:collection"
        for prefix in _USER_RELATION_PREFIXES:
            if compact in {f"{prefix}{suffix}" for suffix in _RELATION_SUFFIXES}:
                return f"user:{prefix}"
    if kind == "project":
        if _path_contains_any(path, _PROJECT_COLLECTIONS) and compact in {
            "id",
            "projectid",
            "code",
            "projectcode",
            "title",
            "projecttitle",
            "name",
            "projectname",
        }:
            return "project:collection"
        for prefix in _PROJECT_RELATION_PREFIXES:
            if compact in {f"{prefix}{suffix}" for suffix in _RELATION_SUFFIXES}:
                return f"project:{prefix}"
    return None


def _validate_structured_entity_relationships(
    value: dict[Any, Any],
    path: str,
    allowed: _AllowedGroundingValues,
    issues: list[GroundingValidationIssue],
) -> None:
    candidates: dict[str, list[tuple[str, str, frozenset[str], GroundingIssueKind]]] = {}
    for key, item in value.items():
        if not isinstance(item, str):
            continue
        string_key = str(key)
        child_path = f"{path}.{string_key}"
        kind = _infer_kind(string_key, child_path)
        if kind not in {"user", "project"}:
            continue
        group = _relationship_group(string_key, child_path, kind)
        if group is None:
            continue
        aliases = allowed.user_alias_ids if kind == "user" else allowed.project_alias_ids
        entity_ids = aliases.get(_normalise(item), frozenset())
        if not entity_ids:
            continue
        candidates.setdefault(group, []).append((child_path, item, entity_ids, kind))

    for related_values in candidates.values():
        if len(related_values) < 2:
            continue
        compatible_ids = set(related_values[0][2])
        for child_path, item, entity_ids, kind in related_values[1:]:
            overlap = compatible_ids.intersection(entity_ids)
            if overlap:
                compatible_ids = overlap
                continue
            issues.append(
                GroundingValidationIssue(
                    kind=kind,
                    path=child_path,
                    value=item,
                    severity="error",
                    action="flagged",
                    reason="inconsistent-entity-reference",
                )
            )


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
        return bool(parts) and all(
            len(allowed.user_alias_ids.get(_normalise(part), frozenset())) == 1
            for part in parts
        )
    if kind == "project":
        return len(allowed.project_alias_ids.get(normalised, frozenset())) == 1
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


def _scan_unknown_dates(
    value: str,
    path: str,
    allowed: _AllowedGroundingValues,
    issues: list[GroundingValidationIssue],
) -> None:
    references = [
        *re.findall(r"\b\d{4}-\d{2}-\d{2}\b", value),
        *re.findall(r"\b\d{1,2}[/.]\d{1,2}[/.]\d{4}\b", value),
    ]
    for reference in dict.fromkeys(references):
        if _value_is_allowed("date", reference, allowed):
            continue
        _append_issue(
            issues,
            kind="date",
            path=path,
            value=reference,
            severity="warning",
            action="flagged",
        )


def _scan_unknown_natural_entities(
    value: str,
    path: str,
    allowed: _AllowedGroundingValues,
    issues: list[GroundingValidationIssue],
) -> None:
    if ".rows[" in path:
        return
    for candidate in dict.fromkeys(_NATURAL_ENTITY.findall(value)):
        reference = _normalise(candidate)
        if (
            _DBS_PROJECT_CODE.search(candidate)
            or re.search(r"\b(?:DBS|AI|GPT)\b", candidate)
            or re.search(r"\d{4}-\d{2}-\d{2}", candidate)
            or reference in _NATURAL_ENTITY_ALLOWLIST
            or reference in allowed.users
            or reference in allowed.projects
            or reference in allowed.phases
        ):
            continue
        _append_issue(
            issues,
            kind="entity",
            path=path,
            value=candidate,
            severity="warning",
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
        _scan_unknown_dates(value, path, allowed, issues)
        if kind is None:
            _scan_unknown_natural_entities(value, path, allowed, issues)
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
        _validate_structured_entity_relationships(value, path, allowed, issues)
        if path == "$":
            _validate_entity_citations(value, path, allowed, issues)
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
