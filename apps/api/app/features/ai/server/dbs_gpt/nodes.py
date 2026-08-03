"""
LangGraph nodes — each node is a pure function: State → State.
Every node receives the full state and returns a partial update.
"""
from collections.abc import Sequence
from typing import Any, cast

import structlog
from langchain_core.messages import BaseMessage, HumanMessage, SystemMessage, ToolMessage
from langchain_openai import ChatOpenAI
from langgraph.prebuilt import ToolNode

from app.features.ai.server.dbs_gpt.state import AgentState
from app.features.ai.server.dbs_gpt.tools import (
    ANALYTICS_TOOLS,
    PROJECT_TOOLS,
    REGULATIONS_TOOLS,
    SCHEDULE_TOOLS,
)
from app.features.ai.server.structured_output import (
    STRUCTURED_RESPONSE_INSTRUCTION,
    GroundedAssistantOutput,
    RouteDecision,
    output_schema,
    route_schema,
)
from app.platform.ai.grounding import (
    ResolvedContext,
    extend_grounding_with_trusted_tool_result,
    serialise_resolved_context,
)
from app.platform.ai.provider import (
    create_openai_structured_chat_model,
    invoke_openai_structured_chat,
    parse_structured_output,
)
from app.platform.config.config import settings

logger = structlog.get_logger(__name__)

# ── LLM instances (one per sub-agent for independent configuration) ────────────

def _llm(
    *,
    temperature: float = 0.1,
    schema_name: str = "GroundedAssistantOutput",
    schema: dict[str, object] | None = None,
) -> ChatOpenAI:
    return create_openai_structured_chat_model(
        model=settings.OPENAI_MODEL,
        temperature=temperature,
        schema_name=schema_name,
        schema=schema or output_schema(),
        api_key=settings.OPENAI_API_KEY,
        max_tokens=settings.OPENAI_MAX_TOKENS,
    )


def _content_text(content: object) -> str:
    if isinstance(content, str):
        return content
    if not isinstance(content, list):
        return ""
    return "".join(
        part if isinstance(part, str) else str(part.get("text", ""))
        for part in content
        if isinstance(part, (str, dict))
    )


def _context_system_prompt(
    state: AgentState,
    prompt: str,
    *,
    resolved_context: ResolvedContext | None = None,
) -> str:
    context = serialise_resolved_context(resolved_context or state["resolved_context"])
    return f"{prompt}\n\nResolved context (authoritative JSON):\n{context}"


def _grounded_system_prompt(
    state: AgentState,
    prompt: str,
    *,
    resolved_context: ResolvedContext | None = None,
) -> str:
    return (
        f"{_context_system_prompt(state, prompt, resolved_context=resolved_context)}\n\n"
        f"{STRUCTURED_RESPONSE_INSTRUCTION}"
    )


async def _invoke(llm: Any, messages: Sequence[BaseMessage]) -> BaseMessage:
    invoke = llm.ainvoke
    return await invoke_openai_structured_chat(invoke, messages)


# ── Supervisor Node ────────────────────────────────────────────────────────────
# Reads the user message, decides which sub-agent should handle it.

SUPERVISOR_SYSTEM = """You are the supervisor of DBS Architectes' AI assistant.
Your job is to route a user question to ONE specialist agent.

Decision rule (apply top-to-bottom, pick the FIRST match):

1. project_manager — use whenever the user wants PROJECTS AS ROWS:
   listing them, naming them, looking up details, filtering to see
   specific projects, getting a team assignment. Examples of triggers:
   "list", "show", "which", "what are", "give me ... projects", any
   mention of a project name (Le Saillen, Crans Carlton, Solaris, etc.)
   or code (DBS-2025-001).

2. data_analyst — use ONLY when the user wants A NUMBER OR PERCENTAGE
   and explicitly does NOT want to see individual project names.
   Examples: "how many ...", "what percentage ...", "statistics",
   "breakdown by phase", "portfolio summary".

3. scheduler — agenda, deadlines, upcoming tasks, task creation.

4. regulations_expert — Swiss building regulations (VSS, RCCZ Sion,
   PROCAP, SIA), parking rules, compliance.

Tie-breaker: if you can't decide between project_manager and data_analyst,
ALWAYS pick project_manager. It has richer tools and can answer
aggregate-looking questions by listing then counting.

Routing examples:
- "Who is on the Le Saillen team?"           → project_manager
- "Show projects in CHANTIER"                → project_manager
- "List three TERMINATO projects"            → project_manager
- "Projects in the TERMINATO phase"          → project_manager
- "Portfolio statistics by phase"            → data_analyst
- "How many projects are TERMINATO?"         → data_analyst
- "Percentage of stuck projects"             → data_analyst
- "Deadlines next week"                      → scheduler
- "Parking for residential in Sion"          → regulations_expert

Current user role: {user_role}
{project_context}

Return one JSON object with a single `next` field. Its value must be
project_manager, scheduler, regulations_expert, or data_analyst."""


