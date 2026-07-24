"""
DBS Chat Agent — Aria
Production-grade agentic AI with streaming support and async tool execution.

Architecture: ReAct loop via LangGraph
  user message
      → llm_node (GPT-4o with tools bound)
      → tool_node (execute tool calls in parallel)
      → llm_node (continue reasoning)
      → … (up to MAX_ROUNDS)
      → stream final answer token-by-token
"""
from __future__ import annotations

import asyncio
from collections.abc import AsyncIterator
from datetime import date
from typing import Any, cast

import structlog
from langchain_core.messages import AIMessage, HumanMessage, SystemMessage
from langchain_openai import ChatOpenAI

from .title_generator import generate_chat_title
from .tools import ALL_TOOLS

logger = structlog.get_logger(__name__)

MAX_ROUNDS = 6


def _content_text(content: str | list[str | dict[Any, Any]]) -> str:
    if isinstance(content, str):
        return content
    return "".join(part if isinstance(part, str) else str(part.get("text", "")) for part in content)

# ── System prompt ─────────────────────────────────────────────────────────────

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


# ── Main entry point ──────────────────────────────────────────────────────────

async def run_chat_agent(
    messages: list[dict],  # [{"role": "user"|"assistant", "content": "..."}]
    *,
    user_name: str = "User",
    user_role: str = "viewer",
    session_id: str | None = None,
    stream: bool = True,
) -> AsyncIterator[dict]:
    """
    Run the DBS Chat Agent (Aria) and yield SSE-compatible event dicts.

    Yields:
        {"type": "text", "content": "..."} — streamed assistant text
        {"type": "tool_start", "tools": ["search_projects", ...]}
        {"type": "tool_result", "name": "search_projects"}
        {"type": "done"}
        {"type": "error", "message": "..."}
    """
    today = date.today().isoformat()
    system_prompt = _SYSTEM_PROMPT.format(
        today_date=today,
        user_name=user_name,
        user_role=user_role,
    )

    # Build LangChain message history
    lc_messages: list = [SystemMessage(content=system_prompt)]
    for m in messages:
        if m["role"] == "user":
            lc_messages.append(HumanMessage(content=m["content"]))
        elif m["role"] == "assistant":
            lc_messages.append(AIMessage(content=m["content"]))

    llm = ChatOpenAI(model="gpt-4o", temperature=0.2, streaming=stream)
    llm_with_tools = llm.bind_tools(ALL_TOOLS)
    tool_map = {t.name: t for t in ALL_TOOLS}

    history = list(lc_messages)
    accumulated_text = ""

    try:
        for round_num in range(MAX_ROUNDS):
            tool_calls_this_round: list[dict] = []
            assistant_text = ""

            if stream and round_num == 0 or not tool_calls_this_round:
                # Stream the response
                async for chunk in llm_with_tools.astream(history):
                    if chunk.content:
                        chunk_text = _content_text(chunk.content)
                        assistant_text += chunk_text
                        accumulated_text += chunk_text
                        yield {"type": "text", "content": chunk_text}
                    if hasattr(chunk, "tool_calls") and chunk.tool_calls:
                        tool_calls_this_round.extend(chunk.tool_calls)
            else:
                response = cast(AIMessage, await llm_with_tools.ainvoke(history))
                assistant_text = _content_text(response.content)
                accumulated_text += assistant_text
                if assistant_text:
                    yield {"type": "text", "content": assistant_text}
                tool_calls_this_round = cast(list[dict], response.tool_calls or [])

            # Add assistant message to history
            ai_msg = AIMessage(content=assistant_text, tool_calls=cast(Any, tool_calls_this_round))
            history.append(ai_msg)

            # No tool calls → done
            if not tool_calls_this_round:
                break

            # Execute tool calls in parallel
            tool_names = [tc["name"] for tc in tool_calls_this_round]
            yield {"type": "tool_start", "tools": tool_names}

            async def _run_tool(tc: dict) -> tuple[str, str]:
                name = tc["name"]
                args = tc.get("args", {})
                tool_fn = tool_map.get(name)
                if not tool_fn:
                    return name, f'{{"error": "Tool {name} not found"}}'
                try:
                    result = await tool_fn.ainvoke(args)
                    yield_msg = {"type": "tool_result", "name": name}
                    return name, str(result), yield_msg  # type: ignore[return-value]
                except Exception as exc:
                    logger.error("tool_execution_error", tool=name, error=str(exc))
                    return name, f'{{"error": "{exc}"}}', {"type": "tool_result", "name": name}  # type: ignore[return-value]

            results = await asyncio.gather(*[_run_tool(tc) for tc in tool_calls_this_round])

            for name, result_str, event in results:  # type: ignore[misc]
                yield event
                # Add tool result to history
                from langchain_core.messages import ToolMessage
                history.append(ToolMessage(content=result_str, tool_call_id=name))

        yield {"type": "done"}

    except Exception as exc:
        logger.error("chat_agent_error", error=str(exc), session_id=session_id)
        yield {"type": "error", "message": str(exc)}


async def get_title_for_session(first_user_message: str) -> str:
    """Generate a title for a new chat session based on the first user message."""
    return await generate_chat_title(first_user_message)
