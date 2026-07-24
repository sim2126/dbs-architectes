from __future__ import annotations

from typing import Protocol

from app.platform.integrations.monday.schemas import (
    BoardMappingConfig,
    NormalizedMessageRecord,
    NormalizedProjectRecord,
    NormalizedWorkItemRecord,
)


class MondayLoader(Protocol):
    async def upsert_project(self, mapping: BoardMappingConfig, record: NormalizedProjectRecord) -> None: ...

    async def upsert_work_item(self, mapping: BoardMappingConfig, record: NormalizedWorkItemRecord) -> None: ...

    async def upsert_message(self, mapping: BoardMappingConfig, record: NormalizedMessageRecord) -> None: ...


class DryRunLoader:
    async def upsert_project(self, mapping: BoardMappingConfig, record: NormalizedProjectRecord) -> None:
        return None

    async def upsert_work_item(self, mapping: BoardMappingConfig, record: NormalizedWorkItemRecord) -> None:
        return None

    async def upsert_message(self, mapping: BoardMappingConfig, record: NormalizedMessageRecord) -> None:
        return None
