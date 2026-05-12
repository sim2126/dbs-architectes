"""
Tests for project-related agent tools.

Tools are exposed as langchain `@tool` objects — we invoke them through
`.ainvoke(...)` so we exercise the same code path the LangGraph runtime uses.
"""
from __future__ import annotations

import pytest

from app.features.ai.server.dbs_gpt.tools import (
    get_project_team,
    get_projects,
    update_project_phase,
)


class TestGetProjects:
    async def test_returns_friendly_message_when_no_projects(self, mock_db_session):
        mock_db_session.set_rows([])
        out = await get_projects.ainvoke({})
        assert out == "No projects found matching those criteria."

    async def test_formats_rows_with_brackets_and_phase(self, mock_db_session):
        mock_db_session.set_rows([
            {
                "code": "DBS-2025-001", "title": "Le Saillen",
                "phase": "ETUDE/AP", "client": "Private", "commune": "Salins",
                "billing": None,
            },
            {
                "code": "DBS-2024-002", "title": "Lamberson Buildings",
                "phase": "TERMINATO", "client": None, "commune": "Sierre",
                "billing": "Completo",
            },
        ])
        out = await get_projects.ainvoke({})
        assert "[DBS-2025-001]" in out
        assert "Le Saillen" in out
        assert "Phase: ETUDE/AP" in out
        assert "[DBS-2024-002]" in out
        assert "Billing: Completo" in out
        assert "N/A" in out  # client was None

    async def test_phase_filter_normalises_whitespace(self, mock_db_session):
        mock_db_session.set_rows([])
        await get_projects.ainvoke({"phase": "ETUDE / AP"})
        # Confirm the SQL was parameterised with the normalised value
        _query, params = mock_db_session.executed_queries[-1]
        assert params["phase"] == "ETUDE/AP"


class TestUpdateProjectPhase:
    async def test_rejects_unknown_phase_with_sorted_valid_list(self, mock_db_session):
        out = await update_project_phase.ainvoke({
            "project_code": "DBS-2025-001",
            "new_phase": "not-a-real-phase",
        })
        assert out.startswith("Invalid phase 'not-a-real-phase'")
        # Valid list must be alphabetised for a stable agent-visible message
        assert "CHANTIER" in out and "TERMINATO" in out

    async def test_accepts_whitespace_and_case_variants(self, mock_db_session):
        mock_db_session.set_rows([{"title": "Le Saillen"}])
        out = await update_project_phase.ainvoke({
            "project_code": "DBS-2025-001",
            "new_phase": "etude / ap",
        })
        assert "Le Saillen" in out
        assert "moved to phase: ETUDE/AP" in out
        assert mock_db_session.committed is True

    async def test_reports_not_found_when_code_missing(self, mock_db_session):
        mock_db_session.set_rows([])
        out = await update_project_phase.ainvoke({
            "project_code": "DBS-9999-999",
            "new_phase": "MAE",
        })
        assert "not found" in out
        assert mock_db_session.committed is False


class TestGetProjectTeam:
    async def test_returns_not_found_when_project_unknown(self, mock_db_session):
        # Both the lookup query and the team query see empty rows,
        # so the tool bails out at the lookup with a "no project" message.
        mock_db_session.set_rows([])
        out = await get_project_team.ainvoke({"project_code": "DBS-1999-001"})
        assert "No project matching 'DBS-1999-001'" in out

    async def test_renders_team_roster(self, mock_db_session):
        mock_db_session.set_rows([
            {
                "name": "Giulio Sovran", "role": "director",
                "email": "giulio.sovran@dbsarc.com",
                "project_role": "director",
            },
            {
                "name": "Florencia Schilling", "role": "director",
                "email": "florencia.schilling@dbsarc.com",
                "project_role": None,
            },
        ])
        out = await get_project_team.ainvoke({"project_code": "DBS-2025-001"})
        assert "Giulio Sovran" in out
        assert "giulio.sovran@dbsarc.com" in out
        assert "Project role: Member" in out  # falls back when None
