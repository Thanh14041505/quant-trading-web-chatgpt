from http.server import BaseHTTPRequestHandler
import os
import sys
sys.path.insert(0, os.path.dirname(__file__))
from urllib.parse import parse_qs, urlparse

from _http_util import send_json, send_options
from _vnstock_util import fetch_company, key_from_request, configure_vnstock_key, normalize_symbol


class handler(BaseHTTPRequestHandler):
    def do_GET(self):
        symbol = "N/A"
        try:
            query = parse_qs(urlparse(self.path).query)
            symbol = normalize_symbol((query.get("symbol") or [""])[0])
            if not symbol:
                send_json(self, 400, {"error": "symbol query parameter is required"})
                return
            configure_vnstock_key(key_from_request(self))
            send_json(self, 200, fetch_company(symbol), cache_seconds=3600)
        except (SystemExit, Exception) as error:
            # Company metadata is auxiliary for T+. Return a normalized N/A
            # record so a company-profile outage cannot block technical scans.
            # Log only the exception type; upstream messages may contain details
            # that do not belong in a public response.
            print(f"[api/company] metadata unavailable: {type(error).__name__}")
            fallback_symbol = symbol if symbol and symbol != "N/A" else "N/A"
            send_json(self, 200, {
                "symbol": fallback_symbol,
                "name": fallback_symbol,
                "exchange": "N/A",
                "sector": "N/A",
                "sectorGroup": "N/A",
                "source": "unavailable",
                "notes": ["Company profile unavailable"],
            }, cache_seconds=3600)

    def do_OPTIONS(self):
        send_options(self)

    def log_message(self, format, *args):
        return
