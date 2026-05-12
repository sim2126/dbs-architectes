from __future__ import annotations

import json
from typing import Any

from app.importers.monday.schemas import FieldMapping


def parse_column_value(raw_value: Any) -> Any:
    if raw_value is None:
        return None
    if isinstance(raw_value, (dict, list)):
        return raw_value
    if not isinstance(raw_value, str):
        return raw_value
    try:
        return json.loads(raw_value)
    except json.JSONDecodeError:
        return raw_value


def extract_column_text(column_values: list[dict[str, Any]], column_id: str) -> str | None:
    for column in column_values:
        if column.get("id") == column_id:
            if column.get("text"):
                return str(column["text"]).strip() or None
            parsed = parse_column_value(column.get("value"))
            if isinstance(parsed, dict):
                return (
                    parsed.get("text")
                    or parsed.get("label")
                    or parsed.get("value")
                )
            return str(parsed).strip() or None
    return None


def normalize_mapped_value(value: Any, field_mapping: FieldMapping) -> Any:
    if value is None:
        return None

    if field_mapping.map and isinstance(value, str):
        return field_mapping.map.get(value, value)

    if field_mapping.type == "int":
        try:
            return int(value)
        except (TypeError, ValueError):
            return None

    if field_mapping.type == "float":
        try:
            return float(value)
        except (TypeError, ValueError):
            return None

    if field_mapping.type == "string":
        return str(value).strip()

    return value

