from __future__ import annotations

from typing import Any, Literal

from pydantic import BaseModel, Field


EntityType = Literal["project", "agenda", "staffing", "archive"]
TargetType = Literal["project", "agenda_item", "message", "assignment", "asset", "field"]


class FieldMapping(BaseModel):
    target: str
    type: str
    required: bool = False
    assignment_role: str | None = None
    map: dict[str, str] = Field(default_factory=dict)


class RegionDefaults(BaseModel):
    country: str | None = None
    operatingRegion: str | None = None
    regionCode: str | None = None


class UpdateImportConfig(BaseModel):
    target: str = "Message"
    channel_strategy: Literal["project_channel", "board_channel"] = "project_channel"
    reply_strategy: Literal["threaded_replies", "flattened"] = "threaded_replies"


class SubitemMappingConfig(BaseModel):
    target: str = "AgendaItem"
    field_map: dict[str, FieldMapping] = Field(default_factory=dict)


class BoardMappingConfig(BaseModel):
    board_name: str
    board_id: str
    entity_type: EntityType
    region_defaults: RegionDefaults = Field(default_factory=RegionDefaults)
    field_map: dict[str, FieldMapping] = Field(default_factory=dict)
    subitems: SubitemMappingConfig | None = None
    updates: UpdateImportConfig | None = None


class MondayColumnValue(BaseModel):
    id: str
    title: str | None = None
    text: str | None = None
    value: str | None = None
    type: str | None = None


class MondayUserRef(BaseModel):
    id: str
    name: str | None = None
    email: str | None = None


class NormalizedProjectRecord(BaseModel):
    source_id: str
    board_id: str
    title: str
    fields: dict[str, Any] = Field(default_factory=dict)
    assignments: list[dict[str, Any]] = Field(default_factory=list)


class NormalizedAgendaRecord(BaseModel):
    source_id: str
    parent_source_id: str | None = None
    title: str
    fields: dict[str, Any] = Field(default_factory=dict)


class NormalizedMessageRecord(BaseModel):
    source_id: str
    parent_source_id: str | None = None
    project_source_id: str | None = None
    author_id: str | None = None
    author_name: str | None = None
    content: str = ""
    created_at: str | None = None
    attachments: list[dict[str, Any]] = Field(default_factory=list)


class ImportCounters(BaseModel):
    boards: int = 0
    items: int = 0
    subitems: int = 0
    updates: int = 0
    replies: int = 0
    assets: int = 0
    users: int = 0
    unresolved_users: int = 0
    errors: int = 0


class ImportRunResult(BaseModel):
    source: str = "monday"
    mode: Literal["dry_run", "full", "delta"] = "dry_run"
    counters: ImportCounters = Field(default_factory=ImportCounters)
    processed_board_ids: list[str] = Field(default_factory=list)
    warnings: list[str] = Field(default_factory=list)
    errors: list[str] = Field(default_factory=list)
    metadata: dict[str, Any] = Field(default_factory=dict)

