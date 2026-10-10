from http.server import BaseHTTPRequestHandler
import os
import sys
sys.path.insert(0, os.path.dirname(__file__))
from urllib.parse import parse_qs, urlparse

from _http_util import parse_query_date, send_json, send_options
from _vnstock_util import default_end, default_start, fetch_history, key_from_request, configure_vnstock_key, normalize_symbol


class handler(BaseHTTPRequestHandler):
    def do_GET(self):
        try:
            query = parse_qs(urlparse(self.path).query)
            symbol = normalize_symbol((query.get("symbol") or ["VNINDEX"])[0])
            start = parse_query_date(query, "start", "startDate", default_start(500))
            end = parse_query_date(query, "end", "endDate", default_end())
            configure_vnstock_key(key_from_request(self))
            bars = fetch_history(symbol, start, end)
            bars = [bar for bar in bars if start <= bar["date"] <= end]
            send_json(self, 200, {
                "data": bars, "symbol": symbol, "start": start, "end": end,
                "count": len(bars), "source": "vnstock",
            }, cache_seconds=60)
        except Exception as error:
            send_json(self, 502, {"error": str(error)[:320], "code": "VNSTOCK_INDEX_ERROR"})

    def do_OPTIONS(self):
        send_options(self)

    def log_message(self, format, *args):
        return
