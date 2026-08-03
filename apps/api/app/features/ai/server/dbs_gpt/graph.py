"""
DBS GPT — LangGraph multi-agent graph.

Architecture:
  User message
       ↓
  [supervisor]  →  routes to one of:
       ├── [project_manager]   → [project_tools]   → back to supervisor or FINISH
       ├── [scheduler]         → [schedule_tools]   → back to supervisor or FINISH
       ├── [regulations_expert]→ [regulations_tools]→ back to supervisor or FINISH
       └── [data_analyst]      → [analytics_tools]  → back to supervisor or FINISH
                                        ↓
                                    [FINISH / END]
"""
import structlog
from langchain_core.messages import HumanMessage, RemoveMessage, ToolMessage
from langchain_core.runnables import RunnableConfig
from langgraph.checkpoint.memory import MemorySaver
from langgraph.graph import END, StateGraph

from app.features.ai.server.dbs_gpt.nodes import (
    analytics_tools_node,
    data_analyst_node,
    project_manager_node,
    project_tools_node,
    regulations_expert_node,
    regulations_tools_node,
    schedule_tools_node,
    scheduler_node,
    supervisor_node,
)
from app.features.ai.server.dbs_gpt.security_context import reset_agent_subject, set_agent_subject
from app.features.ai.server.dbs_gpt.state import AgentState
from app.features.ai.server.grounding_contracts import build_dbs_gpt_grounding_contract
from app.features.ai.server.structured_output import (
    GroundedAssistantOutput,
    parse_grounded_output,
    validate_grounded_output,
)
from app.platform.ai.grounding import ResolvedContext, resolve_grounding
from app.platform.ai.provider import ProviderFailure

logger = structlog.get_logger(__name__)


def checkpoint_thread_key(user_id: str, thread_id: str | None) -> str:
    """Namespace caller-provided checkpoints so identities can never collide."""

    import uuid

    return f"{user_id}:{thread_id or uuid.uuid4().hex}"


def checkpoint_history_removals(messages: list) -> list[RemoveMessage]:
    """Drop prior provider/tool output before applying a freshly scoped context."""

    return [
        RemoveMessage(id=message.id)
        for message in messages
        if not isinstance(message, HumanMessage) and getattr(message, "id", None)
    ]


async def scrub_checkpoint_history_node(state: AgentState) -> dict:
    return {"messages": checkpoint_history_removals(state["messages"])}


def route_from_supervisor(state: AgentState) -> str:
    """Edge: supervisor → next sub-agent."""
    next_ = state.get("next", "FINISH")
    if next_ in ("FINISH", "finish"):
        return END
    return next_ or "project_manager"


def route_after_agent(state: AgentState) -> str:
    """
    After a sub-agent responds, check if it made tool calls.
    If yes → run the tool node. If no → the answer is final, END.
    (Previously routed back to supervisor which re-looped the graph.)
    """
    last = state["messages"][-1]
    if hasattr(last, "tool_calls") and last.tool_calls:
        return "tools"
    return END


def route_after_project_manager(state: AgentState) -> str:
    last = state["messages"][-1]
    if hasattr(last, "tool_calls") and last.tool_calls:
        return "project_tools"
    return END


def route_after_scheduler(state: AgentState) -> str:
    last = state["messages"][-1]
    if hasattr(last, "tool_calls") and last.tool_calls:
        return "schedule_tools"
    return END


def route_after_regulations(state: AgentState) -> str:
    last = state["messages"][-1]
    if hasattr(last, "tool_calls") and last.tool_calls:
        return "regulations_tools"
    return END


def route_after_analyst(state: AgentState) -> str:
    last = state["messages"][-1]
    if hasattr(last, "tool_calls") and last.tool_calls:
        return "analytics_tools"
    return END


def build_graph() -> StateGraph:
    graph = StateGraph(AgentState)

    # ── Add nodes ──────────────────────────────────────────────────────────────
    graph.add_node("scrub_checkpoint_history", scrub_checkpoint_history_node)
    graph.add_node("supervisor", supervisor_node)
    graph.add_node("project_manager", project_manager_node)
    graph.add_node("scheduler", scheduler_node)
    graph.add_node("regulations_expert", regulations_expert_node)
    graph.add_node("data_analyst", data_analyst_node)
    graph.add_node("project_tools", project_tools_node)
    graph.add_node("schedule_tools", schedule_tools_node)
    graph.add_node("regulations_tools", regulations_tools_node)
    graph.add_node("analytics_tools", analytics_tools_node)

    # ── Entry point ────────────────────────────────────────────────────────────
    graph.set_entry_point("scrub_checkpoint_history")
    graph.add_edge("scrub_checkpoint_history", "supervisor")

    # ── Routing from supervisor ────────────────────────────────────────────────
    graph.add_conditional_edges(
        "supervisor",
        route_from_supervisor,
        {
            "project_manager": "project_manager",
            "scheduler": "scheduler",
            "regulations_expert": "regulations_expert",
            "data_analyst": "data_analyst",
            END: END,
        },
    )

    # ── Sub-agent → tools (if it wants them) or END (if answer is final) ──────
    graph.add_conditional_edges("project_manager", route_after_project_manager,
        {"project_tools": "project_tools", END: END})
    graph.add_conditional_edges("scheduler", route_after_scheduler,
        {"schedule_tools": "schedule_tools", END: END})
    graph.add_conditional_edges("regulations_expert", route_after_regulations,
        {"regulations_tools": "regulations_tools", END: END})
    graph.add_conditional_edges("data_analyst", route_after_analyst,
        {"analytics_tools": "analytics_tools", END: END})

    # ── Tool nodes → back to the sub-agent that called them ───────────────────
    graph.add_edge("project_tools", "project_manager")
    graph.add_edge("schedule_tools", "scheduler")
    graph.add_edge("regulations_tools", "regulations_expert")
    graph.add_edge("analytics_tools", "data_analyst")

    return graph


