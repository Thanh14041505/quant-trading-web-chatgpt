from http.server import BaseHTTPRequestHandler
import os
import sys
sys.path.insert(0, os.path.dirname(__file__))
from urllib.parse import parse_qs, urlparse

from _http_util import send_json, send_options
from _vnstock_util import fetch_fundamentals, key_from_request, configure_vnstock_key, normalize_symbol


class handler(BaseHTTPRequestHandler):
    def do_GET(self):
        try:
            query = parse_qs(urlparse(self.path).query)
            symbol = normalize_symbol((query.get("symbol") or [""])[0])
            if not symbol:
                send_json(self, 400, {"error": "symbol query parameter is required"})
                return
            configure_vnstock_key(key_from_request(self))
            send_json(self, 200, fetch_fundamentals(symbol), cache_seconds=3600)
        except SystemExit as error:
            # Some VNStock rate-limit/auth paths terminate with SystemExit, which
            # is not caught by Exception and otherwise becomes FUNCTION_INVOCATION_FAILED.
            message = str(error).lower()
            is_rate_limited = any(token in message for token in (
                "rate limit", "rate-limit", "too many requests", "60/60",
                "requests per minute", "wait to retry", "gioi han api",
            ))
            if is_rate_limited:
                send_json(self, 503, {
                    "error": "VNStock rate limit reached. Please wait before retrying.",
                    "code": "VNSTOCK_RATE_LIMIT",
                    "retry_after_seconds": 15,
                })
            else:
                send_json(self, 502, {
                    "error": "VNStock terminated the fundamentals request unexpectedly.",
                    "code": "VNSTOCK_UPSTREAM_EXIT",
                })
        except Exception as error:
            message = str(error).lower()
            is_rate_limited = any(token in message for token in (
                "rate limit", "rate-limit", "too many requests", "60/60",
                "requests per minute", "wait to retry", "gioi han api",
            ))
            if is_rate_limited:
                send_json(self, 503, {
                    "error": "VNStock rate limit reached. Please wait before retrying.",
                    "code": "VNSTOCK_RATE_LIMIT",
                    "retry_after_seconds": 15,
                })
            else:
                send_json(self, 502, {
                    "error": str(error)[:320],
                    "code": "VNSTOCK_FUNDAMENTALS_ERROR",
                })

    def do_OPTIONS(self):
        send_options(self)

    def log_message(self, format, *args):
        return
