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
        except SystemExit as error:
            # VNStock may terminate the process for auth/rate-limit errors.
            # Convert it into a controlled response instead of FUNCTION_INVOCATION_FAILED.
            from _vnstock_util import _is_rate_limit_error
            if _is_rate_limit_error(error):
                print("[api/company] VNSTOCK_RATE_LIMIT: upstream quota reached")
                send_json(self, 503, {
                    "error": "VNStock rate limit reached. Please wait before retrying.",
                    "code": "VNSTOCK_RATE_LIMIT",
                    "retry_after_seconds": 60,
                })
            else:
                print("[api/company] VNSTOCK_UPSTREAM_EXIT")
                send_json(self, 502, {
                    "error": "VNStock terminated the company-profile request.",
                    "code": "VNSTOCK_COMPANY_UPSTREAM_EXIT",
                })
        except Exception as error:
            print(f"[api/company] {type(error).__name__}: {str(error)[:240]}")
            send_json(self, 502, {"error": str(error)[:320], "code": "VNSTOCK_COMPANY_ERROR"})

    def do_OPTIONS(self):
        send_options(self)

    def log_message(self, format, *args):
        return
