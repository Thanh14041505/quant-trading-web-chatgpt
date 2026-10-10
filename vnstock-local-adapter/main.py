from __future__ import annotations

import os
import re
import threading
import time
from collections import OrderedDict
from datetime import date, datetime, timezone
from typing import Any, Callable

import pandas as pd
from dotenv import load_dotenv
from fastapi import FastAPI, HTTPException, Query
from fastapi.middleware.cors import CORSMiddleware

load_dotenv()

APP_NAME = "VNStock Local Adapter"
CACHE_MAX_ITEMS = int(os.getenv("CACHE_MAX_ITEMS", "256"))
MIN_SECONDS_BETWEEN_SOURCE_CALLS = max(0.0, float(os.getenv("VNSTOCK_MIN_CALL_INTERVAL_SECONDS", "1.1")))
DEFAULT_HISTORY_COUNT = max(30, min(1000, int(os.getenv("DEFAULT_HISTORY_COUNT", "250"))))

# VNStock's own API-key configuration is managed by the Python library.
# If a key is provided in .env, configure it without ever returning it to the browser.
_api_key = os.getenv("VNSTOCK_API_KEY", "").strip()
if _api_key:
    try:
        from vnstock.core.utils.auth import change_api_key
        change_api_key(_api_key)
    except Exception as exc:  # pragma: no cover - depends on installed VNStock version
        raise RuntimeError(
            "Could not configure the VNStock API key. Run setup_vnstock_key.py or check your VNStock version."
        ) from exc

from vnstock import Fundamental, Market, Reference  # noqa: E402

app = FastAPI(
    title=APP_NAME,
    description=(
        "Local-only adapter that exposes VNStock Python data as CORS-enabled JSON for the Quant Trading Web app. "
        "This service binds to 127.0.0.1 by default and is not intended to be internet-facing."
    ),
    version="1.0.0",
)

allowed_origins = [
    origin.strip()
    for origin in os.getenv(
        "CORS_ORIGINS", "http://localhost:5173,http://127.0.0.1:5173"
    ).split(",")
    if origin.strip()
]
app.add_middleware(
    CORSMiddleware,
    allow_origins=allowed_origins,
    allow_credentials=False,
    allow_methods=["GET", "OPTIONS"],
    allow_headers=["Accept", "Content-Type"],
)

_cache: OrderedDict[str, tuple[float, Any]] = OrderedDict()
_cache_lock = threading.Lock()
_source_lock = threading.Lock()
_next_source_call_at = 0.0

SYMBOL_RE = re.compile(r"^[A-Z0-9]{2,12}$")
TIMEFRAME_MAP = {"1D": "1D", "1W": "1W", "1M": "1D"}


def _valid_symbol(symbol: str) -> str:
    symbol = symbol.strip().upper()
    if not SYMBOL_RE.fullmatch(symbol):
        raise HTTPException(status_code=400, detail={"code": "INVALID_SYMBOL", "message": "Invalid symbol format."})
    return symbol


def _normalise_key(value: Any) -> str:
    return re.sub(r"[^a-z0-9]", "", str(value).lower())


def _scalar(value: Any) -> Any:
    if value is None:
        return None
    try:
        if pd.isna(value):
            return None
    except (TypeError, ValueError):
        pass
    if isinstance(value, (pd.Timestamp, datetime, date)):
        return value.isoformat()
    if hasattr(value, "item"):
        try:
            value = value.item()
        except (ValueError, TypeError):
            pass
    if isinstance(value, (str, int, float, bool)) or value is None:
        if isinstance(value, float) and (value != value or value in (float("inf"), float("-inf"))):
            return None
        return value
    return str(value)


def _records(frame: Any) -> list[dict[str, Any]]:
    if frame is None:
        return []
    if isinstance(frame, pd.Series):
        frame = frame.to_frame().T
    if not isinstance(frame, pd.DataFrame):
        if isinstance(frame, dict):
            return [{str(k): _scalar(v) for k, v in frame.items()}]
        if isinstance(frame, list):
            return [
                {str(k): _scalar(v) for k, v in row.items()}
                for row in frame
                if isinstance(row, dict)
            ]
        return []
    if frame.empty:
        return []
    # OHLCV DataFrames can use a DatetimeIndex instead of a date column.
    if not any(_normalise_key(c) in {"time", "date", "datetime", "timestamp", "tradingdate"} for c in frame.columns):
        index_name = frame.index.name or "time"
        frame = frame.reset_index().rename(columns={frame.index.name or "index": index_name})
    records: list[dict[str, Any]] = []
    for raw in frame.to_dict(orient="records"):
        if isinstance(raw, dict):
            records.append({str(k): _scalar(v) for k, v in raw.items()})
    return records


