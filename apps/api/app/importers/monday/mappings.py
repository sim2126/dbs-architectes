from __future__ import annotations

import json
from pathlib import Path

from app.importers.monday.schemas import BoardMappingConfig


def load_board_mapping(path: str | Path) -> BoardMappingConfig:
    mapping_path = Path(path)
    payload = json.loads(mapping_path.read_text(encoding="utf-8"))
    return BoardMappingConfig.model_validate(payload)


def load_board_mappings(paths: list[str | Path]) -> list[BoardMappingConfig]:
    return [load_board_mapping(path) for path in paths]

