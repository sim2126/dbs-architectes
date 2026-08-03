from __future__ import annotations

import re

from app.platform.ai.grounding import (
    CANONICAL_PHASES,
    AiSurface,
    GroundingContract,
    GroundingSubject,
    MentionDateResolutionNeed,
    MentionEntityResolutionNeed,
    NoMeetingDecisionNeed,
    RecentMeetingDecisionNeed,
    ValuePhaseResolutionNeed,
    WorkspaceEntityResolutionNeed,
)

_PROJECT_HEALTH_SIGNALS = (
    "portfolio health",
    "portfolio statistics",
    "portfolio summary",
    "breakdown by phase",
    "how many projects",
    "percentage of",
    "project statistics",
    "project health",
    "health overview",
    "health report",
    "health summary",
    "at-risk projects",
    "at risk projects",
    "blocked projects",
    "stuck projects",
)


def surface_for_portfolio_request(input_value: str, default: AiSurface) -> AiSurface:
    normalised = re.sub(r"\s+", " ", input_value.casefold()).strip()
    if any(signal in normalised for signal in _PROJECT_HEALTH_SIGNALS):
        return "project-health"
    return default


def build_dbs_gpt_grounding_contract(
    *,
    message: str,
    user_id: str,
    user_role: str,
    project_id: str | None,
) -> GroundingContract:
    return GroundingContract(
        surface=surface_for_portfolio_request(message, "dbs-gpt"),
        subject=GroundingSubject(user_id=user_id, role=user_role),
        input=message,
        users=WorkspaceEntityResolutionNeed(),
        projects=WorkspaceEntityResolutionNeed(),
        phases=ValuePhaseResolutionNeed(values=CANONICAL_PHASES),
        dates=MentionDateResolutionNeed(),
        recent_meeting_decisions=RecentMeetingDecisionNeed(
            project_ids=(project_id,) if project_id else None,
            limit=10,
        ),
    )


def build_chat_agent_grounding_contract(
    *,
    message: str,
    user_id: str,
    user_role: str,
) -> GroundingContract:
    return GroundingContract(
        surface=surface_for_portfolio_request(message, "chat-agent"),
        subject=GroundingSubject(user_id=user_id, role=user_role),
        input=message,
        users=WorkspaceEntityResolutionNeed(),
        projects=WorkspaceEntityResolutionNeed(),
        phases=ValuePhaseResolutionNeed(values=CANONICAL_PHASES),
        dates=MentionDateResolutionNeed(),
        recent_meeting_decisions=RecentMeetingDecisionNeed(
            project_ids=None,
            limit=10,
        ),
    )


def build_chat_title_grounding_contract(
    *,
    message: str,
    user_id: str,
    user_role: str,
) -> GroundingContract:
    contract = build_chat_agent_grounding_contract(
        message=message,
        user_id=user_id,
        user_role=user_role,
    )
    return contract.model_copy(
        update={
            "users": MentionEntityResolutionNeed(),
            "projects": MentionEntityResolutionNeed(),
            "recent_meeting_decisions": NoMeetingDecisionNeed(),
        }
    )
