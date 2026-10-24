from http.server import BaseHTTPRequestHandler
import os
import sys
import time
sys.path.insert(0, os.path.dirname(__file__))
from urllib.parse import parse_qs, urlparse

from _http_util import parse_query_date, send_json, send_options
from _vnstock_util import default_end, default_start, fetch_history, key_from_request, configure_vnstock_key, normalize_symbol


class handler(BaseHTTPRequestHandler):
    def do_GET(self):
        started = time.monotonic()
        symbol = "N/A"
        try:
            query = parse_qs(urlparse(self.path).query)
            symbol = normalize_symbol((query.get("symbol") or ["HAH"])[0])
            start = parse_query_date(query, "start", "startDate", default_start(500))
            end = parse_query_date(query, "end", "endDate", default_end())
            timeframe = (query.get("timeframe") or ["1D"])[0].upper()
            if timeframe not in ("1D", "D", "DAILY"):
                send_json(self, 400, {"error": "Only daily OHLCV is supported by this endpoint; aggregate bars in the client for weekly/monthly charts."})
                return
            if not symbol or len(symbol) > 20:
                send_json(self, 400, {"error": "Invalid symbol."})
                return
            configure_vnstock_key(key_from_request(self))
            bars = fetch_history(symbol, start, end)
            bars = [bar for bar in bars if start <= bar["date"] <= end]
            elapsed_ms = round((time.monotonic() - started) * 1000)
            print(f"[api/ohlcv] success symbol={symbol} bars={len(bars)} elapsed_ms={elapsed_ms}")
            send_json(self, 200, {
                "data": bars,
                "symbol": symbol,
                "start": start,
                "end": end,
                "count": len(bars),
                "source": "vnstock",
            }, cache_seconds=60)
        except ValueError as error:
            elapsed_ms = round((time.monotonic() - started) * 1000)
            print(f"[api/ohlcv] bad_request symbol={symbol} type={type(error).__name__} elapsed_ms={elapsed_ms}")
            send_json(self, 400, {"error": str(error)[:240]})
        except Exception as error:
            elapsed_ms = round((time.monotonic() - started) * 1000)
            message = str(error)
            if "VNSTOCK_RATE_LIMIT" in message:
                error_code = "VNSTOCK_RATE_LIMIT"
            elif "VNSTOCK_UPSTREAM_TIMEOUT" in message:
                error_code = "VNSTOCK_UPSTREAM_TIMEOUT"
            elif "VNSTOCK_EMPTY_HISTORY" in message:
                error_code = "VNSTOCK_EMPTY_HISTORY"
            else:
                error_code = "VNSTOCK_UPSTREAM_ERROR"
            print(f"[api/ohlcv] failure symbol={symbol} code={error_code} type={type(error).__name__} elapsed_ms={elapsed_ms}")
            send_json(self, 502, {"error": message[:320], "code": error_code})

    def do_OPTIONS(self):
        send_options(self)

    def do_POST(self):
        send_json(self, 405, {"error": "Method not allowed. Use GET."})

    def log_message(self, format, *args):
        return
