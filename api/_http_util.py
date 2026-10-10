"""HTTP response helpers shared by Vercel Python handlers."""
from __future__ import annotations

import json
import os
from urllib.parse import urlparse
from typing import Any


def _allowed_origin(handler: Any) -> str | None:
    origin = (handler.headers.get("Origin") or "").strip()
    if not origin:
        # Same-origin requests do not require CORS headers.
        return None
    configured = {item.strip().rstrip("/") for item in os.getenv("ALLOWED_ORIGINS", "").split(",") if item.strip()}
    if origin.rstrip("/") in configured:
        return origin
    host = (handler.headers.get("Host") or "").strip().lower()
    parsed = urlparse(origin)
    if parsed.netloc.lower() == host and parsed.scheme in ("http", "https"):
        return origin
    return None


def _write_cors(handler: Any) -> None:
    allowed_origin = _allowed_origin(handler)
    if allowed_origin:
        handler.send_header("Access-Control-Allow-Origin", allowed_origin)
        handler.send_header("Vary", "Origin")
        handler.send_header("Access-Control-Allow-Credentials", "true")
    handler.send_header("Access-Control-Allow-Methods", "GET, POST, OPTIONS")
    handler.send_header("Access-Control-Allow-Headers", "Content-Type, Authorization, X-VNSTOCK-KEY")


def send_json(handler: Any, status: int, body: dict[str, Any], *, cache_seconds: int = 0) -> None:
    payload = json.dumps(body, ensure_ascii=False, allow_nan=False).encode("utf-8")
    handler.send_response(status)
    handler.send_header("Content-Type", "application/json; charset=utf-8")
    _write_cors(handler)
    handler.send_header("Cache-Control", f"public, max-age={cache_seconds}, s-maxage={cache_seconds}, stale-while-revalidate=60" if cache_seconds else "no-store")
    handler.send_header("Content-Length", str(len(payload)))
    handler.end_headers()
    handler.wfile.write(payload)


def send_options(handler: Any) -> None:
    handler.send_response(204)
    _write_cors(handler)
    handler.send_header("Access-Control-Max-Age", "86400")
    handler.end_headers()


def parse_query_date(query: dict[str, list[str]], primary: str, alias: str, default: str) -> str:
    return str((query.get(primary) or query.get(alias) or [default])[0])
