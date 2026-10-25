"""Regression tests for VNStock's potentially exclusive OHLCV end date."""
import sys
import types
import unittest
from unittest.mock import patch

from api._vnstock_util import _fetch_unified_history


class VNStockEndDateTests(unittest.TestCase):
    def test_daily_history_requests_day_after_selected_end(self):
        calls = []

        class Equity:
            def ohlcv(self, **kwargs):
                calls.append(kwargs)
                return []

        class Market:
            def equity(self, symbol):
                self.symbol = symbol
                return Equity()

        with patch.dict(sys.modules, {"vnstock": types.SimpleNamespace(Market=Market)}):
            _fetch_unified_history("GVR", "2026-01-01", "2026-10-23")

        self.assertEqual(calls[0]["start"], "2026-01-01")
        self.assertEqual(calls[0]["end"], "2026-10-24")
        self.assertEqual(calls[0]["interval"], "1D")


if __name__ == "__main__":
    unittest.main()
