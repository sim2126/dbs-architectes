from __future__ import annotations

import os
import re
import uuid
from pathlib import Path
from urllib.parse import urlparse

import asyncpg
import pytest

BASELINE_PATH = (
    Path(__file__).resolve().parents[3]
    / "app"
    / "prisma"
    / "migrations"
    / "20260724000000_baseline"
    / "migration.sql"
)
WORK_ITEM_MIGRATION_PATHS = (
    BASELINE_PATH.parent.parent / "20260724010000_unify_work_items" / "migration.sql",
    BASELINE_PATH.parent.parent
    / "20260724020000_preserve_work_item_compatibility"
    / "migration.sql",
)


def _database_identity(url: str) -> tuple[str, int, str]:
    parsed = urlparse(url)
    return (
        (parsed.hostname or "").lower(),
        parsed.port or 5432,
        parsed.path.removeprefix("/").lower(),
    )


def _test_database_url() -> str:
    url = os.getenv("WORK_ITEM_TEST_DATABASE_URL")
    if not url:
        pytest.skip("WORK_ITEM_TEST_DATABASE_URL is not configured for PostgreSQL integration tests.")

    parsed = urlparse(url)
    database_name = parsed.path.removeprefix("/").lower()
    if parsed.hostname not in {"127.0.0.1", "::1", "localhost"} or not database_name.endswith(
        "_test"
    ):
        pytest.fail(
            "WORK_ITEM_TEST_DATABASE_URL must point to localhost and a database ending in _test."
        )
    production_url = os.getenv("DATABASE_URL")
    if production_url and _database_identity(url) == _database_identity(production_url):
        pytest.fail("WORK_ITEM_TEST_DATABASE_URL must not equal DATABASE_URL.")
    return url


async def _apply_work_item_migrations(connection: asyncpg.Connection) -> None:
    for migration_path in WORK_ITEM_MIGRATION_PATHS:
        await connection.execute(migration_path.read_text(encoding="utf-8"))


