"""Shared VNStock helpers for Vercel file-based Python functions.

IMPORTANT: Vercel's function filesystem is ephemeral/read-only except /tmp.
Prefer VNSTOCK_API_KEY as a Vercel environment variable. X-VNSTOCK-KEY is
supported as a personal-use fallback and must never be logged or returned.
"""
from __future__ import annotations

import hashlib
import inspect
import math
import os
from datetime import datetime, timedelta
from typing import Any

os.environ.setdefault("HOME", "/tmp")
os.environ.setdefault("XDG_CACHE_HOME", "/tmp/.cache")
os.environ.setdefault("XDG_CONFIG_HOME", "/tmp/.config")
os.environ.setdefault("TMPDIR", "/tmp")
os.environ.setdefault("TEMP", "/tmp")
os.environ.setdefault("TMP", "/tmp")
for _directory in ("/tmp/.cache", "/tmp/.config", "/tmp/vnstock"):
    try:
        os.makedirs(_directory, exist_ok=True)
    except OSError:
        pass

_configured_key_digest: str | None = None


def _error_label(error: Exception) -> str:
    """Return safe diagnostic type plus missing module, without secrets."""
    if isinstance(error, ModuleNotFoundError):
        missing_module = getattr(error, "name", None) or "unknown-module"
        return f"ModuleNotFoundError:{missing_module}"
    return type(error).__name__


def default_start(days: int = 400) -> str:
    return (datetime.utcnow() - timedelta(days=days)).strftime("%Y-%m-%d")


def default_end() -> str:
    return datetime.utcnow().strftime("%Y-%m-%d")


def normalize_symbol(symbol: str) -> str:
    value = (symbol or "").strip().upper()
    aliases = {
        "VNINDEX": "VNINDEX",
        "VN-INDEX": "VNINDEX",
        "VN30": "VN30",
        "HNX": "HNXIndex",
        "HNXINDEX": "HNXIndex",
        "UPCOM": "UPCOMIndex",
        "UPCOMINDEX": "UPCOMIndex",
    }
    return aliases.get(value, value)


def configure_vnstock_key(api_key: str | None = None) -> str:
    """Configure the key once per warm function instance without exposing it."""
    global _configured_key_digest
    key = (api_key or os.getenv("VNSTOCK_API_KEY") or "").strip()
    if not key:
        return "environment-key-not-configured"

    digest = hashlib.sha256(key.encode("utf-8")).hexdigest()
    if digest == _configured_key_digest:
        return "configured"

    try:
        # Current official guidance uses change_api_key for programmatic keys.
        from vnstock.core.utils.auth import change_api_key

        change_api_key(key)
        _configured_key_digest = digest
        return "configured"
    except Exception as current_error:
        # Compatibility with older installs only when register_user accepts a
        # key argument. Never invoke an interactive login prompt in a function.
        try:
            from vnstock import register_user
            signature = inspect.signature(register_user)
            accepts_positional = any(
                parameter.kind in (inspect.Parameter.POSITIONAL_ONLY, inspect.Parameter.POSITIONAL_OR_KEYWORD, inspect.Parameter.VAR_POSITIONAL)
                for parameter in signature.parameters.values()
            )
            if not accepts_positional:
                return f"key-configuration-warning:{type(current_error).__name__}"
            register_user(key)
            _configured_key_digest = digest
            return "configured-legacy"
        except Exception:
            # Never return or log the raw key or exception text; callers may
            # still attempt public/guest access if the upstream permits it.
            return f"key-configuration-warning:{type(current_error).__name__}"


def key_from_request(handler: Any) -> str | None:
    return (
        os.getenv("VNSTOCK_API_KEY")
        or handler.headers.get("X-VNSTOCK-KEY")
        or handler.headers.get("x-vnstock-key")
    )


