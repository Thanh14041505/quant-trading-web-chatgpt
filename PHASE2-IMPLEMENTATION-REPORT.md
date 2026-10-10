# PHASE 2 — DATA PROVIDER

## Status

Implemented on top of the Phase 1 frontend-only foundation.

## Implemented

- `MarketDataProvider` remains the abstraction boundary.
- Added browser-side `HttpJsonMarketDataProvider`.
- Added runtime provider selection:
  - Mock Provider
  - CORS JSON Provider
- Added runtime HTTP provider configuration:
  - base URL
  - bearer token / API-key-header / no auth
  - API key header name
  - health endpoint
  - historical OHLCV endpoint
  - company endpoint
  - fundamentals endpoint
  - market-index endpoint
- Added OHLCV response normalization across common JSON shapes and field aliases.
- Added data validation:
  - missing identity / non-finite values
  - negative values
  - invalid high/low relationships
  - duplicate symbol/date rows
  - deterministic date sorting
- Added provider error model:
  - invalid configuration
  - CORS/network failure
  - timeout
  - HTTP error
  - invalid JSON
  - invalid data
- Added connection status UI and latency/health feedback.
- Added a Data Smoke Test in Settings to fetch and render recent OHLCV rows.
- Test/Fetch Sample uses the current unsaved form configuration, avoiding a stale-config UX bug.
- Preserved Mock Provider for offline development.
- No backend, SQL database, proxy, or server-side runtime was added.
- Added focused unit tests for validation and HTTP provider behavior.

## Architecture

```text
Settings
  ↓
Provider Selection / Runtime Config
  ↓
MarketDataProvider
  ├── MockMarketDataProvider
  └── HttpJsonMarketDataProvider
          ↓
       Browser fetch()
          ↓
       External HTTPS JSON API
          ↓
       Normalize
          ↓
       Validate
          ↓
       Internal OHLCV / Company / Fundamentals models
```

## Deliberate frontend-only constraint

The phase does not hard-code a vnstock server endpoint. The current public `vnstock-api` project exposes vnstock through its own FastAPI/REST/GraphQL service, which would introduce the very backend dependency this V1 architecture is explicitly avoiding. A configurable HTTP adapter is therefore used until a provider with browser-compatible HTTPS + JSON + CORS behavior is selected.

## Verification

A focused TypeScript check covering the Phase 2 provider/validation modules passed with TypeScript 5.8.3.

A full `npm install` / `npm run build` was not possible in this execution environment because the project dependencies were not locally cached and package installation timed out. The source-level provider check therefore validates the new TypeScript layer, but not a complete Vite production build.

## Known limitations

- A concrete production data provider is intentionally not hard-coded because the frontend-only requirement requires confirmed browser CORS support.
- Fundamentals/company adapters intentionally support a small normalized field set for Phase 2. Broader provider-specific schemas should be added through adapters without changing the core model contracts.
- IndexedDB caching is still deferred to Phase 3.

## Next phase

PHASE 3 — CLIENT CACHE.
