"""
DBS Chat Agent — Aria
Production-grade agentic AI with live access to project data, team threads,
agenda, workload, and activity logs.
"""
from .agent import run_chat_agent
from .title_generator import generate_chat_title

__all__ = ["run_chat_agent", "generate_chat_title"]
