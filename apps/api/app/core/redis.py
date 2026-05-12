import json
from typing import Any

import redis.asyncio as aioredis
import structlog
from redis.asyncio import Redis

from app.core.config import settings

logger = structlog.get_logger(__name__)

_redis_client: Redis | None = None


async def get_redis() -> Redis:
    global _redis_client
    if _redis_client is None:
        _redis_client = aioredis.from_url(
            settings.REDIS_URL,
            encoding="utf-8",
            decode_responses=True,
            max_connections=50,
        )
    return _redis_client


async def close_redis() -> None:
    global _redis_client
    if _redis_client:
        await _redis_client.aclose()
        _redis_client = None


# ── Cache helpers ─────────────────────────────────────────────────────────────

async def cache_get(key: str) -> Any | None:
    r = await get_redis()
    val = await r.get(key)
    if val:
        return json.loads(val)
    return None


async def cache_set(key: str, value: Any, ttl: int = settings.REDIS_CACHE_TTL) -> None:
    r = await get_redis()
    await r.setex(key, ttl, json.dumps(value, default=str))


async def cache_delete(key: str) -> None:
    r = await get_redis()
    await r.delete(key)


async def cache_invalidate_pattern(pattern: str) -> int:
    r = await get_redis()
    deleted = 0
    batch: list[str] = []
    async for key in r.scan_iter(match=pattern, count=500):
        batch.append(key)
        if len(batch) >= 500:
            deleted += await r.delete(*batch)
            batch.clear()
    if batch:
        deleted += await r.delete(*batch)
    return deleted


# ── Rate limiting ─────────────────────────────────────────────────────────────

async def check_rate_limit(user_id: str, action: str, limit: int, window: int = 60) -> bool:
    """Returns True if request is allowed, False if rate limited.

    If Redis is unreachable we allow the request and log — rate limiting is a
    safety net, not a critical path. Don't block real users on infra blips.
    """
    try:
        r = await get_redis()
        key = f"ratelimit:{action}:{user_id}"
        pipe = r.pipeline()
        pipe.incr(key)
        pipe.expire(key, window)
        results = await pipe.execute()
        count = results[0]
    except Exception as e:
        logger.warning("rate_limit.redis_unavailable", user_id=user_id, action=action, error=str(e))
        return True
    if count > limit:
        logger.warning("rate_limit.exceeded", user_id=user_id, action=action, count=count)
        return False
    return True


# ── Pub/Sub for real-time task updates ────────────────────────────────────────

async def publish_task_update(task_id: str, payload: dict) -> None:
    r = await get_redis()
    await r.publish(f"task:{task_id}", json.dumps(payload, default=str))


async def publish_user_update(user_id: str, payload: dict) -> None:
    r = await get_redis()
    await r.publish(f"user:{user_id}", json.dumps(payload, default=str))
