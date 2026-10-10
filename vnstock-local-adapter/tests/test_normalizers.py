import pandas as pd

from main import _clean_ohlcv, _fundamental_payload, _records


def test_ohlcv_normalizer_accepts_vnstock_columns_and_deduplicates():
    frame = pd.DataFrame([
        {"time": "2026-10-08", "open": 10, "high": 11, "low": 9, "close": 10.5, "volume": 1000},
        {"time": "2026-10-08", "open": 10, "high": 12, "low": 9, "close": 10.8, "volume": 1100},
        {"time": "2026-10-07", "open": 9, "high": 10, "low": 8, "close": 9.5, "volume": 900},
    ])
    rows = _clean_ohlcv(_records(frame), "HAH")
    assert [row["date"] for row in rows] == ["2026-10-07", "2026-10-08"]
    assert rows[-1]["close"] == 10.8
    assert rows[-1]["symbol"] == "HAH"


def test_fundamental_parser_accepts_column_oriented_ratio_data():
    rows = [{"ticker": "FPT", "roe": 0.18, "roa": 0.08, "priceToEarning": 15.2, "priceToBook": 2.4}]
    result = _fundamental_payload("FPT", rows)
    assert result["roe"] == 0.18
    assert result["pe"] == 15.2
    assert result["pb"] == 2.4


def test_fundamental_parser_accepts_report_rows():
    rows = [
        {"item_en": "ROE", "item": "Tỷ suất sinh lời trên vốn chủ sở hữu", "unit": "%", "2025": 18.5, "2024": 16.2},
        {"item_en": "Price to Earnings", "item": "P/E", "unit": "x", "2025": 14.1, "2024": 15.0},
    ]
    result = _fundamental_payload("FPT", rows)
    assert result["roe"] == 18.5
    assert result["pe"] == 14.1
