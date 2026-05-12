# ── Base ──────────────────────────────────────────────────────────────────────
FROM python:3.12-slim AS base

ENV PYTHONDONTWRITEBYTECODE=1 \
    PYTHONUNBUFFERED=1 \
    UV_COMPILE_BYTECODE=1 \
    UV_LINK_MODE=copy \
    PATH="/root/.local/bin:$PATH"

WORKDIR /app

# Install uv
COPY --from=ghcr.io/astral-sh/uv:0.5.11 /uv /uvx /bin/

# System deps (only what asyncpg + hiredis need)
RUN apt-get update && apt-get install -y --no-install-recommends \
    build-essential \
    libpq-dev \
    && rm -rf /var/lib/apt/lists/*

# ── Dependencies ──────────────────────────────────────────────────────────────
FROM base AS deps

# Copy lockfile + project manifest first (layer cache)
COPY pyproject.toml uv.lock ./

# Install production deps from lockfile — no network surprise
RUN uv sync --frozen --no-dev

# ── Production image ──────────────────────────────────────────────────────────
FROM deps AS production

COPY . .

# Non-root user
RUN addgroup --system app && adduser --system --group app
USER app

EXPOSE 8000

CMD ["uv", "run", "uvicorn", "app.main:app", \
     "--host", "0.0.0.0", "--port", "8000", \
     "--workers", "4", "--loop", "uvloop", "--http", "httptools"]
