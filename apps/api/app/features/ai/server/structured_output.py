from __future__ import annotations

from typing import Literal

from app.platform.ai.grounding import GroundingModel, ResolvedContext
from app.platform.ai.provider import ProviderFailure, parse_structured_output
from app.platform.ai.validation import GroundingValidationIssue, validate_grounding


class GroundedAssistantOutput(GroundingModel):
    """Schema-bound final response shared by the Python AI surfaces."""

    answer: str
    user_ids: tuple[str, ...]
    project_ids: tuple[str, ...]
    phases: tuple[str, ...]
    dates: tuple[str, ...]


class RouteDecision(GroundingModel):
    next: Literal[
        "project_manager",
        "scheduler",
        "regulations_expert",
        "data_analyst",
    ]


def output_schema() -> dict[str, object]:
    return GroundedAssistantOutput.model_json_schema(by_alias=True)


def route_schema() -> dict[str, object]:
    return RouteDecision.model_json_schema(by_alias=True)


def parse_grounded_output(raw: object) -> GroundedAssistantOutput:
    return parse_structured_output(raw, GroundedAssistantOutput.model_validate)


def validate_grounded_output(
    output: GroundedAssistantOutput,
    resolved: ResolvedContext,
) -> tuple[GroundedAssistantOutput, tuple[GroundingValidationIssue, ...]]:
    validation = validate_grounding(
        output.model_dump(mode="json", by_alias=True),
        resolved,
        mode="strip",
    )
    if not validation.valid:
        raise ProviderFailure("invalid_output")
    return GroundedAssistantOutput.model_validate(validation.output), validation.issues


STRUCTURED_RESPONSE_INSTRUCTION = """Return the final answer as one JSON object with exactly:
- answer: the user-facing Markdown answer
- userIds: IDs from the resolved context for every user referenced in the answer
- projectIds: IDs from the resolved context for every project referenced in the answer
- phases: canonical phase values from the resolved context used in the answer
- dates: ISO dates from the resolved context used in the answer
Use empty arrays when a category is not referenced. Never invent an ID or entity."""
