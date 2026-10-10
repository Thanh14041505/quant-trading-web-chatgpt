"""POST /api/scan - bounded multi-symbol OHLCV fetch for manual/batch use.

Body: {"symbols":["HAH","GMD"], "start":"2025-01-01", "end":"2026-10-08"}
Optional credential header: X-VNSTOCK-KEY. Prefer VNSTOCK_API_KEY env var.
"""
from http.server import BaseHTTPRequestHandler
import os
import sys
sys.path.insert(0, os.path.dirname(__file__))
import json
import time

from _http_util import send_json, send_options
from _vnstock_util import default_end, default_start, fetch_history, key_from_request, configure_vnstock_key, normalize_symbol

MAX_SYMBOLS = 8
DEFAULT_DELAY = 0.3


class handler(BaseHTTPRequestHandler):
    def do_GET(self):
        send_json(self, 200, {
            "ok": True, "endpoint": "/api/scan", "method": "POST",
            "max_symbols": MAX_SYMBOLS, "default_delay": DEFAULT_DELAY,
        })

    def do_POST(self):
        try:
            length = int(self.headers.get("Content-Length") or 0)
            if length > 64_000:
                send_json(self, 413, {"error": "Request body too large"})
                return
            raw = self.rfile.read(length) if length else b"{}"
            try:
                body = json.loads(raw.decode("utf-8") or "{}")
            except (json.JSONDecodeError, UnicodeDecodeError):
                send_json(self, 400, {"error": "Invalid JSON body"})
                return
            symbols_raw = body.get("symbols") if isinstance(body, dict) else None
            if not isinstance(symbols_raw, list) or not symbols_raw:
                send_json(self, 400, {"error": "symbols must be a non-empty array"})
                return

            symbols = []
            seen = set()
            for raw_symbol in symbols_raw:
                symbol = normalize_symbol(str(raw_symbol))
                if symbol and symbol not in seen and len(symbol) <= 20:
                    symbols.append(symbol)
                    seen.add(symbol)
            requested_count = len(symbols)
            symbols = symbols[:MAX_SYMBOLS]
            start = str(body.get("start") or body.get("startDate") or default_start(400))
            end = str(body.get("end") or body.get("endDate") or default_end())
            try:
                delay = float(body.get("delay", DEFAULT_DELAY))
            except (TypeError, ValueError):
                delay = DEFAULT_DELAY
            delay = max(0.0, min(delay, 3.0))
            configure_vnstock_key(key_from_request(self))

            data = {}
            errors = []
            started = time.time()
            for index, symbol in enumerate(symbols):
                try:
                    bars = [bar for bar in fetch_history(symbol, start, end) if start <= bar["date"] <= end]
                    if bars:
                        data[symbol] = bars
                    else:
                        errors.append({"symbol": symbol, "error": "empty"})
                except Exception as error:
                    errors.append({"symbol": symbol, "error": str(error)[:240]})
                if index < len(symbols) - 1 and delay:
                    time.sleep(delay)

            send_json(self, 200, {
                "data": data,
                "errors": errors,
                "meta": {
                    "requested": len(symbols_raw), "deduplicated": requested_count,
                    "processed": len(symbols), "truncated": requested_count > MAX_SYMBOLS,
                    "ok": len(data), "failed": len(errors), "delay": delay,
                    "key_status": "server-environment" if os.getenv("VNSTOCK_API_KEY") else "request-header-or-guest",
                    "duration_sec": round(time.time() - started, 2), "max_symbols": MAX_SYMBOLS,
                },
                "source": "vnstock-scan",
            }, cache_seconds=0)
        except Exception as error:
            send_json(self, 500, {"error": str(error)[:320], "code": "VNSTOCK_SCAN_ERROR"})

    def do_OPTIONS(self):
        send_options(self)

    def log_message(self, format, *args):
        return
