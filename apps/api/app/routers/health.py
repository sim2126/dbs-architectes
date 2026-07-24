import structlog
from fastapi import APIRouter
from sqlalchemy import text

from app.platform.cache.redis import get_redis
from app.platform.config.config import settings
from app.platform.db.database import AsyncSessionLocal

logger = structlog.get_logger(__name__)
router = APIRouter(tags=["health"])


@router.get("/health")
async def health_check():
    """Basic liveness check — used by load balancer."""
    return {"status": "ok", "version": settings.APP_VERSION}


@router.get("/health/ready")
async def readiness_check():
    """
    Deep readiness check — verifies all dependencies are reachable.
    Used by Kubernetes/ECS before routing traffic to this instance.
    """
    checks = {}

    # PostgreSQL
    try:
        async with AsyncSessionLocal() as db:
            await db.execute(text("SELECT 1"))
        checks["postgres"] = "ok"
    except Exception as e:
        checks["postgres"] = f"error: {e}"

    # Redis
    try:
        r = await get_redis()
        await r.ping()
        checks["redis"] = "ok"
    except Exception as e:
        checks["redis"] = f"error: {e}"

    # Qdrant
    try:
        from app.features.ai.server.memory.qdrant import get_qdrant
        client = get_qdrant()
        await client.get_collections()
        checks["qdrant"] = "ok"
    except Exception as e:
        checks["qdrant"] = f"error: {e}"

    all_ok = all(v == "ok" for v in checks.values())
    return {
        "status": "ready" if all_ok else "degraded",
        "checks": checks,
    }
