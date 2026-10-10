# PHASE 8 — SCANNERS IMPLEMENTATION REPORT

## Status

Implemented on top of Phase 7.

## Scope implemented

- Client-side T+ scanner orchestration.
- Client-side Hold scanner orchestration.
- Configured universe + Custom Symbol List mode.
- Concurrency-limited multi-symbol processing.
- Per-symbol error isolation.
- Market context loaded once per scan and reused across symbols.
- Feature snapshots attached to scanner rows.
- Ranking by score, then 20D average traded value.
- Client-side filtering for symbol/search, score, setup/action, exchange, sector and liquidity.
- Scanner result caching through IndexedDB + memory cache.
- Fresh scanner-cache reads, forced refresh and stale fallback through existing client-cache layer.
- Progress UI: processed / success / failed.
- T+ table aligned with Phase 8 fields and Phase 6 signal model.
- Hold table aligned with Phase 7 signal model and fundamental fields.
- Mock provider value normalization adjusted so the default 5B VND liquidity filter behaves realistically with mock price units.

## Architecture

```text
Scanner Page
  ↓
useScanner
  ↓
Scanner Cache
  ├── FRESH → render immediately
  └── MISS/refresh → scanUniverse
                         ↓
                  Market Context
                  (VNINDEX once)
                         ↓
              bounded symbol concurrency
                         ↓
             Data Provider + Cache
                         ↓
              Feature Engine
                 ↙             ↘
             T+ Engine      Hold Engine
                 ↘             ↙
                    Scanner Rows
                         ↓
                 client-side filters
                         ↓
                     ranking
                         ↓
                        UI
```

## Important frontend-only limitation

V1 does not have a universal market-universe endpoint. Therefore the scanner currently operates on a configured/default symbol list or a user-supplied custom list. The app does not pretend that the default development list is the complete HOSE/HNX/UPCOM universe.

For a real provider, the recommended next improvement is a browser-compatible universe endpoint. Until that exists, users can paste a complete symbol list into Custom Symbol List.

## Data quality / error isolation

A failed symbol produces a `ScannerError` and does not stop the rest of the scan.

Examples:

- `INSUFFICIENT_HISTORY`
- `OFFLINE_*`
- `CORS_*`
- provider HTTP/network failures

## Caching

Scanner results use `scannerResults` cache entries and a stable key based on:

- provider
- engine
- symbols
- universe/filter configuration

Scanner cache TTL follows the Phase 3 policy: 10 minutes.

A scan can use:

- fresh cached result
- live/network calculation
- stale cached fallback when the live scan fails
- cache-only mode at engine level

## Verification

### PASS

Source-level TypeScript checks:

```text
src/quant + scanner core → PASS
```

Commands:

```bash
tsc -p tsconfig.quant.json --pretty false
tsc -p tsconfig.scanner.json --pretty false
```

### Not verified in sandbox

The full Vite production build and Vitest suite were not executed because dependency installation timed out in the sandbox environment. This is an environment limitation, not a claimed test pass.

## Nice-to-have enhancements flagged for later

- Real market-universe discovery endpoint.
- Web Worker orchestration for very large universes.
- Sector benchmark injection into per-stock feature calculations.
- Scan cancellation via AbortController.
- Persistent saved scan profiles.
- Scanner comparison / "what changed since previous scan".
