"""
LangGraph nodes — each node is a pure function: State → State.
Every node receives the full state and returns a partial update.
"""
import structlog
from langchain_core.messages import HumanMessage, SystemMessage
from langchain_openai import ChatOpenAI
from langgraph.prebuilt import ToolNode
from pydantic import SecretStr

from app.features.ai.server.dbs_gpt.state import AgentState
from app.features.ai.server.dbs_gpt.tools import (
    ANALYTICS_TOOLS,
    PROJECT_TOOLS,
    REGULATIONS_TOOLS,
    SCHEDULE_TOOLS,
)
from app.platform.config.config import settings

logger = structlog.get_logger(__name__)

# ── LLM instances (one per sub-agent for independent configuration) ────────────

def _llm(temperature: float = 0.1) -> ChatOpenAI:
    return ChatOpenAI(
        model=settings.OPENAI_MODEL,
        api_key=SecretStr(settings.OPENAI_API_KEY),
        temperature=temperature,
        model_kwargs={"max_tokens": settings.OPENAI_MAX_TOKENS},
    )


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

Respond with EXACTLY one token: project_manager, scheduler,
regulations_expert, or data_analyst. No other text."""


async def supervisor_node(state: AgentState) -> dict:
    logger.info("agent.supervisor", user_id=state["user_id"])

    if state.get("iteration_count", 0) >= 5:
        logger.warning("agent.max_iterations_reached", user_id=state["user_id"])
        return {"next": "FINISH", "final_response": "I've reached the maximum number of steps. Please rephrase your request."}

    project_ctx = ""
    if state.get("project_id"):
        project_context = state.get("project_context") or {}
        project_ctx = f"User is viewing project: {project_context.get('code', state['project_id'])}"

    llm = _llm(temperature=0.0)
    system = SUPERVISOR_SYSTEM.format(
        user_role=state.get("user_role", "viewer"),
        project_context=project_ctx,
    )

    last_message = state["messages"][-1].content if state["messages"] else ""

    response = await llm.ainvoke([
        SystemMessage(content=system),
        HumanMessage(content=f"Route this request: {last_message}"),
    ])

    response_text = response.content if isinstance(response.content, str) else ""
    next_agent = response_text.strip().lower().replace("-", "_")
    valid = {"project_manager", "scheduler", "regulations_expert", "data_analyst", "finish"}
    if next_agent not in valid:
        next_agent = "project_manager"  # safe default
    if next_agent == "finish":
        next_agent = "FINISH"

    return {
        "next": next_agent,
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
    system = PROJECT_MANAGER_SYSTEM.format(user_role=role)
    messages = [SystemMessage(content=system)] + state["messages"]
    response = await llm.ainvoke(messages)
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
    system = SCHEDULER_SYSTEM
    messages = [SystemMessage(content=system)] + state["messages"]
    response = await llm.ainvoke(messages)
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
    system = REGULATIONS_SYSTEM
    messages = [SystemMessage(content=system)] + state["messages"]
    response = await llm.ainvoke(messages)
    return {"messages": [response], "next": "FINISH", "visited_nodes": ["regulations_expert"]}


# ── Data Analyst Node ──────────────────────────────────────────────────────────

ANALYST_SYSTEM = """You are the Data Analyst agent for DBS Architectes.
You provide statistics, summaries, and insights about the firm's project portfolio.

Use get_project_statistics to get current data.
Present numbers clearly. Use percentages where helpful.
Highlight anything that looks like a bottleneck (e.g., many STUCK projects)."""


async def data_analyst_node(state: AgentState) -> dict:
    logger.info("agent.data_analyst", user_id=state["user_id"])
    llm = _llm(temperature=0.2).bind_tools(ANALYTICS_TOOLS)
    system = ANALYST_SYSTEM
    messages = [SystemMessage(content=system)] + state["messages"]
    response = await llm.ainvoke(messages)
    return {"messages": [response], "next": "FINISH", "visited_nodes": ["data_analyst"]}


# ── Tool executor nodes (one per sub-agent) ────────────────────────────────────
project_tools_node = ToolNode(PROJECT_TOOLS)
schedule_tools_node = ToolNode(SCHEDULE_TOOLS)
regulations_tools_node = ToolNode(REGULATIONS_TOOLS)
analytics_tools_node = ToolNode(ANALYTICS_TOOLS)