def _column_map(record: dict[str, Any]) -> dict[str, Any]:
    return {_normalise_key(key): value for key, value in record.items()}


def _pick(record: dict[str, Any], aliases: tuple[str, ...]) -> Any:
    columns = _column_map(record)
    for alias in aliases:
        key = _normalise_key(alias)
        if key in columns and columns[key] is not None:
            return columns[key]
    return None


def _clean_ohlcv(records: list[dict[str, Any]], symbol: str) -> list[dict[str, Any]]:
    mapped: list[dict[str, Any]] = []
    for row in records:
        raw_date = _pick(row, ("date", "time", "datetime", "timestamp", "tradingDate", "trading_date"))
        if raw_date is None:
            continue
        try:
            stamp = pd.Timestamp(raw_date)
            if pd.isna(stamp):
                continue
            day = stamp.date().isoformat()
        except Exception:
            continue
        values = {
            "open": _pick(row, ("open", "o")),
            "high": _pick(row, ("high", "h")),
            "low": _pick(row, ("low", "l")),
            "close": _pick(row, ("close", "c", "adjClose", "adjustedClose")),
            "volume": _pick(row, ("volume", "v")),
            "value": _pick(row, ("value", "tradingValue", "valueTraded", "amount")),
        }
        try:
            open_, high, low, close, volume = (float(values[k]) for k in ("open", "high", "low", "close", "volume"))
        except (ValueError, TypeError):
            continue
        if not all(pd.notna(x) for x in (open_, high, low, close, volume)):
            continue
        item: dict[str, Any] = {
            "symbol": symbol,
            "date": day,
            "open": open_,
            "high": high,
            "low": low,
            "close": close,
            "volume": volume,
        }
        try:
            if values["value"] is not None and pd.notna(values["value"]):
                item["value"] = float(values["value"])
        except (TypeError, ValueError):
            pass
        mapped.append(item)
    # Remove duplicate sessions deterministically, then sort ascending.
    unique = {row["date"]: row for row in mapped}
    return [unique[d] for d in sorted(unique)]


def _cache_get(key: str) -> Any | None:
    now = time.monotonic()
    with _cache_lock:
        item = _cache.get(key)
        if item is None:
            return None
        expires_at, value = item
        if expires_at <= now:
            _cache.pop(key, None)
            return None
        _cache.move_to_end(key)
        return value


def _cache_set(key: str, value: Any, ttl_seconds: int) -> Any:
    with _cache_lock:
        _cache[key] = (time.monotonic() + ttl_seconds, value)
        _cache.move_to_end(key)
        while len(_cache) > CACHE_MAX_ITEMS:
            _cache.popitem(last=False)
    return value


def _cached_call(key: str, ttl_seconds: int, fn: Callable[[], Any]) -> Any:
    cached = _cache_get(key)
    if cached is not None:
        return cached
    # Serialize access and pace calls to reduce the chance of exhausting the free-tier quota.
    with _source_lock:
        cached = _cache_get(key)
        if cached is not None:
            return cached
        global _next_source_call_at
        wait = _next_source_call_at - time.monotonic()
        if wait > 0:
            time.sleep(wait)
        try:
            value = fn()
        except HTTPException:
            raise
        except Exception as exc:
            # Keep errors concise and never include headers, credentials, or request secrets.
            raise HTTPException(
                status_code=502,
                detail={
                    "code": "VNSTOCK_SOURCE_ERROR",
                    "message": f"VNStock could not retrieve this data ({type(exc).__name__}). Check the key, source availability, symbol and rate limit.",
                },
            ) from exc
        finally:
            _next_source_call_at = time.monotonic() + MIN_SECONDS_BETWEEN_SOURCE_CALLS
        return _cache_set(key, value, ttl_seconds)


def _query_interval(timeframe: str) -> str:
    value = timeframe.strip().upper()
    if value not in TIMEFRAME_MAP:
        raise HTTPException(status_code=400, detail={"code": "INVALID_TIMEFRAME", "message": "Use 1D, 1W or 1M."})
    # The web app uses daily source data and performs its own weekly/monthly chart aggregation.
    # For any monthly request, daily candles preserve detail for that client-side aggregation.
    return TIMEFRAME_MAP[value]


