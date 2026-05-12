from __future__ import annotations

from typing import Any

import structlog

from app.platform.integrations.monday.client import MondayClient
from app.platform.integrations.monday.loaders import DryRunLoader, MondayLoader
from app.platform.integrations.monday.normalizers import extract_column_text, normalize_mapped_value
from app.platform.integrations.monday.schemas import (
    BoardMappingConfig,
    ImportCounters,
    ImportRunResult,
    NormalizedAgendaRecord,
    NormalizedMessageRecord,
    NormalizedProjectRecord,
)

logger = structlog.get_logger(__name__)


class MondayImportService:
    def __init__(
        self,
        client: MondayClient | None = None,
        loader: MondayLoader | None = None,
    ) -> None:
        self.client = client or MondayClient()
        self.loader = loader or DryRunLoader()

    async def run_full_import(
        self,
        mappings: list[BoardMappingConfig],
        *,
        mode: str = "dry_run",
    ) -> ImportRunResult:
        result = ImportRunResult(mode=mode, counters=ImportCounters())

        for mapping in mappings:
            result.processed_board_ids.append(mapping.board_id)
            try:
                await self._import_board(mapping, result)
            except Exception as exc:
                logger.error("monday.import_board_failed", board_id=mapping.board_id, error=str(exc))
                result.counters.errors += 1
                result.errors.append(f"{mapping.board_name} ({mapping.board_id}): {exc}")

        return result

    async def _import_board(self, mapping: BoardMappingConfig, result: ImportRunResult) -> None:
        items = await self.client.fetch_items_page(mapping.board_id)
        result.counters.boards += 1

        for item in items:
            normalized_project = self._normalize_project(mapping, item)
            if normalized_project:
                await self.loader.upsert_project(mapping, normalized_project)
                result.counters.items += 1

            if mapping.subitems:
                for subitem in item.get("subitems", []):
                    normalized_subitem = self._normalize_subitem(mapping, subitem, parent_item=item)
                    await self.loader.upsert_agenda_item(mapping, normalized_subitem)
                    result.counters.subitems += 1

            if mapping.updates:
                updates = await self.client.fetch_item_updates(str(item["id"]))
                for update in updates:
                    await self.loader.upsert_message(mapping, self._normalize_update(item, update))
                    result.counters.updates += 1
                    for reply in update.get("replies", []):
                        await self.loader.upsert_message(
                            mapping,
                            self._normalize_reply(item, update, reply),
                        )
                        result.counters.replies += 1
                    result.counters.assets += len(update.get("assets", []))

    def _normalize_project(self, mapping: BoardMappingConfig, item: dict[str, Any]) -> NormalizedProjectRecord | None:
        fields: dict[str, Any] = {}
        assignments: list[dict[str, Any]] = []
        column_values = item.get("column_values", [])

        for source_column, field_mapping in mapping.field_map.items():
            raw_value = item.get("name") if source_column == "item_name" else extract_column_text(column_values, source_column)
            normalized_value = normalize_mapped_value(raw_value, field_mapping)

            if normalized_value is None and field_mapping.required:
                raise ValueError(f"Required field '{source_column}' missing on item {item.get('id')}")

            if field_mapping.type == "people[]":
                if normalized_value:
                    assignments.append(
                        {
                            "source_column": source_column,
                            "value": normalized_value,
                            "role": field_mapping.assignment_role or "member",
                        }
                    )
                continue

            if normalized_value is not None:
                fields[field_mapping.target] = normalized_value

        title = str(fields.get("Project.title") or item.get("name") or "").strip()
        if not title:
            return None

        fields.setdefault("Project.country", mapping.region_defaults.country)
        fields.setdefault("Project.operatingRegion", mapping.region_defaults.operatingRegion)
        fields.setdefault("Project.regionCode", mapping.region_defaults.regionCode)

        return NormalizedProjectRecord(
            source_id=str(item["id"]),
            board_id=mapping.board_id,
            title=title,
            fields=fields,
            assignments=assignments,
        )

    def _normalize_subitem(
        self,
        mapping: BoardMappingConfig,
        subitem: dict[str, Any],
        *,
        parent_item: dict[str, Any],
    ) -> NormalizedAgendaRecord:
        if not mapping.subitems:
            raise ValueError("Subitem mapping is not configured.")

        fields: dict[str, Any] = {}
        column_values = subitem.get("column_values", [])

        for source_column, field_mapping in mapping.subitems.field_map.items():
            raw_value = subitem.get("name") if source_column == "subitem_name" else extract_column_text(column_values, source_column)
            normalized_value = normalize_mapped_value(raw_value, field_mapping)
            if normalized_value is not None:
                fields[field_mapping.target] = normalized_value

        return NormalizedAgendaRecord(
            source_id=str(subitem["id"]),
            parent_source_id=str(parent_item["id"]),
            title=str(fields.get("AgendaItem.title") or subitem.get("name") or "").strip(),
            fields=fields,
        )

    def _normalize_update(self, item: dict[str, Any], update: dict[str, Any]) -> NormalizedMessageRecord:
        creator = update.get("creator") or {}
        return NormalizedMessageRecord(
            source_id=str(update["id"]),
            project_source_id=str(item["id"]),
            author_id=str(creator.get("id")) if creator.get("id") else None,
            author_name=creator.get("name"),
            content=update.get("text_body") or update.get("body") or "",
            created_at=update.get("created_at"),
            attachments=update.get("assets", []),
        )

    def _normalize_reply(
        self,
        item: dict[str, Any],
        update: dict[str, Any],
        reply: dict[str, Any],
    ) -> NormalizedMessageRecord:
        creator = reply.get("creator") or {}
        return NormalizedMessageRecord(
            source_id=str(reply["id"]),
            parent_source_id=str(update["id"]),
            project_source_id=str(item["id"]),
            author_id=str(creator.get("id")) if creator.get("id") else None,
            author_name=creator.get("name"),
            content=reply.get("text_body") or reply.get("body") or "",
            created_at=reply.get("created_at"),
        )

