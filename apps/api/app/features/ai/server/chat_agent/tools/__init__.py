"""
Tools available to the DBS Chat Agent (Aria).
Each tool is an async LangChain @tool that queries the live PostgreSQL database.
"""
from .get_activity_log import get_activity_log
from .get_agenda import get_agenda
from .get_project_details import get_project_details
from .get_project_thread import get_project_thread
from .get_statistics import get_statistics
from .get_team_messages import get_team_messages
from .get_team_workload import get_team_workload
from .search_projects import search_projects

ALL_TOOLS = [
    search_projects,
    get_project_details,
    get_project_thread,
    get_team_messages,
    get_agenda,
    get_team_workload,
    get_statistics,
    get_activity_log,
]

__all__ = ["ALL_TOOLS"]