@pytest.mark.asyncio
async def test_work_item_migration_is_repeatable_and_preserves_legacy_reads() -> None:
    schema = f"work_item_test_{uuid.uuid4().hex}"
    assert re.fullmatch(r"work_item_test_[0-9a-f]{32}", schema)

    connection = await asyncpg.connect(_test_database_url())
    try:
        await connection.execute(f'CREATE SCHEMA "{schema}"')
        await connection.execute(f'SET search_path TO "{schema}"')
        await connection.execute(
            """
            CREATE TABLE "User" (id TEXT PRIMARY KEY);
            CREATE TABLE "Project" (id TEXT PRIMARY KEY);
            CREATE TABLE "Task" (
                id TEXT PRIMARY KEY,
                "userId" TEXT NOT NULL,
                title TEXT NOT NULL,
                description TEXT,
                "dueDate" TIMESTAMP(3),
                status TEXT NOT NULL,
                priority TEXT NOT NULL,
                "projectId" TEXT,
                position DOUBLE PRECISION NOT NULL,
                "completedAt" TIMESTAMP(3),
                "createdAt" TIMESTAMP(3) NOT NULL,
                "updatedAt" TIMESTAMP(3) NOT NULL
            );
            CREATE TABLE "AgendaItem" (
                id TEXT PRIMARY KEY,
                title TEXT NOT NULL,
                description TEXT,
                date TIMESTAMP(3) NOT NULL,
                "endDate" TIMESTAMP(3),
                type TEXT NOT NULL,
                priority TEXT NOT NULL,
                status TEXT NOT NULL,
                "projectId" TEXT,
                "userId" TEXT NOT NULL,
                color TEXT,
                "allDay" BOOLEAN NOT NULL,
                "googleEventId" TEXT,
                "sourceSystem" TEXT,
                "sourceId" TEXT,
                "createdAt" TIMESTAMP(3) NOT NULL,
                "updatedAt" TIMESTAMP(3) NOT NULL
            );
            INSERT INTO "User" (id) VALUES ('user-1');
            INSERT INTO "Project" (id) VALUES ('project-1');
            INSERT INTO "Task" (
                id, "userId", title, description, "dueDate", status, priority,
                "projectId", position, "completedAt", "createdAt", "updatedAt"
            ) VALUES (
                'task-1', 'user-1', 'Issue drawings', 'Coordinated set',
                '2026-08-01 12:00:00', 'doing', 'high', 'project-1', 3, NULL,
                '2026-07-20 08:00:00', '2026-07-21 09:00:00'
            );
            INSERT INTO "AgendaItem" (
                id, title, description, date, "endDate", type, priority, status,
                "projectId", "userId", color, "allDay", "googleEventId",
                "sourceSystem", "sourceId", "createdAt", "updatedAt"
            ) VALUES
                (
                    'agenda-single', 'Permit deadline', NULL,
                    '2026-08-02 10:30:00', NULL, 'deadline', 'critical', 'pending',
                    'project-1', 'user-1', '#ef4444', false, NULL, 'monday', 'source-1',
                    '2026-07-20 08:00:00', '2026-07-21 09:00:00'
                ),
                (
                    'agenda-range', 'Design review', 'Coordination meeting',
                    '2026-08-03 09:00:00', '2026-08-03 10:00:00', 'meeting',
                    'medium', 'pending', 'project-1', 'user-1', NULL, false, 'event-1',
                    NULL, NULL, '2026-07-20 08:00:00', '2026-07-21 09:00:00'
                ),
                (
                    'agenda-call', 'Client call', NULL,
                    '2026-08-04 09:00:00', NULL, 'call',
                    'medium', 'pending', 'project-1', 'user-1', NULL, false, NULL,
                    NULL, NULL, '2026-07-20 08:00:00', '2026-07-21 09:00:00'
                );
            """
        )

        legacy_task = dict(await connection.fetchrow('SELECT * FROM "Task" WHERE id = $1', "task-1"))
        legacy_agenda = {
            row["id"]: dict(row)
            for row in await connection.fetch('SELECT * FROM "AgendaItem" ORDER BY id')
        }

        await _apply_work_item_migrations(connection)

        task = await connection.fetchrow(
            'SELECT * FROM "WorkItem" WHERE "legacyTaskId" = $1', "task-1"
        )
        assert task is not None
        assert {
            "id": task["id"],
            "userId": task["userId"],
            "title": task["title"],
            "description": task["description"],
            "dueDate": task["dueDate"],
            "status": task["status"],
            "priority": task["priority"],
            "projectId": task["projectId"],
            "position": task["position"],
            "completedAt": task["completedAt"],
            "createdAt": task["createdAt"],
            "updatedAt": task["updatedAt"],
        } == legacy_task

        work_agenda = await connection.fetch(
            'SELECT * FROM "WorkItem" WHERE "legacyAgendaId" IS NOT NULL ORDER BY id'
        )
        assert len(work_agenda) == len(legacy_agenda)
        for item in work_agenda:
            legacy_projection = {
                "id": item["id"],
                "title": item["title"],
                "description": item["description"],
                "date": item["startDate"] or item["dueDate"],
                "endDate": item["dueDate"] if item["startDate"] else None,
                "type": item["legacyAgendaType"] or item["type"],
                "priority": item["priority"],
                "status": item["status"],
                "projectId": item["projectId"],
                "userId": item["userId"],
                "color": item["color"],
                "allDay": item["allDay"],
                "googleEventId": item["googleEventId"],
                "sourceSystem": item["sourceSystem"],
                "sourceId": item["sourceId"],
                "createdAt": item["createdAt"],
                "updatedAt": item["updatedAt"],
            }
            assert legacy_projection == legacy_agenda[item["id"]]

        call = next(item for item in work_agenda if item["id"] == "agenda-call")
        assert call["type"] == "meeting"
        assert call["legacyAgendaType"] == "call"

        indexes = {
            row["indexname"]
            for row in await connection.fetch(
                "SELECT indexname FROM pg_indexes WHERE schemaname = current_schema()"
            )
        }
        assert {
            "WorkItem_userId_startDate_idx",
            "WorkItem_startDate_status_idx",
            "WorkItem_projectId_startDate_idx",
        } <= indexes

        await connection.execute(
            'UPDATE "WorkItem" SET title = $1 WHERE id = $2',
            "Edited after cut-over",
            "task-1",
        )
        await _apply_work_item_migrations(connection)
        assert (
            await connection.fetchval('SELECT title FROM "WorkItem" WHERE id = $1', "task-1")
            == "Edited after cut-over"
        )
        assert await connection.fetchval('SELECT count(*) FROM "WorkItem"') == 4

        with pytest.raises(asyncpg.CheckViolationError):
            await connection.execute(
                """
                INSERT INTO "WorkItem" (
                    id, "userId", "legacyTaskId", title, type, "updatedAt"
                ) VALUES ('invalid-origin', 'user-1', 'different-id', 'Invalid', 'task', NOW())
                """
            )

        await connection.execute(
            """
            INSERT INTO "WorkItem" (
                id, "userId", "projectId", "parentId", title, type,
                position, "updatedAt"
            ) VALUES
                ('parent', 'user-1', 'project-1', NULL, 'Parent', 'task', 1, NOW()),
                ('child', 'user-1', 'project-1', 'parent', 'Child', 'task', 1, NOW()),
                ('child-later', 'user-1', 'project-1', 'parent', 'Child later', 'task', 2, NOW()),
                ('grandchild', 'user-1', 'project-1', 'child', 'Grandchild', 'task', 1, NOW())
            """
        )
        hierarchy = await connection.fetch(
            """
            WITH RECURSIVE tree AS (
                SELECT id, "parentId", position, 0 AS depth
                FROM "WorkItem"
                WHERE id = 'parent'
                UNION ALL
                SELECT child.id, child."parentId", child.position, tree.depth + 1
                FROM "WorkItem" child
                JOIN tree ON child."parentId" = tree.id
            )
            SELECT id, depth FROM tree ORDER BY depth, position, id
            """
        )
        assert [(row["id"], row["depth"]) for row in hierarchy] == [
            ("parent", 0),
            ("child", 1),
            ("child-later", 1),
            ("grandchild", 2),
        ]

        with pytest.raises(asyncpg.CheckViolationError):
            await connection.execute(
                'UPDATE "WorkItem" SET "parentId" = id WHERE id = $1', "parent"
            )

        await connection.execute('DELETE FROM "WorkItem" WHERE id = $1', "parent")
        assert (
            await connection.fetchval(
                'SELECT count(*) FROM "WorkItem" WHERE id = ANY($1::text[])',
                ["parent", "child", "child-later", "grandchild"],
            )
            == 0
        )
    finally:
        if connection.is_in_transaction():
            await connection.execute("ROLLBACK")
        await connection.execute("RESET search_path")
        await connection.execute(f'DROP SCHEMA IF EXISTS "{schema}" CASCADE')
        await connection.close()