def _history(symbol: str, start_date: str | None, end_date: str | None, timeframe: str, is_index: bool) -> dict[str, Any]:
    symbol = _valid_symbol(symbol)
    interval = _query_interval(timeframe)
    if start_date:
        try:
            datetime.strptime(start_date, "%Y-%m-%d")
        except ValueError as exc:
            raise HTTPException(status_code=400, detail={"code": "INVALID_START_DATE", "message": "startDate must be YYYY-MM-DD."}) from exc
    if end_date:
        try:
            datetime.strptime(end_date, "%Y-%m-%d")
        except ValueError as exc:
            raise HTTPException(status_code=400, detail={"code": "INVALID_END_DATE", "message": "endDate must be YYYY-MM-DD."}) from exc
    if start_date and end_date and start_date > end_date:
        raise HTTPException(status_code=400, detail={"code": "INVALID_DATE_RANGE", "message": "startDate must be before endDate."})

    key = f"history:{'index' if is_index else 'equity'}:{symbol}:{start_date or ''}:{end_date or ''}:{timeframe.upper()}"

    def load() -> dict[str, Any]:
        market = Market()
        asset = market.index(symbol) if is_index else market.equity(symbol)
        if start_date:
            frame = asset.ohlcv(start=start_date, end=end_date or date.today().isoformat(), interval=interval)
        else:
            count = DEFAULT_HISTORY_COUNT
            frame = asset.ohlcv(count=count, interval=interval)
            if end_date and isinstance(frame, pd.DataFrame):
                date_col = next((c for c in frame.columns if _normalise_key(c) in {"time", "date", "datetime", "timestamp", "tradingdate"}), None)
                if date_col:
                    dates = pd.to_datetime(frame[date_col], errors="coerce")
                    frame = frame.loc[dates.dt.date.astype(str) <= end_date]
        rows = _clean_ohlcv(_records(frame), symbol)
        if not rows:
            raise HTTPException(status_code=502, detail={"code": "NO_OHLCV_DATA", "message": f"VNStock returned no usable OHLCV rows for {symbol}."})
        return {
            "data": rows,
            "source": "vnstock-community",
            "symbol": symbol,
            "timeframe": timeframe.upper(),
            "retrievedAt": datetime.now(timezone.utc).isoformat(),
            "count": len(rows),
        }

    return _cached_call(key, 20, load)


def _latest_number(value: Any) -> float | None:
    try:
        number = float(value)
        if pd.notna(number) and number not in (float("inf"), float("-inf")):
            return number
    except (TypeError, ValueError):
        pass
    return None


def _fundamental_payload(symbol: str, records: list[dict[str, Any]]) -> dict[str, Any]:
    result: dict[str, Any] = {"symbol": symbol}
    aliases: dict[str, tuple[str, ...]] = {
        "roe": ("roe", "returnonequity"),
        "roa": ("roa", "returnonassets"),
        "roic": ("roic", "returnoninvestedcapital"),
        "pe": ("pe", "priceToEarning", "priceEarningsRatio", "priceToEarnings"),
        "pb": ("pb", "priceToBook", "priceBookRatio"),
        "revenueGrowth": ("revenueGrowth", "revenueGrowthYoY", "revenueGrowthPct"),
        "epsGrowth": ("epsGrowth", "epsGrowthYoY"),
        "debtToEquity": ("debtToEquity", "debtEquity", "debtToEquityRatio"),
    }
    # Format A: the source returned columns such as roe / priceToEarning.
    if records:
        first = records[-1]
        normal = _column_map(first)
        for target, names in aliases.items():
            for name in names:
                value = normal.get(_normalise_key(name))
                number = _latest_number(value)
                if number is not None:
                    result[target] = number
                    break
    # Format B: rows contain an item/metric name and year/quarter columns.
    label_fields = ("item_en", "item", "name", "metric", "indicator", "ratio", "key", "id")
    for row in records:
        label = next((row.get(k) for k in row if _normalise_key(k) in {_normalise_key(x) for x in label_fields} and row.get(k) is not None), None)
        if label is None:
            continue
        label_key = _normalise_key(label)
        target = next((key for key, names in aliases.items() if any(_normalise_key(name) in label_key for name in names)), None)
        if not target or target in result:
            continue
        candidates = []
        for col, value in row.items():
            norm = _normalise_key(col)
            if norm in {_normalise_key(x) for x in label_fields + ("unit", "ticker", "symbol", "quarter", "year", "period", "order", "level")}:
                continue
            number = _latest_number(value)
            if number is not None:
                candidates.append((str(col), number))
        if candidates:
            # Year/quarter columns are sortable in chronological-like lexical order.
            result[target] = sorted(candidates, key=lambda pair: pair[0])[-1][1]
    return result


