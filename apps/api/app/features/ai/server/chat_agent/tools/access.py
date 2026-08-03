"""Request-subject access helpers shared by Aria's database tools."""

from app.features.ai.server.dbs_gpt.security_context import require_agent_subject

_WORKSPACE_PROJECT_ROLES = frozenset({"admin", "super_admin"})


def require_tool_subject() -> tuple[str, bool]:
    """Return the active subject and whether it has workspace project access."""

    user_id, role = require_agent_subject()
    return user_id, role in _WORKSPACE_PROJECT_ROLES
