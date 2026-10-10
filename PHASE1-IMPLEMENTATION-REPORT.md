# PHASE 1 — FOUNDATION

## Status

Implemented as a standalone frontend-only React/Vite project.

## Files / areas created

- Vite + React + TypeScript configuration
- Tailwind CSS v4 Vite plugin setup
- shadcn-compatible `components.json` and local UI primitives
- React Router application routing
- TanStack Query application provider
- Responsive terminal shell with sidebar and topbar
- Dark/light theme
- Quick navigation command palette (`Ctrl/Cmd + K`)
- Dashboard
- T+ Scanner UI shell
- Hold Scanner UI shell
- Stock Detail UI shell
- Backtest UI shell
- Settings UI shell
- `MarketDataProvider` contract
- Mock market data provider
- Provider registry
- Runtime API key/session storage UI
- Vercel SPA rewrite
- README and quant-engine boundary documentation

## Architecture

```text
React UI
  ↓
Application / Router
  ↓
Data Provider abstraction
  ↓
Future Feature Engine
  ↓
Future Strategy Engine
  ↓
Future Scoring / Risk
  ↓
Future Backtest Worker
```

Phase 1 intentionally stops before implementing real indicator, strategy, scoring, risk, and backtest formulas.

## Acceptance check

Source-level checks passed for:

- Six required routes
- MarketDataProvider abstraction
- Mock provider
- No backend / server directory
- Vercel rewrite
- No hard-coded API key

## Build verification

`npm install --offline` could not run because the execution environment has no cached npm package metadata for the required dependencies. Therefore `npm run build` could not be executed here. This is an environment limitation, not a source-level build result.

The project is ready to install normally in a network-enabled local environment with Node.js 20+.

## Next phase

PHASE 2 — DATA PROVIDER.

The next implementation should add the first real browser-compatible CORS-enabled provider adapter, while preserving the `MarketDataProvider` interface and mock provider for development/testing.