def dataframe_to_bars(df: Any, symbol: str) -> list[dict[str, Any]]:
    if df is None or getattr(df, "empty", True):
        return []

    if hasattr(df.columns, "levels"):
        try:
            df = df.copy()
            df.columns = [c[0] if isinstance(c, tuple) else c for c in df.columns]
        except Exception:
            pass

    columns = {str(column).lower().strip().replace(" ", ""): column for column in df.columns}

    def pick(*names: str):
        targets = [name.lower().replace(" ", "") for name in names]
        for target in targets:
            if target in columns:
                return columns[target]
        for target in targets:
            for normalized, original in columns.items():
                if target and target in normalized:
                    return original
        return None

    c_date = pick("time", "tradingdate", "date", "datetime", "timestamp")
    c_open = pick("open")
    c_high = pick("high")
    c_low = pick("low")
    c_close = pick("close", "adjclose", "adjustedclose")
    c_volume = pick("volume", "vol")
    c_value = pick("value", "tradingvalue", "value_traded", "turnover")

    if any(column is None for column in (c_date, c_open, c_high, c_low, c_close)):
        raise ValueError(f"Unexpected OHLCV columns for {symbol}: {list(df.columns)}")

    rows: list[dict[str, Any]] = []
    for _, row in df.iterrows():
        raw_date = row[c_date]
        if hasattr(raw_date, "strftime"):
            date_string = raw_date.strftime("%Y-%m-%d")
        else:
            date_string = str(raw_date)[:10]
        try:
            open_price = float(row[c_open])
            high_price = float(row[c_high])
            low_price = float(row[c_low])
            close_price = float(row[c_close])
            volume = float(row[c_volume]) if c_volume is not None else 0.0
            value = float(row[c_value]) if c_value is not None and str(row[c_value]) not in ("nan", "None", "") else None
        except (TypeError, ValueError, OverflowError):
            continue

        prices = (open_price, high_price, low_price, close_price)
        if not all(math.isfinite(number) and number > 0 for number in prices):
            continue
        if not math.isfinite(volume) or volume < 0:
            continue
        bar: dict[str, Any] = {
            "symbol": symbol.upper(),
            "date": date_string,
            "open": open_price,
            "high": high_price,
            "low": low_price,
            "close": close_price,
            "volume": volume,
        }
        if value is not None and math.isfinite(value) and value >= 0:
            bar["value"] = value
        rows.append(bar)

    rows.sort(key=lambda item: item["date"])
    return rows


def dataframe_to_records(df: Any) -> list[dict[str, Any]]:
    """Convert common pandas DataFrame/Series/dict outputs into plain records."""
    if df is None:
        return []
    if isinstance(df, dict):
        return [df]
    if hasattr(df, "empty") and df.empty:
        return []
    if hasattr(df, "to_dict"):
        try:
            records = df.reset_index().to_dict(orient="records") if hasattr(df, "reset_index") else df.to_dict(orient="records")
            return [{str(k): _json_scalar(v) for k, v in record.items()} for record in records]
        except Exception:
            try:
                mapped = df.to_dict()
                if isinstance(mapped, dict):
                    return [{str(k): _json_scalar(v) for k, v in mapped.items()}]
            except Exception:
                return []
    return []


def _json_scalar(value: Any) -> Any:
    if value is None:
        return None
    if hasattr(value, "item"):
        try:
            value = value.item()
        except Exception:
            pass
    if hasattr(value, "isoformat"):
        try:
            return value.isoformat()
        except Exception:
            pass
    try:
        if value != value:  # NaN
            return None
    except Exception:
        pass
    if isinstance(value, (str, int, float, bool)):
        return value
    return str(value)


def _is_index_symbol(symbol: str) -> bool:
    return symbol.upper() in {"VNINDEX", "VN30", "HNXINDEX", "UPCOMINDEX"}


def _fetch_unified_history(symbol: str, start: str, end: str):
    """Preferred Unified UI used by current VNStock v4+ documentation."""
    from vnstock import Market

    market = Market()
    if _is_index_symbol(symbol):
        return market.index.ohlcv(symbol=symbol, start=start, end=end)
    return market.equity.ohlcv(symbol=symbol, start=start, end=end)


