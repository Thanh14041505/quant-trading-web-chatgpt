# VN Quant Trading Terminal

Client-side quant research application for HOSE / HNX / UPCOM, with Vercel Python Functions under `/api` for VNStock data access. Indicator calculations, strategy scoring, cache and backtests continue to run in the browser.

## Phase 1 — Foundation

Implemented:
- React + Vite + TypeScript
- Tailwind CSS v4 via the Vite plugin
- shadcn-compatible component structure and configuration
- React Router routes
- TanStack Query provider
- Professional light/dark terminal shell
- Dashboard / T+ / Hold / Stock / Backtest / Settings routes
- `MarketDataProvider` abstraction
- Mock market-data provider for development
- Runtime API-key input stored in `sessionStorage`
- Vercel SPA rewrite

## Phase 2 — Data Provider

Implemented:
- `HttpJsonMarketDataProvider` consuming same-origin Vercel Python Functions by default
- Runtime provider selection between Mock and HTTP JSON Provider
- Base URL / auth / endpoint configuration in Settings
- Python file-based data endpoints under `/api`: health, OHLCV, index, company, fundamentals and bounded batch scan
- OHLCV normalization across common response envelopes and field aliases
- Data validation and structured provider errors
- Provider connection test and data smoke test
- No SQL database or separate always-on server; VNStock calls execute as Vercel serverless Python functions

## Phase 3 — Client Cache

Implemented:
- Two-layer cache: Memory → IndexedDB
- Deterministic cache keys using provider / symbol / timeframe / date range
- TTL policies centralized in `src/models/cache.ts`
- Fresh vs stale cache status
- Automatic cache-first reads
- Force-refresh mode
- Cache-only mode
- Offline fallback to stale cached data
- Explicit `OFFLINE_CACHE_MISS` when no local data exists
- Cache invalidation and full clear
- Cache statistics in Settings
- Online/offline status indicator in the top bar
- Provider cache namespace so changing HTTP endpoint configuration does not reuse unrelated cached data
- No additional runtime dependency required for IndexedDB

### Default cache policies

| Data | TTL | Offline stale fallback |
|---|---:|---|
| Market data | 15 min | Yes |
| Market index | 15 min | Yes |
| Company info | 7 days | Yes |
| Fundamentals | 24 hours | Yes |
| Scanner results | 10 min | Yes |
| Backtest results | 24 hours | Yes |

A stale cache entry may be used when live data is unavailable, but cache state is tracked internally so later UI/engine layers can distinguish fresh cache, stale fallback, and network data.

## Requirements

- Node.js 20+
- npm 10+
- For deployed VNStock API routes: Python dependency manifests from a verified/working VNStock installation (see `VNSTOCK-VERCEL-API-SETUP.md`)

## Run

Frontend-only development:

```bash
npm install
npm run dev
```

To exercise the Python endpoints locally, use Vercel CLI (`npx vercel dev`) from the project root after configuring its Python dependencies. `npm run dev` alone starts Vite and does not execute `api/*.py`.

## Build

```bash
npm run build
```

## Design principle

The UI does not own quant logic. Future layers should flow through:

UI → Application → Data Provider → Feature Engine → Strategy → Scoring → Risk → Backtest

## Data provider contract

See `src/data/providers/market-data-provider.ts`.

All external data sources should normalize into internal `OHLCV`, `CompanyInfo`, and `FundamentalData` models before the strategy layer sees them.

## Cache architecture

```text
Application / React Query
        ↓
CachedMarketDataProvider
        ↓
   Memory Cache
        ↓ miss
     IndexedDB
        ↓ miss / stale
 MarketDataProvider
        ↓
 External HTTPS JSON API
```

The cache layer is deliberately independent from the quant engine. Feature/strategy/backtest code should never need to know whether data came from memory, IndexedDB, or the external provider.

## Security note

The preferred VNStock credential is `VNSTOCK_API_KEY` in Vercel Project → Settings → Environment Variables; it is read server-side. A key entered in the browser Settings is sent in `X-VNSTOCK-KEY` and is visible in browser DevTools, so use that fallback only for private personal use. Keep the deployment protected: the `/api` routes should not become an unrestricted public proxy to your upstream quota.

## Phase 4 status

Phase 4 Feature Engine is implemented. The client-side quant layer now exposes pure functions for trend, momentum, volume/VSA, relative strength, correlation/beta, price structure, Ichimoku, look-ahead-safe divergence and approximate daily-OHLCV volume profile.

## Phase 5 status

