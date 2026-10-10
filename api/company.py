from http.server import BaseHTTPRequestHandler
import os
import sys
sys.path.insert(0, os.path.dirname(__file__))
from urllib.parse import parse_qs, urlparse

from _http_util import send_json, send_options
from _vnstock_util import fetch_company, key_from_request, configure_vnstock_key, normalize_symbol


class handler(BaseHTTPRequestHandler):
    def do_GET(self):
        try:
            query = parse_qs(urlparse(self.path).query)
            symbol = normalize_symbol((query.get("symbol") or [""])[0])
            if not symbol:
                send_json(self, 400, {"error": "symbol query parameter is required"})
                return
            configure_vnstock_key(key_from_request(self))
            send_json(self, 200, fetch_company(symbol), cache_seconds=3600)
        except Exception as error:
            send_json(self, 502, {"error": str(error)[:320], "code": "VNSTOCK_COMPANY_ERROR"})

    def do_OPTIONS(self):
        send_options(self)

    def log_message(self, format, *args):
        return
