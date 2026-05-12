"""
Graph state for the DBS Chat Agent.
"""
from __future__ import annotations

from typing import Annotated, Any, Optional
from uuid import UUID

from langchain_core.messages import BaseMessage
from langgraph.graph.message import add_messages
from pydantic import BaseModel, Field


class ChatAgentState(BaseModel):
    """Mutable state flowing through the agent graph."""

    # Conversation history (LangGraph manages append semantics)
    messages: Annotated[list[BaseMessage], add_messages] = Field(default_factory=list)

    # Metadata
    session_id: Optional[str] = None
    user_id: Optional[str] = None
    user_name: str = "User"
    user_role: str = "viewer"
    today_date: str = ""

    # Accumulated token usage across all LLM calls in this run
    input_tokens: int = 0
    output_tokens: int = 0
    total_tokens: int = 0

    # Final assistant text (populated after the last LLM call)
    final_response: str = ""

    class Config:
        arbitrary_types_allowed = True