def _fetch_legacy_history(symbol: str, source: str, start: str, end: str):
    """Fallback to the source-specific API used by the existing project."""
    from vnstock import Vnstock

    stock = Vnstock().stock(symbol=symbol, source=source)
    return stock.quote.history(start=start, end=end, interval="1D")


def _fetch_quote_history(symbol: str, source: str, start: str, end: str):
    from vnstock import Quote

    quote = Quote(symbol=symbol, source=source)
    try:
        return quote.history(start=start, end=end, interval="1D")
    except TypeError:
        # Unified v4-style signature from current VNStock examples.
        try:
            from vnstock.core.types import TimeFrame
            return quote.history(start_date=start, end_date=end, resolution=TimeFrame.DAILY)
        except (ImportError, TypeError):
            return quote.history(start_date=start, end_date=end)


def fetch_history(symbol: str, start: str, end: str) -> list[dict[str, Any]]:
    symbol = normalize_symbol(symbol)
    errors: list[str] = []
    configure_vnstock_key()

    # Prefer VNStock v4+ Unified UI first; older source-specific calls remain
    # as fallback for the version already used by the reference project.
    fetchers = [("Unified", lambda: _fetch_unified_history(symbol, start, end))]
    fetchers.extend(
        (f"{source}-legacy", lambda source=source: _fetch_legacy_history(symbol, source, start, end))
        for source in ("VCI", "KBS", "MSN")
    )
    fetchers.extend(
        (f"{source}-quote", lambda source=source: _fetch_quote_history(symbol, source, start, end))
        for source in ("VCI", "KBS", "MSN")
    )
    for label, fetcher in fetchers:
        try:
            frame = fetcher()
            bars = dataframe_to_bars(frame, symbol)
            bars = [bar for bar in bars if start <= bar["date"] <= end]
            if bars:
                return bars
            errors.append(f"{label}:empty")
        except Exception as error:
            errors.append(f"{label}:{_error_label(error)}")

    raise RuntimeError(
        f"VNStock could not return history for {symbol}. Tried: "
        + ", ".join(errors[:8])
        + ". Verify the installed VNStock version, API key, symbol, and upstream availability."
    )


def fetch_company(symbol: str) -> dict[str, Any]:
    symbol = normalize_symbol(symbol)
    configure_vnstock_key()
    errors: list[str] = []
    # Preferred Unified UI in VNStock v4+.
    try:
        from vnstock import Reference
        frame = Reference().company.info(symbol=symbol)
        records = dataframe_to_records(frame)
        if records:
            record = {str(key).strip().lower().replace(" ", "_"): value for key, value in records[0].items()}
            def unified_pick(*keys: str):
                for key in keys:
                    if key in record and record[key] not in (None, "", "nan"):
                        return record[key]
                return None
            return {
                "symbol": symbol,
                "name": unified_pick("short_name", "company_name", "name", "organ_name", "companyname") or symbol,
                "exchange": unified_pick("exchange", "exchange_code", "floor", "listing_exchange"),
                "sector": unified_pick("industry", "industry_name", "sector", "icb_name", "industryname"),
                "source": "vnstock:Reference.company.info",
            }
        errors.append("Unified:empty")
    except Exception as error:
        errors.append(f"Unified:{_error_label(error)}")

    try:
        from vnstock import Company
    except ImportError as error:
        raise RuntimeError("Installed VNStock package does not expose Reference.company.info or legacy Company.") from error

    for source in ("KBS", "VCI"):
        try:
            company = Company(source=source, symbol=symbol)
            frame = company.overview()
            records = dataframe_to_records(frame)
            if not records:
                errors.append(f"{source}:empty")
                continue
            record = {str(key).strip().lower().replace(" ", "_"): value for key, value in records[0].items()}
            def pick(*keys: str):
                for key in keys:
                    if key in record and record[key] not in (None, "", "nan"):
                        return record[key]
                return None
            return {
                "symbol": symbol,
                "name": pick("short_name", "company_name", "name", "organ_name", "companyname") or symbol,
                "exchange": pick("exchange", "exchange_code", "floor", "listing_exchange"),
                "sector": pick("industry", "industry_name", "sector", "icb_name", "industryname"),
                "source": f"vnstock:{source}",
            }
        except Exception as error:
            errors.append(f"{source}:{_error_label(error)}")
    raise RuntimeError("VNStock company overview unavailable. Tried: " + ", ".join(errors))


