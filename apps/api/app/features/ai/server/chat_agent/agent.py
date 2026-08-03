"""DBS Chat Agent (Aria), grounded before any provider call."""

from __future__ import annotations

import asyncio
from collections.abc import AsyncIterator
from datetime import date
from typing import Any, cast

import structlog
from langchain_core.messages import (
    AIMessage,
    AIMessageChunk,
    HumanMessage,
    SystemMessage,
    ToolMessage,
)

from app.features.ai.server.chat_agent.state import ChatAgentState
from app.features.ai.server.dbs_gpt.security_context import (
    reset_agent_subject,
    set_agent_subject,
)
from app.features.ai.server.grounding_contracts import build_chat_agent_grounding_contract
from app.features.ai.server.structured_output import (
    STRUCTURED_RESPONSE_INSTRUCTION,
    output_schema,
    parse_grounded_output,
    validate_grounded_output,
)
from app.platform.ai.grounding import (
    ResolvedContext,
    extend_grounding_with_trusted_tool_result,
    resolve_grounding,
    serialise_resolved_context,
)
from app.platform.ai.provider import (
    ProviderFailure,
    create_openai_structured_chat_model,
    invoke_openai_structured_chat,
    stream_openai_structured_chat,
)
from app.platform.config.config import settings

from .title_generator import generate_chat_title
from .tools import ALL_TOOLS

logger = structlog.get_logger(__name__)

MAX_ROUNDS = 6


def _content_text(content: str | list[str | dict[Any, Any]]) -> str:
    if isinstance(content, str):
        return content
    return "".join(
        part if isinstance(part, str) else str(part.get("text", ""))
        for part in content
    )


def _latest_user_message(messages: list[dict]) -> str:
    for message in reversed(messages):
        if message.get("role") == "user" and isinstance(message.get("content"), str):
            return str(message["content"])
    return ""


async def _next_message(
    llm_with_tools: Any,
    history: list,
    *,
    stream: bool,
) -> AIMessage:
    if not stream:
        invoke = llm_with_tools.ainvoke
        return cast(AIMessage, await invoke_openai_structured_chat(invoke, history))

    stream_call = llm_with_tools.astream
    aggregate: AIMessageChunk | None = None
    async for chunk in stream_openai_structured_chat(stream_call, history):
        aggregate = chunk if aggregate is None else aggregate + chunk
    if aggregate is None:
        raise ProviderFailure("invalid_output")
    return AIMessage(
        content=aggregate.content,
        tool_calls=cast(Any, aggregate.tool_calls),
    )


_SYSTEM_PROMPT = """You are **Aria**, the embedded intelligence layer for DBS Architectes — a Swiss \
architecture firm managing a live portfolio of residential, commercial, and mixed-use projects.

Today's date: {today_date}
Requesting user: {user_name} ({user_role})

You have direct read access to the live database: projects, team assignments, work-status, \
agenda deadlines, team chat threads, and activity logs.

# Core Principles
- **Data fidelity**: Present data EXACTLY as returned by tools. Never fabricate.
- **Precision over verbosity**: Use markdown tables and lists — never long narratives.
- **Qualified language**: Use "Based on current data…" instead of absolute claims.
- **No internal exposure**: Never show raw IDs, tool names, or implementation details.
- **Scope discipline**: Answer ONLY what was asked.

# Response Formatting
- Project lists → markdown table with Code, Title, Phase, Status, Team, Deadline
- Status emoji: 🔴 Stuck · 🟡 Working on it · ⚪ Not Started · 🟢 Done
- Every response must contain at least one concrete data point.
- Introductions ≤ 2 sentences.

# Scope Boundary
You have read-only access. You cannot create projects, send messages, or modify data.
If asked to do so, explain and offer the closest analytical alternative.
"""


async def run_chat_agent(
    messages: list[dict],
    *,
    user_name: str = "User",
    user_role: str = "viewer",
    user_id: str = "anonymous",
    session_id: str | None = None,
    stream: bool = True,
) -> AsyncIterator[dict]:
    """Run Aria and emit only validated, SSE-compatible events."""

    subject_tokens = set_agent_subject(user_id, user_role)
    try:
        try:
            async for event in _run_chat_agent(
                messages,
                user_name=user_name,
                user_role=user_role,
                user_id=user_id,
                session_id=session_id,
                stream=stream,
            ):
                yield event
        except ProviderFailure as error:
            logger.warning(
                "chat_agent_provider_failure",
                kind=error.kind,
                session_id=session_id,
            )
            yield {"type": "error", "kind": error.kind, "message": str(error)}
        except Exception:
            logger.exception("chat_agent_error", session_id=session_id)
            yield {
                "type": "error",
                "message": "AI Assistant could not complete this request. Please try again.",
            }
    finally:
        reset_agent_subject(subject_tokens)


