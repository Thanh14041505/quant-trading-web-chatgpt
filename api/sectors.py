from http.server import BaseHTTPRequestHandler
import os
import sys
from urllib.parse import parse_qs, urlparse

sys.path.insert(0, os.path.dirname(__file__))

from _http_util import send_json, send_options
from _vnstock_util import configure_vnstock_key, fetch_sector_universe, key_from_request


class handler(BaseHTTPRequestHandler):
    def do_GET(self):
        try:
            query = parse_qs(urlparse(self.path).query)
            force = (query.get("refresh") or [""])[0].strip().lower() in ("1", "true", "yes")
            configure_vnstock_key(key_from_request(self))
            send_json(self, 200, fetch_sector_universe(force_refresh=force), cache_seconds=3600)
        except Exception as error:
            send_json(self, 502, {
                "error": str(error)[:320],
                "code": "VNSTOCK_SECTOR_UNIVERSE_ERROR",
            }, cache_seconds=0)

    def do_OPTIONS(self):
        send_options(self)

    def log_message(self, format, *args):
        return
