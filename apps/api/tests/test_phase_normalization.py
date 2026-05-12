"""
Unit tests for phase-value normalization.

These are the tightest, fastest tests in the suite — pure functions, no I/O.
The bug they pin down was real: the agent used to validate "ETUDE / AP" (with
spaces) but the seeded DB stores "ETUDE/AP" (no spaces), so the agent would
reject every real phase it encountered.
"""
from __future__ import annotations

import pytest

from app.agents.dbs_gpt.tools import VALID_PHASES, _normalize_phase


class TestNormalizePhase:
    @pytest.mark.parametrize(
        "raw, expected",
        [
            ("ETUDE / AP", "ETUDE/AP"),
            ("ETUDE/AP", "ETUDE/AP"),
            ("etude/ap", "ETUDE/AP"),
            ("  ETUDE  /  AP  ", "ETUDE/AP"),
            ("EXE / DG / DV / 3D", "EXE/DG/DV/3D"),
            ("chantier", "CHANTIER"),
            ("Terminato", "TERMINATO"),
            ("CONCORSO", "CONCORSO"),
        ],
    )
    def test_normalises_common_input_variants(self, raw: str, expected: str):
        assert _normalize_phase(raw) == expected

    def test_all_valid_phases_are_fixed_points(self):
        """Normalizing an already-normalized phase must be a no-op."""
        for phase in VALID_PHASES:
            assert _normalize_phase(phase) == phase

    def test_seeded_db_phases_are_accepted(self):
        """The actual values seed-dbsarc.ts writes must all be in VALID_PHASES."""
        seeded = {"ETUDE/AP", "TERMINATO", "CONCORSO"}
        assert seeded <= VALID_PHASES, (
            f"These phases exist in seeded data but agent will reject them: "
            f"{seeded - VALID_PHASES}"
        )

    def test_ui_phase_values_are_accepted(self):
        """The phase values the Next.js UI renders must all round-trip."""
        ui_values = [
            "ETUDE / AP", "MAE", "CHANTIER",
            "EXE / DG / DV / 3D", "TERMINATO", "STUCK",
        ]
        for v in ui_values:
            assert _normalize_phase(v) in VALID_PHASES, (
                f"UI renders phase {v!r} but agent rejects it"
            )
