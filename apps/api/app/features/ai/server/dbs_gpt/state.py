from operator import add
from typing import Annotated, Literal, TypedDict

from langchain_core.messages import AnyMessage
from langgraph.graph.message import add_messages

from app.features.ai.server.structured_output import GroundedAssistantOutput
from app.platform.ai.grounding import ResolvedContext

# ── Agent State ───────────────────────────────────────────────────────────────
# This is the shared state that flows through every node in the graph.
# All nodes can read and write to this state.

class AgentState(TypedDict):
    # Conversation history (append-only via add_messages reducer)
    messages: Annotated[list[AnyMessage], add_messages]

    # Who is talking to the agent
    user_id: str
    user_role: str  # super_admin | admin | project_manager | collaborator | viewer

    # Current project context (if the user is talking from a project thread)
    project_id: str | None
    project_context: dict | None

    # Resolved once, before the first provider call, and shared by every node.
    resolved_context: ResolvedContext

    # Routing: which sub-agent should handle the next step
    next: Literal["project_manager", "scheduler", "regulations_expert", "data_analyst", "file_handler", "FINISH"] | None

    # What type of task was identified by the supervisor
    task_type: str | None

    # Final response to return to the user
    final_response: GroundedAssistantOutput | None

    # Error state
    error: str | None

    # Iteration guard (prevents infinite loops)
    iteration_count: int

    # Ordered list of graph nodes visited during this run — used by the demo
    # UI to show which sub-agent the supervisor routed to.
    visited_nodes: Annotated[list[str], add]