Phase 5 Market Regime Engine is implemented with six regimes: BULL, BULL_PULLBACK, SIDEWAYS, DISTRIBUTION, BEAR, and PANIC. The engine combines trend, breadth, momentum, volatility, and participation, returns component scores plus reason/warning codes, and is integrated into the Dashboard.

Breadth is treated as optional input. When no market-universe dataset is available, the engine uses a neutral breadth score rather than inventing market-wide statistics. The Mock Provider dashboard uses a clearly labeled sample universe for development only.

## Phase 6 — T+ Engine

Phase 6 adds the rule-based T+ engine for 3–15 trading sessions. It uses Market Regime + Phase 4 features to detect setups, validate them, score opportunities, build entry/SL/TP plans, calculate R:R, and return an explainable action.

The engine is single-symbol by design. Market-wide ranking/filtering is deferred to Phase 8 Scanner implementation.

## Phase 7 — Hold Engine

`HOLD_QUALITY_GROWTH_v1` is implemented client-side with the following model layers:

- Earnings growth
- Business quality
- Balance sheet / cash flow
- Valuation
- Long-term trend
- Catalyst / risk

The engine is sector-aware for Banks, Securities, Real Estate, Manufacturing, Technology, and Shipping & Ports. Missing fundamentals are tracked through `dataCompleteness` and confidence instead of being silently scored as zero.

The Stock Detail page now exposes Hold score decomposition, action, quality, confidence, valuation label, long-term trend, catalysts, reasons, and risks. Universe-wide Hold scanning remains a Phase 8 responsibility.

## Phase 8 — Scanners

Phase 8 adds client-side multi-symbol T+ and Hold scanners. The scanner layer uses bounded concurrency, per-symbol error isolation, client-side ranking/filtering, and the existing Memory + IndexedDB cache. A configured/default symbol universe and Custom Symbol List mode are supported.

Because no universal market-universe endpoint is assumed, the scanner does not claim to discover the full HOSE/HNX/UPCOM universe automatically. Use Custom Symbol List for a complete user-supplied universe until a browser/CORS-compatible universe endpoint is available.

## Phase 9 — Stock Detail

`/stock/:symbol` is now a stock research terminal combining an OHLC candlestick chart, EMA20/EMA50 overlays, volume, daily/weekly/monthly display intervals, date-range controls, trade levels, market regime, technical features, relative strength/correlation, Ichimoku/divergence, approximate daily-OHLCV Volume Profile, T+ and Hold plans, fundamentals, catalysts/risks, and provider/cache provenance.

The chart's weekly/monthly bars are display transformations of the loaded daily series. T+ and Hold calculations continue to use daily bars regardless of chart selection. Mock Provider data is explicitly marked as synthetic/demo data. Missing fundamentals and unavailable benchmark-relative metrics are shown as `N/A` rather than fabricated values.

See `PHASE9-IMPLEMENTATION-REPORT.md` for scope and verification details.

## Phase 10 — Backtest

> **Build fix follow-up:** see `BUILD-FIX-REPORT.md` for the TypeScript fixes for Vite env types, Market Regime breadth inference, Backtest numeric input typing, unused imports, and the T+ sector filter.


Phase 10 adds a browser-only, long-only event-driven T+ backtest engine and runs calculations in a Web Worker. Signals use historical prefixes through close `T`; fills occur no earlier than the next stock session's open. The simulator supports shared cash, risk-based lot sizing, position/exposure limits, commission, selling tax, slippage, SL/TP/time exits, MAE/MFE, an equity curve, drawdown, monthly and regime-based summaries, and CSV trade export.

Integrity safeguards include OHLCV validation, stop-first handling when a daily candle crosses both stop and target, actual-fill R:R validation after overnight gaps, and benchmark filtering to the selected end date. The result includes warnings about incomplete historical universes and unsupported corporate actions, price limits, settlement and intraday fills. Hold backtesting is deliberately disabled until point-in-time fundamentals with announcement dates are available. Mock Provider data is for software checks only, not evidence of trading performance.

See `PHASE10-IMPLEMENTATION-REPORT.md` and `src/quant/backtest/README.md` for details and verification status.
## VNStock Python API (Vercel)

See [VNSTOCK-VERCEL-API-SETUP.md](./VNSTOCK-VERCEL-API-SETUP.md) for the `/api` Python function routes, server-side `VNSTOCK_API_KEY` setup, local testing via `npx vercel dev`, and the current VNStock PyPI quarantine caveat.

