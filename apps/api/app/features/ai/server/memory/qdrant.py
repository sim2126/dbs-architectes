"""
Qdrant vector memory for DBS GPT agents.
Handles storing and retrieving semantic memories (regulations, project notes, conversation history).
"""
import uuid

import structlog
from langchain_openai import OpenAIEmbeddings
from pydantic import SecretStr
from qdrant_client import AsyncQdrantClient
from qdrant_client.models import (
    Distance,
    FieldCondition,
    Filter,
    MatchValue,
    PointStruct,
    VectorParams,
)

from app.platform.config.config import settings

logger = structlog.get_logger(__name__)

_client: AsyncQdrantClient | None = None
_embedder: OpenAIEmbeddings | None = None


def get_qdrant() -> AsyncQdrantClient:
    global _client
    if _client is None:
        _client = AsyncQdrantClient(host=settings.QDRANT_HOST, port=settings.QDRANT_PORT)
    return _client


def get_embedder() -> OpenAIEmbeddings:
    global _embedder
    if _embedder is None:
        _embedder = OpenAIEmbeddings(
            model=settings.OPENAI_EMBEDDING_MODEL,
            api_key=SecretStr(settings.OPENAI_API_KEY),
        )
    return _embedder


COLLECTIONS = {
    "memory": settings.QDRANT_COLLECTION_NAME,
    "regulations": "dbs_regulations",
    "project_notes": "dbs_project_notes",
}


async def ensure_collections() -> None:
    """Create Qdrant collections if they don't exist."""
    client = get_qdrant()
    existing = {c.name for c in (await client.get_collections()).collections}
    for name in COLLECTIONS.values():
        if name not in existing:
            await client.create_collection(
                collection_name=name,
                vectors_config=VectorParams(
                    size=settings.QDRANT_VECTOR_SIZE,
                    distance=Distance.COSINE,
                ),
            )
            logger.info("qdrant.collection_created", name=name)


async def store_memory(
    content: str,
    metadata: dict,
    collection: str = "memory",
) -> str:
    """Embed and store a memory. Returns the point ID."""
    client = get_qdrant()
    embedder = get_embedder()
    collection_name = COLLECTIONS.get(collection, collection)

    vector = await embedder.aembed_query(content)
    point_id = str(uuid.uuid4())

    await client.upsert(
        collection_name=collection_name,
        points=[PointStruct(id=point_id, vector=vector, payload={**metadata, "content": content})],
    )
    return point_id


async def search_memory(
    query: str,
    collection: str = "memory",
    limit: int = 5,
    filter_conditions: dict | None = None,
) -> list[dict]:
    """Semantic search over stored memories. Returns ranked results."""
    client = get_qdrant()
    embedder = get_embedder()
    collection_name = COLLECTIONS.get(collection, collection)

    query_vector = await embedder.aembed_query(query)

    qdrant_filter = None
    if filter_conditions:
        qdrant_filter = Filter(
            must=[
                FieldCondition(key=k, match=MatchValue(value=v))
                for k, v in filter_conditions.items()
            ]
        )

    results = await client.search(
        collection_name=collection_name,
        query_vector=query_vector,
        limit=limit,
        query_filter=qdrant_filter,
        with_payload=True,
    )

    memories = []
    for result in results:
        payload = result.payload or {}
        memories.append({
            "id": str(result.id),
            "score": result.score,
            "content": payload.get("content", ""),
            "source": payload.get("source", "unknown"),
            **{k: v for k, v in payload.items() if k not in ("content", "source")},
        })
    return memories


async def delete_memory(point_id: str, collection: str = "memory") -> None:
    client = get_qdrant()
    collection_name = COLLECTIONS.get(collection, collection)
    await client.delete(collection_name=collection_name, points_selector=[point_id])
