"""Schema-bound chat title generation for Aria conversations."""

from __future__ import annotations

import structlog
from openai import AsyncOpenAI

from app.features.ai.server.grounding_contracts import build_chat_title_grounding_contract
from app.platform.ai.grounding import GroundingModel, resolve_grounding
from app.platform.ai.provider import (
    ProviderFailure,
    classify_provider_error,
    create_openai_structured_completion,
    parse_structured_output,
)
from app.platform.ai.validation import validate_grounding

logger = structlog.get_logger(__name__)


class GroundedChatTitle(GroundingModel):
    title: str
    user_ids: tuple[str, ...]
    project_ids: tuple[str, ...]


_TITLE_PROMPT = """You are a chat thread titling assistant.
Goal: Produce a very short, descriptive title (2-4 words) that names the topic of the user's first message.

Rules:
- Always write the title in English as a noun phrase, not an instruction.
- Do not use prefixes, labels, quotes, emojis, hashtags, or trailing punctuation.
- Never output just a pronoun (me/you/I/we/us/myself/yourself).
- Never include meta-words: Summarize, Summary, Title, Prompt, Topic, Subject, About, Question, Request, Chat.
- Maximum 5 words.
- Set userIds and projectIds to resolved-context IDs for entities named in the title.
- Never invent an ID. Use an empty array when no entity is named.

Examples:
User: "Which projects are stuck?" -> Stuck projects overview
User: "Show team workload" -> Team workload analysis
User: "What deadlines are coming up?" -> Upcoming deadlines
User: "Portfolio health overview" -> Portfolio health

Resolved context:
{resolved_context}

User message:
{user_message}
"""


async def generate_chat_title(
    user_message: str,
    *,
    model: str = "gpt-4o-mini",
    fallback: str = "New chat",
    user_id: str = "anonymous",
    user_role: str = "viewer",
) -> str:
    """Generate and validate a short title; provider errors propagate closed."""

    if not user_message or not user_message.strip():
        return fallback

    resolved_context = await resolve_grounding(
        build_chat_title_grounding_contract(
            message=user_message,
            user_id=user_id,
            user_role=user_role,
        )
    )
    schema = GroundedChatTitle.model_json_schema(by_alias=True)
    try:
        client = AsyncOpenAI()
    except Exception as error:
        raise classify_provider_error(error) from error
    response = await create_openai_structured_completion(
        client.chat.completions.create,
        {
            "messages": [
                {
                    "role": "user",
                    "content": _TITLE_PROMPT.format(
                        user_message=user_message[:500],
                        resolved_context=resolved_context.model_dump_json(by_alias=True),
                    ),
                }
            ],
            "max_tokens": 60,
        },
        model=model,
        temperature=0.2,
        schema_name="GroundedChatTitle",
        schema=schema,
    )
    try:
        raw_content = response.choices[0].message.content
    except (AttributeError, IndexError) as error:
        raise ProviderFailure("invalid_output", cause=error) from error
    output = parse_structured_output(raw_content, GroundedChatTitle.model_validate)
    validation = validate_grounding(
        output.model_dump(mode="json", by_alias=True),
        resolved_context,
        mode="strip",
    )
    if not validation.valid:
        raise ProviderFailure("invalid_output")

    grounded = GroundedChatTitle.model_validate(validation.output)
    title = grounded.title.strip().strip('"').strip("'")
    words = title.split()
    if not words:
        raise ProviderFailure("invalid_output")
    if len(words) > 5:
        title = " ".join(words[:5])
    return title