@app.get("/")
def root() -> dict[str, Any]:
    return {"name": APP_NAME, "docs": "/docs", "health": "/api/health"}


@app.get("/api/health")
def health() -> dict[str, Any]:
    return {
        "status": "ok",
        "provider": "VNStock Community",
        "adapter": APP_NAME,
        "version": "1.0.0",
        "keyConfiguredInEnvironment": bool(_api_key),
        "note": "Health confirms the local adapter is running. Use Fetch Sample to verify upstream data access.",
        "timestamp": datetime.now(timezone.utc).isoformat(),
    }


@app.get("/api/stocks/{symbol}/history")
def stock_history(
    symbol: str,
    startDate: str | None = Query(default=None),
    endDate: str | None = Query(default=None),
    timeframe: str = Query(default="1D"),
) -> dict[str, Any]:
    return _history(symbol, startDate, endDate, timeframe, False)


@app.get("/api/index/{symbol}/history")
def index_history(
    symbol: str,
    startDate: str | None = Query(default=None),
    endDate: str | None = Query(default=None),
    timeframe: str = Query(default="1D"),
) -> dict[str, Any]:
    return _history(symbol, startDate, endDate, timeframe, True)


@app.get("/api/stocks/{symbol}/quote")
def stock_quote(symbol: str) -> dict[str, Any]:
    symbol = _valid_symbol(symbol)
    def load() -> dict[str, Any]:
        value = Market().equity(symbol).quote()
        records = _records(value)
        if not records:
            # The provider may return a Series/dict shape; _records handles those too.
            raise HTTPException(status_code=502, detail={"code": "NO_QUOTE_DATA", "message": f"VNStock returned no quote for {symbol}."})
        return {"data": records[0], "source": "vnstock-community", "symbol": symbol, "retrievedAt": datetime.now(timezone.utc).isoformat()}
    return _cached_call(f"quote:{symbol}", 3, load)


@app.get("/api/quotes")
def multi_quote(symbols: str = Query(..., description="Comma-separated symbols, e.g. HAH,GMD,VCB")) -> dict[str, Any]:
    requested = [_valid_symbol(item) for item in symbols.split(",") if item.strip()]
    if not requested or len(requested) > 100:
        raise HTTPException(status_code=400, detail={"code": "INVALID_SYMBOLS", "message": "Provide 1 to 100 comma-separated symbols."})
    unique = list(dict.fromkeys(requested))
    def load() -> dict[str, Any]:
        frame = Market().quote(unique)
        rows = _records(frame)
        return {"data": rows, "source": "vnstock-community", "symbols": unique, "retrievedAt": datetime.now(timezone.utc).isoformat()}
    return _cached_call(f"quotes:{','.join(unique)}", 3, load)


@app.get("/api/stocks/{symbol}/company")
def company_info(symbol: str) -> dict[str, Any]:
    symbol = _valid_symbol(symbol)
    def load() -> dict[str, Any]:
        frame = Reference().company(symbol).info()
        rows = _records(frame)
        if not rows:
            raise HTTPException(status_code=502, detail={"code": "NO_COMPANY_DATA", "message": f"VNStock returned no company information for {symbol}."})
        row = rows[0]
        raw_exchange = _pick(row, ("exchange", "exchangeCode", "exchange_code", "board", "floor"))
        raw_sector = _pick(row, ("sector", "industry", "industryName", "icbName", "icb_name"))
        raw_name = _pick(row, ("name", "org_name", "organ_name", "companyName", "shortName", "short_name"))
        return {
            "symbol": symbol,
            "name": str(raw_name or symbol),
            "exchange": str(raw_exchange or "UNKNOWN").upper(),
            "sector": str(raw_sector or "Unknown"),
            "sourceFields": row,
            "source": "vnstock-community",
        }
    return _cached_call(f"company:{symbol}", 6 * 60 * 60, load)


@app.get("/api/stocks/{symbol}/fundamentals")
def fundamentals(symbol: str) -> dict[str, Any]:
    symbol = _valid_symbol(symbol)
    def load() -> dict[str, Any]:
        frame = Fundamental().equity(symbol).ratio()
        rows = _records(frame)
        if not rows:
            raise HTTPException(status_code=502, detail={"code": "NO_FUNDAMENTAL_DATA", "message": f"VNStock returned no ratio data for {symbol}."})
        payload = _fundamental_payload(symbol, rows)
        payload["source"] = "vnstock-community"
        payload["asOf"] = datetime.now(timezone.utc).isoformat()
        return payload
    return _cached_call(f"fundamentals:{symbol}", 60 * 60, load)
