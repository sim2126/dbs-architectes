"""
Graph state for the DBS Chat Agent.
"""
from __future__ import annotations

from typing import Annotated

from langchain_core.messages import BaseMessage
from langgraph.graph.message import add_messages
from pydantic import BaseModel, Field

from app.platform.ai.grounding import ResolvedContext


class ChatAgentState(BaseModel):
    """Mutable state flowing through the agent graph."""

    # Conversation history (LangGraph manages append semantics)
    messages: Annotated[list[BaseMessage], add_messages] = Field(default_factory=list)

    # Metadata
    session_id: str | None = None
    user_id: str | None = None
    user_name: str = "User"
    user_role: str = "viewer"
    today_date: str = ""
    resolved_context: ResolvedContext

    # Accumulated token usage across all LLM calls in this run
    input_tokens: int = 0
    output_tokens: int = 0
    total_tokens: int = 0

    # Final assistant text (populated after the last LLM call)
    final_response: str = ""

    class Config:
        arbitrary_types_allowed = True