async def _run_chat_agent(
    messages: list[dict],
    *,
    user_name: str,
    user_role: str,
    user_id: str,
    session_id: str | None,
    stream: bool,
) -> AsyncIterator[dict]:
    """Execute Aria while ``run_chat_agent`` owns the subject context."""

    latest_user_message = _latest_user_message(messages)
    resolved_context = await resolve_grounding(
        build_chat_agent_grounding_contract(
            message=latest_user_message,
            user_id=user_id,
            user_role=user_role,
        )
    )
    today = date.today().isoformat()
    state = ChatAgentState(
        session_id=session_id,
        user_id=user_id,
        user_name=user_name,
        user_role=user_role,
        today_date=today,
        resolved_context=resolved_context,
    )
    def grounded_system_prompt(context: ResolvedContext) -> str:
        base_prompt = _SYSTEM_PROMPT.format(
            today_date=state.today_date,
            user_name=state.user_name,
            user_role=state.user_role,
        )
        return (
            f"{base_prompt}\n\nResolved context (authoritative JSON):\n"
            f"{serialise_resolved_context(context)}\n\n"
            f"{STRUCTURED_RESPONSE_INSTRUCTION}"
        )

    history: list = [SystemMessage(content=grounded_system_prompt(resolved_context))]
    for message in messages:
        if message["role"] == "user":
            history.append(HumanMessage(content=message["content"]))
        elif message["role"] == "assistant":
            history.append(AIMessage(content=message["content"]))

    llm = create_openai_structured_chat_model(
        model="gpt-4o",
        temperature=0.2,
        schema_name="GroundedAssistantOutput",
        schema=output_schema(),
        api_key=settings.OPENAI_API_KEY,
        max_tokens=settings.OPENAI_MAX_TOKENS,
        streaming=stream,
    )
    llm_with_tools = llm.bind_tools(ALL_TOOLS)
    tool_map = {tool.name: tool for tool in ALL_TOOLS}

    try:
        for _round_number in range(MAX_ROUNDS):
            response = await _next_message(llm_with_tools, history, stream=stream)
            assistant_text = _content_text(response.content)
            tool_calls = cast(list[dict], response.tool_calls or [])
            history.append(
                AIMessage(content=assistant_text, tool_calls=cast(Any, tool_calls))
            )

            if not tool_calls:
                grounded_output, issues = validate_grounded_output(
                    parse_grounded_output(assistant_text),
                    resolved_context,
                )
                if issues:
                    logger.warning(
                        "chat_agent_grounding_issues",
                        session_id=session_id,
                        issues=[issue.model_dump(mode="json", by_alias=True) for issue in issues],
                    )
                    yield {
                        "type": "grounding_issues",
                        "issues": [
                            issue.model_dump(mode="json", by_alias=True) for issue in issues
                        ],
                    }
                yield {"type": "text", "content": grounded_output.answer}
                yield {"type": "done"}
                return

            yield {"type": "tool_start", "tools": [call["name"] for call in tool_calls]}

            async def run_tool(call: dict) -> tuple[dict, str]:
                name = str(call["name"])
                tool = tool_map.get(name)
                if tool is None:
                    return call, f'{{"error": "Tool {name} not found"}}'
                try:
                    result = await tool.ainvoke(call.get("args", {}))
                    return call, str(result)
                except Exception:
                    logger.exception("tool_execution_error", tool=name)
                    return call, '{"error": "Tool execution failed"}'

            results = await asyncio.gather(*(run_tool(call) for call in tool_calls))
            for call, result_text in results:
                name = str(call["name"])
                yield {"type": "tool_result", "name": name}
                history.append(
                    ToolMessage(
                        content=result_text,
                        tool_call_id=str(call.get("id", name)),
                    )
                )
                resolved_context = extend_grounding_with_trusted_tool_result(
                    resolved_context,
                    result_text,
                )
            state.resolved_context = resolved_context
            history[0] = SystemMessage(content=grounded_system_prompt(resolved_context))

        raise ProviderFailure("invalid_output")
    except ProviderFailure as error:
        logger.warning(
            "chat_agent_provider_failure",
            kind=error.kind,
            session_id=session_id,
        )
        yield {"type": "error", "kind": error.kind, "message": str(error)}
    except Exception:
        logger.exception("chat_agent_error", session_id=session_id)
        yield {
            "type": "error",
            "message": "AI Assistant could not complete this request. Please try again.",
        }


async def get_title_for_session(
    first_user_message: str,
    *,
    user_id: str = "anonymous",
    user_role: str = "viewer",
) -> str:
    """Generate a schema-bound title for a new chat session."""

    return await generate_chat_title(
        first_user_message,
        user_id=user_id,
        user_role=user_role,
    )