async def supervisor_node(state: AgentState) -> dict:
    logger.info("agent.supervisor", user_id=state["user_id"])

    if state.get("iteration_count", 0) >= 5:
        logger.warning("agent.max_iterations_reached", user_id=state["user_id"])
        return {
            "next": "FINISH",
            "final_response": GroundedAssistantOutput(
                answer="I've reached the maximum number of steps. Please rephrase your request.",
                user_ids=(),
                project_ids=(),
                phases=(),
                dates=(),
            ),
        }

    project_ctx = ""
    if state.get("project_id"):
        project = next(
            (
                candidate
                for candidate in state["resolved_context"].projects
                if candidate.id == state["project_id"]
            ),
            None,
        )
        project_ctx = (
            f"User is viewing project: {project.code} - {project.title}"
            if project
            else "The requested project was not present in the resolved context."
        )

    llm = _llm(
        temperature=0.0,
        schema_name="RouteDecision",
        schema=route_schema(),
    )
    system = _context_system_prompt(
        state,
        SUPERVISOR_SYSTEM.format(
            user_role=state.get("user_role", "viewer"),
            project_context=project_ctx,
        ),
    )

    last_message = state["messages"][-1].content if state["messages"] else ""

    response = await _invoke(
        llm,
        [
            SystemMessage(content=system),
            HumanMessage(content=f"Route this request: {last_message}"),
        ],
    )
    decision = parse_structured_output(
        _content_text(response.content),
        RouteDecision.model_validate,
    )

    return {
        "next": decision.next,
        "iteration_count": state.get("iteration_count", 0) + 1,
        "visited_nodes": ["supervisor"],
    }


# ── Project Manager Node ───────────────────────────────────────────────────────

PROJECT_MANAGER_SYSTEM = """You are the Project Manager agent for DBS Architectes.
You handle everything related to projects: listing, updating phases, checking team assignments,
finding projects by client or location.

DBS uses real codes like DBS-2025-001, DBS-2024-002, DBS-2015-003. The 48 seeded projects
are real DBS work — Le Saillen, Lamberson Buildings, Crans Carlton, Solaris, Le Hameau, etc.

Phase values (case-insensitive, whitespace tolerant):
  ETUDE/AP · MAE · CHANTIER · EXE/DG/DV/3D · TERMINATO · STUCK · CONCORSO

You have access to these tools: get_projects, update_project_phase, get_project_team.

Always be concise. Use bullet points for lists. Format project codes in [brackets].
If updating something, confirm what was changed.
User role: {user_role} — only allow destructive actions for admin/super_admin/project_manager."""


async def project_manager_node(state: AgentState) -> dict:
    logger.info("agent.project_manager", user_id=state["user_id"])
    role = state.get("user_role", "viewer")
    tools = PROJECT_TOOLS if role in {"admin", "super_admin", "project_manager"} else [
        tool for tool in PROJECT_TOOLS if tool.name != "update_project_phase"
    ]
    llm = _llm().bind_tools(tools)
    system = _grounded_system_prompt(
        state,
        PROJECT_MANAGER_SYSTEM.format(user_role=role),
    )
    messages = [SystemMessage(content=system)] + state["messages"]
    response = await _invoke(llm, messages)
    return {"messages": [response], "next": "FINISH", "visited_nodes": ["project_manager"]}


# ── Scheduler Node ─────────────────────────────────────────────────────────────

SCHEDULER_SYSTEM = """You are the Scheduler agent for DBS Architectes.
You handle agenda items, deadlines, and task scheduling.

You have access to: create_agenda_item, get_upcoming_agenda.

When creating tasks, extract: title, date (convert natural language to ISO format),
project code if mentioned, and priority (default: medium).
Always confirm what was created with the exact date."""


