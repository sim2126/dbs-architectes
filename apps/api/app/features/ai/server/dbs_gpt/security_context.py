from contextvars import ContextVar, Token

_user_id: ContextVar[str | None] = ContextVar("agent_user_id", default=None)
_user_role: ContextVar[str] = ContextVar("agent_user_role", default="viewer")


def set_agent_subject(user_id: str, role: str) -> tuple[Token, Token]:
    return _user_id.set(user_id), _user_role.set(role)


def reset_agent_subject(tokens: tuple[Token, Token]) -> None:
    _user_id.reset(tokens[0])
    _user_role.reset(tokens[1])


def require_agent_subject() -> tuple[str, str]:
    user_id = _user_id.get()
    if not user_id:
        raise RuntimeError("Agent subject is unavailable")
    return user_id, _user_role.get()
