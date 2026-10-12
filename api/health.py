from http.server import BaseHTTPRequestHandler
import os
import sys
sys.path.insert(0, os.path.dirname(__file__))

from _http_util import send_json, send_options


class handler(BaseHTTPRequestHandler):
    def do_GET(self):
        send_json(self, 200, {
            "ok": True,
            "service": "quant-trading-web-api",
            "provider": "vnstock",
            "vnstock_key_configured": bool(os.getenv("VNSTOCK_API_KEY") or self.headers.get("X-VNSTOCK-KEY")),
            "endpoints": [
                "/api/health", "/api/ohlcv?symbol=HAH", "/api/market_index?symbol=VNINDEX",
                "/api/company?symbol=HAH", "/api/fundamentals?symbol=HAH", "/api/sectors", "/api/scan",
            ],
            "note": "Health confirms function availability, not upstream VNStock reachability. Test /api/ohlcv for an upstream smoke test.",
        }, cache_seconds=0)

    def do_OPTIONS(self):
        send_options(self)

    def log_message(self, format, *args):
        return
