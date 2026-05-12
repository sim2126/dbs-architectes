from operator import add
from typing import TypedDict, Annotated, Optional, Literal
from langchain_core.messages import AnyMessage
from langgraph.graph.message import add_messages


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
    project_id: Optional[str]
    project_context: Optional[dict]

    # Routing: which sub-agent should handle the next step
    next: Optional[Literal[
        "project_manager",
        "scheduler",
        "regulations_expert",
        "data_analyst",
        "file_handler",
        "FINISH"
    ]]

    # What type of task was identified by the supervisor
    task_type: Optional[str]

    # Final response to return to the user
    final_response: Optional[str]

    # Error state
    error: Optional[str]

    # Iteration guard (prevents infinite loops)
    iteration_count: int

    # Ordered list of graph nodes visited during this run — used by the demo
    # UI to show which sub-agent the supervisor routed to.
    visited_nodes: Annotated[list[str], add]