async def scheduler_node(state: AgentState) -> dict:
    logger.info("agent.scheduler", user_id=state["user_id"])
    llm = _llm().bind_tools(SCHEDULE_TOOLS)
    system = _grounded_system_prompt(state, SCHEDULER_SYSTEM)
    messages = [SystemMessage(content=system)] + state["messages"]
    response = await _invoke(llm, messages)
    return {"messages": [response], "next": "FINISH", "visited_nodes": ["scheduler"]}


# ── Regulations Expert Node ────────────────────────────────────────────────────

REGULATIONS_SYSTEM = """You are the Swiss Building Regulations Expert for DBS Architectes.
You specialize in:
- Swiss VSS standards
- RCCZ (Règlement des constructions de la commune de Sion)
- PROCAP accessibility norms
- DBS internal design standards
- Parking calculation rules
- SIA norms (Swiss Society of Engineers and Architects)

Use the search_regulations tool to find relevant information.
Always cite the specific standard or article when possible.
If you cannot find a specific answer in the knowledge base, say so clearly and
recommend consulting the official document directly."""


async def regulations_expert_node(state: AgentState) -> dict:
    logger.info("agent.regulations_expert", user_id=state["user_id"])
    llm = _llm(temperature=0.0).bind_tools(REGULATIONS_TOOLS)
    system = _grounded_system_prompt(state, REGULATIONS_SYSTEM)
    messages = [SystemMessage(content=system)] + state["messages"]
    response = await _invoke(llm, messages)
    return {"messages": [response], "next": "FINISH", "visited_nodes": ["regulations_expert"]}


# ── Data Analyst Node ──────────────────────────────────────────────────────────

ANALYST_SYSTEM = """You are the Data Analyst agent for DBS Architectes.
You provide statistics, summaries, and insights about the firm's project portfolio.

Use get_project_statistics to get current data.
Present numbers clearly. Use percentages where helpful.
Highlight anything that looks like a bottleneck (e.g., many STUCK projects)."""


async def data_analyst_node(state: AgentState) -> dict:
    logger.info("agent.data_analyst", user_id=state["user_id"])
    project_health_context = state["resolved_context"].model_copy(
        update={"surface": "project-health"}
    )
    llm = _llm(temperature=0.2).bind_tools(ANALYTICS_TOOLS)
    system = _grounded_system_prompt(
        state,
        ANALYST_SYSTEM,
        resolved_context=project_health_context,
    )
    messages = [SystemMessage(content=system)] + state["messages"]
    response = await _invoke(llm, messages)
    return {
        "messages": [response],
        "next": "FINISH",
        "visited_nodes": ["data_analyst"],
        "resolved_context": project_health_context,
    }


# ── Tool executor nodes (one per sub-agent) ────────────────────────────────────
def extend_grounding_from_tool_messages(
    context: ResolvedContext,
    messages: Sequence[BaseMessage],
) -> ResolvedContext:
    """Extend context only with outputs from tools that passed access checks."""

    extended = context
    for message in messages:
        if isinstance(message, ToolMessage):
            extended = extend_grounding_with_trusted_tool_result(
                extended,
                message.content,
            )
    return extended


async def _run_grounded_tools(node: ToolNode, state: AgentState) -> dict[str, Any]:
    result = cast(dict[str, Any], await node.ainvoke(state))
    messages = cast(list[BaseMessage], result.get("messages", []))
    return {
        **result,
        "resolved_context": extend_grounding_from_tool_messages(
            state["resolved_context"],
            messages,
        ),
    }


_project_tools_node = ToolNode(PROJECT_TOOLS)
_schedule_tools_node = ToolNode(SCHEDULE_TOOLS)
_regulations_tools_node = ToolNode(REGULATIONS_TOOLS)
_analytics_tools_node = ToolNode(ANALYTICS_TOOLS)


async def project_tools_node(state: AgentState) -> dict[str, Any]:
    return await _run_grounded_tools(_project_tools_node, state)


async def schedule_tools_node(state: AgentState) -> dict[str, Any]:
    return await _run_grounded_tools(_schedule_tools_node, state)


async def regulations_tools_node(state: AgentState) -> dict[str, Any]:
    return await _run_grounded_tools(_regulations_tools_node, state)


async def analytics_tools_node(state: AgentState) -> dict[str, Any]:
    return await _run_grounded_tools(_analytics_tools_node, state)