def fetch_fundamentals(symbol: str) -> dict[str, Any]:
    """Extract a conservative subset of ratio metrics; missing fields stay null."""
    symbol = normalize_symbol(symbol)
    configure_vnstock_key()
    try:
        from vnstock import Finance
    except ImportError as error:
        raise RuntimeError("Installed VNStock package does not expose Finance.") from error

    raw_records: list[dict[str, Any]] = []
    errors: list[str] = []
    try:
        from vnstock import Fundamental
        fundamental = Fundamental()
        try:
            frame = fundamental.equity.ratios(symbol=symbol, period="year")
        except TypeError:
            frame = fundamental.equity.ratios(symbol=symbol)
        raw_records = dataframe_to_records(frame)
        if not raw_records:
            errors.append("Unified:empty ratios")
    except Exception as error:
        errors.append(f"Unified:{_error_label(error)}")

    for source in (() if raw_records else ("VCI", "KBS")):
        try:
            finance = Finance(source=source, symbol=symbol)
            try:
                frame = finance.ratio(period="year", lang="en", dropna=True)
            except TypeError:
                frame = finance.ratio(period="year")
            raw_records = dataframe_to_records(frame)
            if raw_records:
                break
            errors.append(f"{source}:empty ratios")
        except Exception as error:
            errors.append(f"{source}:{_error_label(error)}")

    metric_aliases = {
        "roe": ("roe", "return on equity"),
        "roa": ("roa", "return on assets"),
        "roic": ("roic", "return on invested capital"),
        "pe": ("pe", "p/e", "price earnings", "price to earnings"),
        "pb": ("pb", "p/b", "price book", "price to book"),
        "debtToEquity": ("debt/equity", "debt to equity", "d/e"),
        "dividendYield": ("dividend yield", "dividend_yield"),
    }

    def number(value: Any) -> float | None:
        try:
            result = float(str(value).replace(",", "").replace("%", "").strip())
            if result != result or abs(result) == float("inf"):
                return None
            return result
        except (TypeError, ValueError, OverflowError):
            return None

    found: dict[str, float | None] = {key: None for key in metric_aliases}
    # Support long-form tables (`ratio`, `value`) and wide-form tables where
    # the metric is a column. No default numerical value is invented.
    for record in raw_records:
        normalized = {str(key).strip().lower().replace("_", " "): value for key, value in record.items()}
        label = " ".join(str(normalized.get(key, "")) for key in ("item", "metric", "ratio", "name", "index", "level 0" )).lower()
        values = list(normalized.items())
        for output_key, aliases in metric_aliases.items():
            if found[output_key] is not None:
                continue
            candidate = None
            for column, value in values:
                column_norm = column.lower()
                if any(alias in column_norm for alias in aliases):
                    candidate = number(value)
                    if candidate is not None:
                        break
            if candidate is None and any(alias in label for alias in aliases):
                # Prefer the most recent year column when present.
                year_items = sorted(
                    ((column, value) for column, value in values if any(str(year) in column for year in range(2000, 2101))),
                    key=lambda pair: pair[0], reverse=True,
                )
                for _, value in year_items or values:
                    candidate = number(value)
                    if candidate is not None:
                        break
            if candidate is not None:
                found[output_key] = candidate

    return {"symbol": symbol, **found, "source": "vnstock:Finance.ratio", "dataAvailable": any(v is not None for v in found.values()), "notes": [] if any(v is not None for v in found.values()) else ["No supported ratio fields could be normalized", *errors[:3]]}
