"""
Architecture-only load test for the DBS Friday FastAPI backend.

Measures the HTTP + DB + Redis + Qdrant path — NOT the LLM path, because:
  1. LLM latency is dominated by OpenAI, not our engineering.
  2. It would burn OpenAI credits without measuring anything we control.
  3. The LangGraph Studio UI already shows per-request LLM duration live.

This test targets the readiness endpoint (/health/ready) which exercises:
  - FastAPI request handling + middleware
  - SQLAlchemy async pool → Neon Postgres round-trip
  - Redis async client → docker Redis ping
  - Qdrant client → docker Qdrant collections listing

If p95 here is low under concurrency, the architecture claim holds.

Run:
  cd apps/api && uv run python scripts/load_test.py --concurrency 50 --requests 500
"""
from __future__ import annotations

import argparse
import asyncio
import statistics
import time
from contextlib import suppress
from dataclasses import dataclass, field
from pathlib import Path

import httpx


@dataclass
class Result:
    latencies_ms: list[float] = field(default_factory=list)
    failures: int = 0
    errors: dict[str, int] = field(default_factory=dict)


async def fire_one(client: httpx.AsyncClient, path: str, result: Result) -> None:
    start = time.perf_counter()
    try:
        r = await client.get(path, timeout=10.0)
        elapsed_ms = (time.perf_counter() - start) * 1000
        if r.status_code >= 500:
            result.failures += 1
            key = f"HTTP {r.status_code}"
            result.errors[key] = result.errors.get(key, 0) + 1
        else:
            result.latencies_ms.append(elapsed_ms)
    except Exception as e:
        result.failures += 1
        key = type(e).__name__
        result.errors[key] = result.errors.get(key, 0) + 1


async def worker(
    queue: asyncio.Queue[str], client: httpx.AsyncClient, result: Result
) -> None:
    while True:
        try:
            path = queue.get_nowait()
        except asyncio.QueueEmpty:
            return
        await fire_one(client, path, result)
        queue.task_done()


def format_pct(values: list[float], q: float) -> str:
    if not values:
        return "—"
    sorted_vals = sorted(values)
    idx = min(int(len(sorted_vals) * q), len(sorted_vals) - 1)
    return f"{sorted_vals[idx]:.1f} ms"


def format_summary(result: Result, elapsed_s: float, total: int, path: str) -> str:
    lat = result.latencies_ms
    if not lat:
        return f"## {path}\n\nAll requests failed. See errors below.\n"
    rps = len(lat) / elapsed_s if elapsed_s > 0 else 0
    return f"""## {path}

| Metric | Value |
|---|---|
| Requests fired | {total} |
| Successful | {len(lat)} |
| Failed | {result.failures} |
| Total duration | {elapsed_s:.2f} s |
| Throughput | **{rps:.1f} req/s** |
| p50 latency | **{format_pct(lat, 0.50)}** |
| p95 latency | **{format_pct(lat, 0.95)}** |
| p99 latency | **{format_pct(lat, 0.99)}** |
| min / max | {min(lat):.1f} ms / {max(lat):.1f} ms |
| mean | {statistics.mean(lat):.1f} ms |
| stdev | {statistics.stdev(lat):.1f} ms |
"""


async def run_scenario(
    base_url: str,
    path: str,
    concurrency: int,
    requests: int,
    warmup: int = 20,
) -> tuple[Result, float]:
    limits = httpx.Limits(max_connections=concurrency * 2, max_keepalive_connections=concurrency)
    async with httpx.AsyncClient(base_url=base_url, limits=limits, http2=False) as client:
        # Warmup: wakes Neon serverless + primes TCP/TLS pool; not measured.
        if warmup:
            print(f"   warming up ({warmup} requests)...", end="", flush=True)
            for _ in range(warmup):
                with suppress(Exception):
                    await client.get(path, timeout=30.0)
            print(" ok")

        queue: asyncio.Queue[str] = asyncio.Queue()
        for _ in range(requests):
            await queue.put(path)
        result = Result()

        start = time.perf_counter()
        workers = [asyncio.create_task(worker(queue, client, result)) for _ in range(concurrency)]
        await queue.join()
        for w in workers:
            w.cancel()
        await asyncio.gather(*workers, return_exceptions=True)
        elapsed = time.perf_counter() - start
    return result, elapsed


async def main() -> None:
    ap = argparse.ArgumentParser()
    ap.add_argument("--base-url", default="http://127.0.0.1:8000")
    ap.add_argument("--concurrency", type=int, default=50)
    ap.add_argument("--requests", type=int, default=500)
    ap.add_argument(
        "--paths",
        nargs="+",
        default=["/health", "/health/ready"],
        help="Endpoints to load-test",
    )
    ap.add_argument("--output", type=Path, default=Path("load-test-report.md"))
    args = ap.parse_args()

    report_sections: list[str] = []
    report_sections.append(
        f"""# DBS Friday — Architecture Load Test Report

Generated: {time.strftime('%Y-%m-%d %H:%M:%S %Z')}
Target: `{args.base_url}`
Concurrency: **{args.concurrency}** · Total requests per endpoint: **{args.requests}**

This test measures the HTTP + DB + Redis + Qdrant path under concurrent load.
It does NOT exercise the OpenAI LLM path (LLM latency is provider-dominated
and separately visible in the LangGraph Studio trace panel).

---
"""
    )

    for path in args.paths:
        print(f"\n-> {path}  (concurrency={args.concurrency}, requests={args.requests})")
        result, elapsed = await run_scenario(
            args.base_url, path, args.concurrency, args.requests
        )
        summary = format_summary(result, elapsed, args.requests, path)
        print(summary)
        if result.errors:
            err_lines = "\n".join(f"- `{k}`: {v}" for k, v in result.errors.items())
            summary += f"\n### Errors\n{err_lines}\n"
        report_sections.append(summary)

    report = "\n---\n".join(report_sections)
    args.output.write_text(report, encoding="utf-8")
    print(f"\nOK - Report saved to {args.output}")


if __name__ == "__main__":
    asyncio.run(main())