# ── Compile with in-memory checkpointing (swap for Redis/Postgres in prod) ────
_checkpointer = MemorySaver()
compiled_graph = build_graph().compile(checkpointer=_checkpointer)


async def run_agent(
    message: str,
    user_id: str,
    user_role: str = "viewer",
    project_id: str | None = None,
    project_context: dict | None = None,
    thread_id: str | None = None,
) -> str:
    """Text-only entry point — preserved for callers that don't need the trace."""
    text, _ = await run_agent_with_trace(
        message=message,
        user_id=user_id,
        user_role=user_role,
        project_id=project_id,
        project_context=project_context,
        thread_id=thread_id,
    )
    return text


async def run_agent_with_trace(
    message: str,
    user_id: str,
    user_role: str = "viewer",
    project_id: str | None = None,
    project_context: dict | None = None,
    thread_id: str | None = None,
) -> tuple[str, dict]:
    """Run DBS GPT and return both the final text and a demo-friendly trace.

    The trace is what powers the live "which agent handled this?" UI in the
    demo. It includes the ordered supervisor routing, each tool call with
    arguments and a truncated result, plus the final text.
    """
    from langchain_core.messages import AIMessage, HumanMessage

    # Fresh thread per call → visited_nodes reflects only this turn, not
    # accumulated history from prior calls via the checkpointer.
    thread_key = checkpoint_thread_key(user_id, thread_id)
    config: RunnableConfig = {"configurable": {"thread_id": thread_key}}
    grounding_contract = build_dbs_gpt_grounding_contract(
        message=message,
        user_id=user_id,
        user_role=user_role,
        project_id=project_id,
    )
    resolved_context = await resolve_grounding(grounding_contract)
    initial_state = {
        "messages": [HumanMessage(content=message)],
        "user_id": user_id,
        "user_role": user_role,
        "project_id": project_id,
        "project_context": project_context,
        "resolved_context": resolved_context,
        "next": None,
        "final_response": None,
        "error": None,
        "iteration_count": 0,
        "visited_nodes": [],
    }

    subject_tokens = set_agent_subject(user_id, user_role)
    try:
        result = await compiled_graph.ainvoke(initial_state, config=config)
    except Exception:
        logger.exception("agent.run_failed", user_id=user_id)
        raise
    finally:
        reset_agent_subject(subject_tokens)

    result_context = result.get("resolved_context")
    if isinstance(result_context, ResolvedContext):
        resolved_context = result_context

    # Extract ordered tool calls from message history
    tool_calls: list[dict] = []
    messages_list = result.get("messages", [])
    tool_results_by_id: dict[str, str] = {}
    for msg in messages_list:
        if isinstance(msg, ToolMessage):
            tool_results_by_id[msg.tool_call_id] = str(msg.content)[:1000]

    for msg in messages_list:
        if isinstance(msg, AIMessage) and getattr(msg, "tool_calls", None):
            for call in msg.tool_calls:
                tool_calls.append({
                    "name": call.get("name"),
                    "args": call.get("args", {}),
                    "result": tool_results_by_id.get(call.get("id") or "", ""),
                })

    # Final response = last AIMessage with content and no further tool calls
    final_output: GroundedAssistantOutput | None = None
    for msg in reversed(messages_list):
        if isinstance(msg, AIMessage) and msg.content and not getattr(msg, "tool_calls", None):
            content = msg.content if isinstance(msg.content, str) else ""
            final_output = parse_grounded_output(content)
            break
    if final_output is None:
        state_output = result.get("final_response")
        if isinstance(state_output, GroundedAssistantOutput):
            final_output = state_output
        elif isinstance(state_output, dict):
            final_output = parse_grounded_output(state_output)
        else:
            raise ProviderFailure("invalid_output")

    grounded_output, grounding_issues = validate_grounded_output(
        final_output,
        resolved_context,
    )
    if grounding_issues:
        logger.warning(
            "agent.grounding_issues",
            user_id=user_id,
            surface=resolved_context.surface,
            issues=[
                issue.model_dump(mode="json", by_alias=True)
                for issue in grounding_issues
            ],
        )

    trace = {
        "visited_nodes": result.get("visited_nodes", []),
        "tool_calls": tool_calls,
        "iteration_count": result.get("iteration_count", 0),
        "grounding_issues": [
            issue.model_dump(mode="json", by_alias=True) for issue in grounding_issues
        ],
        "grounding_surface": resolved_context.surface,
    }
    return grounded_output.answer, trace
