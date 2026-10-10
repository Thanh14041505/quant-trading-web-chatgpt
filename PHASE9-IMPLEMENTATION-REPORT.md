# PHASE 9 — STOCK DETAIL IMPLEMENTATION REPORT

## Status

Implemented on top of Phase 8 — Scanners.

## Scope delivered

- Rebuilt `/stock/:symbol` as a stock research terminal.
- Added custom SVG OHLC candlestick chart with open/high/low/close and volume.
- Added EMA20 / EMA50 overlays with toggle controls.
- Added interval controls: daily (`1D`), weekly (`1W`), monthly (`1M`). Weekly/monthly candles are aggregated from daily OHLCV in the browser.
- Added range controls: 3M, 6M, 1Y, All.
- Added hover-selected candle summary: date, O/H/L/C, volume.
- Added visible support/resistance, volume POC, and available T+ entry/SL/TP chart levels.
- Added market regime and sector-context panel: score, model confidence, index metrics, optional breadth, sector strength, reasons and warnings.
- Added technical detail panels for trend/volatility/structure, momentum, volume/money flow/VSA, relative strength/correlation/beta, Ichimoku/divergence and approximate Volume Profile.
- Expanded fundamental panels for quality, growth, valuation, balance sheet/cash flow and sector-specific fields.
- Expanded T+ panel: action, setup, opportunity score, trade quality, model confidence, score decomposition, entry/trigger/SL/TP1/TP2/R:R, reasons and risks.
- Expanded Hold panel: action, score, quality, model confidence, data completeness, component availability/weights, valuation, long-term trend, catalysts, reasons and risks.
- Added data provenance: selected provider, cache resolution, browser-side load time, latest candle date, history coverage and benchmark coverage.
- Added visible DEMO DATA warning when the Mock Provider is selected.
- Missing provider fundamentals are rendered as `N/A`, not silently represented as zero.
- Added focused chart-series unit tests for interval aggregation, EMA initialization and range selection.

## Important interpretation detail

The current `FeatureSnapshot.relativeStrength.rs20/rs60/rs120` values are the stock's own returns over those horizons. Excess return versus VNINDEX is exposed separately as `returnVsBenchmark20/60/120`. The UI labels these separately to avoid implying that absolute return is benchmark-relative strength.

## Architecture

```text
Selected Provider
      ↓
React Query
      ↓
CachedMarketDataProvider
      ↓
Daily OHLCV ────────── VNINDEX
      ↓                    ↓
Feature Engine       Market Regime Engine
      ↓                    ↓
T+ Engine  ←──────── Regime Context
Hold Engine
      ↓
Stock Detail panels + SVG chart
```

The chart transforms daily bars into weekly/monthly display bars only for visualization. T+ and Hold signals remain calculated from the loaded daily bars, so changing chart interval does not silently change the signal timeframe.

## Nice-to-have choices

- Used an in-project SVG chart instead of adding a third-party chart dependency. This keeps the frontend-only bundle self-contained while providing candlesticks, volume, EMA overlays, crosshair-style hover selection, date ranges and trade levels.
- Kept `Dao Găm / Trịnh Phát` unimplemented because there is no verified formula specification.
- Kept Volume Profile explicitly approximate because only daily OHLCV is available.

## Verification

### Passed

- `tsc -p tsconfig.quant.json --pretty false`
- `tsc -p tsconfig.scanner.json --pretty false`
- Full `src` source-level TypeScript check with strict settings and temporary ambient declarations for unavailable third-party packages.
- Syntax/transpile checks for the changed TS/TSX files.
- Focused chart-series runtime checks: daily/weekly/monthly aggregation, OHLCV aggregation totals, EMA SMA seed and range selection.

### Not verified in this sandbox

`npm install --no-audit --no-fund --prefer-offline` timed out. Therefore a dependency-backed `npm run build` and the complete Vitest suite were not run. The source-level checks above are not claimed as a substitute for a real production build.

## Known limitations

- Real data accuracy depends on the selected HTTPS/CORS-compatible provider and its schema.
- The UI displays provider-supplied fundamental values; provider-specific units must be confirmed before comparison.
- No sector benchmark provider endpoint is assumed; sector-relative fields show `N/A` when unavailable.
- Weekly/monthly candles are aggregated client-side from daily bars; they are not fetched as separate official exchange timeframes.
- Full-market company news/events and broker integration remain out of scope.
- This page does not apply portfolio-aware position sizing; that remains future risk/portfolio scope.