@pytest.mark.asyncio
async def test_fresh_migration_history_builds_the_work_item_schema() -> None:
    schema = f"work_item_test_{uuid.uuid4().hex}"
    assert re.fullmatch(r"work_item_test_[0-9a-f]{32}", schema)

    connection = await asyncpg.connect(_test_database_url())
    try:
        await connection.execute(f'CREATE SCHEMA "{schema}"')
        await connection.execute(f'SET search_path TO "{schema}"')
        await connection.execute(BASELINE_PATH.read_text(encoding="utf-8"))
        await _apply_work_item_migrations(connection)

        columns = {
            row["column_name"]
            for row in await connection.fetch(
                """
                SELECT column_name
                FROM information_schema.columns
                WHERE table_schema = current_schema() AND table_name = 'WorkItem'
                """
            )
        }
        assert {
            "parentId",
            "legacyTaskId",
            "legacyAgendaId",
            "legacyAgendaType",
            "startDate",
            "dueDate",
        } <= columns

        work_item_types = await connection.fetchval(
            """
            SELECT array_agg(enumlabel ORDER BY enumsortorder)
            FROM pg_enum
            WHERE enumtypid = '"WorkItemType"'::regtype
            """
        )
        assert work_item_types == ["task", "meeting", "milestone", "deadline"]

        # The additive migrations themselves remain safe to replay after a
        # complete fresh deployment.
        await _apply_work_item_migrations(connection)
    finally:
        if connection.is_in_transaction():
            await connection.execute("ROLLBACK")
        await connection.execute("RESET search_path")
        await connection.execute(f'DROP SCHEMA IF EXISTS "{schema}" CASCADE')
        await connection.close()
