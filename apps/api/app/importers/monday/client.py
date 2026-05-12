from __future__ import annotations

from typing import Any

import httpx
import structlog

from app.core.config import settings

logger = structlog.get_logger(__name__)


class MondayApiError(RuntimeError):
    pass


class MondayClient:
    def __init__(
        self,
        token: str | None = None,
        base_url: str | None = None,
        timeout: float | None = None,
    ) -> None:
        self.token = token or settings.MONDAY_API_TOKEN
        self.base_url = base_url or settings.MONDAY_API_URL
        self.timeout = timeout or settings.MONDAY_REQUEST_TIMEOUT_SECONDS

        if not self.token:
            raise MondayApiError("MONDAY_API_TOKEN is not configured.")

    async def execute(self, query: str, variables: dict[str, Any] | None = None) -> dict[str, Any]:
        headers = {
            "Authorization": self.token,
            "Content-Type": "application/json",
            "API-Version": "2025-10",
        }
        payload = {"query": query, "variables": variables or {}}

        async with httpx.AsyncClient(timeout=self.timeout) as client:
            response = await client.post(self.base_url, json=payload, headers=headers)
            response.raise_for_status()
            data = response.json()

        if data.get("errors"):
            logger.error("monday.api_error", errors=data["errors"])
            raise MondayApiError(str(data["errors"]))

        return data.get("data", {})

    async def fetch_boards(self, board_ids: list[str]) -> list[dict[str, Any]]:
        query = """
        query ($boardIds: [ID!]) {
          boards(ids: $boardIds) {
            id
            name
            state
            board_kind
            columns {
              id
              title
              type
            }
          }
        }
        """
        data = await self.execute(query, {"boardIds": board_ids})
        return data.get("boards", [])

    async def fetch_items_page(self, board_id: str, limit: int | None = None) -> list[dict[str, Any]]:
        query = """
        query ($boardId: ID!, $limit: Int!) {
          boards(ids: [$boardId]) {
            id
            items_page(limit: $limit) {
              items {
                id
                name
                updated_at
                created_at
                group {
                  id
                  title
                }
                column_values {
                  id
                  type
                  text
                  value
                }
                subitems {
                  id
                  name
                  updated_at
                  created_at
                  column_values {
                    id
                    type
                    text
                    value
                  }
                }
              }
            }
          }
        }
        """
        data = await self.execute(
            query,
            {"boardId": board_id, "limit": limit or settings.MONDAY_DEFAULT_PAGE_SIZE},
        )
        boards = data.get("boards", [])
        if not boards:
            return []
        return boards[0].get("items_page", {}).get("items", [])

    async def fetch_item_updates(self, item_id: str) -> list[dict[str, Any]]:
        query = """
        query ($itemId: [ID!]) {
          items(ids: $itemId) {
            id
            updates {
              id
              body
              text_body
              created_at
              creator {
                id
                name
                email
              }
              replies {
                id
                body
                text_body
                created_at
                creator {
                  id
                  name
                  email
                }
              }
              assets {
                id
                name
                file_extension
                public_url
                url
              }
            }
          }
        }
        """
        data = await self.execute(query, {"itemId": [item_id]})
        items = data.get("items", [])
        if not items:
            return []
        return items[0].get("updates", [])
