# PHASE 3 — CLIENT CACHE

## Status

Implemented on top of the Phase 2 frontend-only data-provider foundation.

## Implemented

### 1. Two-layer client cache

```text
Request
  ↓
Memory Cache
  ↓ miss
IndexedDB
  ↓ miss / stale
MarketDataProvider
```

Added:
- `MemoryCache`
- Native IndexedDB wrapper
- `ClientCache` service
- Persistent stores for market data, market index, company info, fundamentals, scanner results, and backtest results

No new runtime package was required for IndexedDB.

### 2. Deterministic cache keys

Keys include:

```text
provider
symbol
kind
 timeframe
startDate
endDate
```

Example shape:

```text
marketData:mock:HAH:1D:2026-01-01:2026-10-08:*
```

The HTTP provider also receives a cache namespace derived from its configured base URL and endpoint paths. Changing the configured provider endpoint therefore avoids accidental reuse of data from an unrelated source.

### 3. Centralized TTL policy

`src/models/cache.ts` is the single source of default policies:

```text
Market data       15 min
Market index      15 min
Company info       7 days
Fundamentals       24 h
Scanner results    10 min
Backtest results   24 h
```

These are configuration defaults, not strategy rules. Later phases can make them user-configurable without changing the cache engine.

### 4. Cache lifecycle

Supported operations:

- get / load
- set / persist
- invalidate by deterministic key parts
- force refresh
- cache-only read
- clear all cache
- inspect cache statistics

### 5. Offline / degraded mode

Behavior:

```text
Fresh cache
  → use cache

Stale cache + online
  → try network
  → if network fails, use stale cache

Stale cache + offline
  → use stale cache

No cache + offline
  → OFFLINE_CACHE_MISS
```

The cache provider tracks the last resolution internally:

```text
FRESH_CACHE
STALE_CACHE_FALLBACK
NETWORK
CACHE_ONLY
```

This is intentionally available to later UI layers so a future signal/scanner UI can show where its data came from without changing the quant contracts.

### 6. Provider integration

`getMarketDataProvider()` now returns a cached provider boundary. Therefore downstream pages do not need to know whether data is coming from memory, IndexedDB, or the external source.

The existing Mock Provider continues to work offline for development.

### 7. Settings UX

Settings now supports:

- `Load cached / live`
- `Refresh live`
- online / offline status
- memory cache entry count
- IndexedDB entry count
- IndexedDB availability
- refresh cache statistics
- clear all cache

### 8. Global status UX

Topbar no longer claims a hard-coded `Mock data connected` state.

It now shows the selected provider name while online, and:

```text
Offline · cache mode
```

when the browser reports offline status.

## Architecture

```text
React / TanStack Query
        ↓
CachedMarketDataProvider
        ├── Memory Cache
        │     ↓ miss
        ├── IndexedDB
        │     ↓ miss / stale
        └── MarketDataProvider
              ├── MockMarketDataProvider
              └── HttpJsonMarketDataProvider
```

The cache layer remains separate from feature engineering, strategy logic, scoring, risk, and backtesting.

## Tests added

Added focused test coverage for:

- deterministic cache keys
- date-range separation
- fresh cache hits
- stale cache retention
- invalidation
- cache-first provider behavior
- force-refresh behavior

The test suite also preserves the Phase 2 validator/provider tests.

## Verification

A focused TypeScript check covering the Phase 3 cache, models, and provider contract passed with the globally available TypeScript compiler.

A complete `npm install` / `npm run build` / Vitest execution remains unavailable in this sandbox because project dependencies are not installed locally and package installation previously timed out. I am therefore not claiming a full production build or browser-level IndexedDB integration test passed here.

## Known limitations

- IndexedDB persistence is native-browser functionality and should be verified in a real browser after `npm install`.
- Cache entries are TTL-based; advanced size-based eviction / LRU pruning is intentionally deferred until real scan volumes are measured.
- Cache metadata is available internally, but richer UI badges such as `LIVE`, `CACHED`, and `STALE` can be added to stock/scanner pages once those pages consume the cache-aware engine directly.
- Fundamentals/company methods currently use default TTL policies but do not yet expose a per-request force-refresh option; this can be added when those flows are used by the Stock/Hold engines.

## Next phase

**PHASE 4 — FEATURE ENGINE**

Implement the technical feature layer without placing formulas in React components:

- trend
- momentum
- volume / money flow
- VSA
- correlation
- relative strength
- structure
- Ichimoku
- divergence
- Volume Profile
