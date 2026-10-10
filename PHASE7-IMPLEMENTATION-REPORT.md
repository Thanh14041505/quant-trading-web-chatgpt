# PHASE 7 — HOLD ENGINE IMPLEMENTATION REPORT

## Status

PHASE 7 IMPLEMENTED.

## Scope

The Hold Engine targets a >=3 month holding horizon and follows the master prompt scoring model:

```text
Quality / Business Quality      20%
Growth / Earnings Growth        25%
Balance Sheet + Cash Flow       20%
Valuation                       15%
Long-term Trend                 15%
Catalyst / Risk                  5%
```

The implementation uses configurable weights through `HoldConfig`.

## Implemented files

```text
src/quant/hold/types.ts
src/quant/hold/hold-engine.ts
src/quant/hold/index.ts
src/quant/hold/README.md
tests/hold-engine.test.ts
```

Supporting model changes:

```text
src/models/market.ts
src/data/providers/mockProvider.ts
src/pages/stock/stock-page.tsx
src/pages/hold/hold-page.tsx
src/quant/index.ts
tsconfig.quant.json
```

## Model details

### Quality

Uses available ROE, ROA, ROIC and margin data. Sector-specific metrics are included where supported:

- Banks: NIM, NPL, provisioning coverage, CASA
- Securities: brokerage share growth, margin lending growth, proprietary trading growth
- Real Estate: inventory, project pipeline, leverage and legal status
- Manufacturing: margins, inventory, FCF and leverage

### Growth

Uses revenue growth, EPS growth, revenue CAGR and profit CAGR when available.

### Balance sheet / cash flow

Uses debt/equity, operating cash flow, free cash flow and interest coverage.

### Valuation

Uses PE, PB, EV/EBITDA, PEG, dividend yield and historical / sector-relative PE/PB when available.

### Long-term trend

Uses price vs EMA200, EMA200 slope, EMA50 slope, RS120 and market structure.

### Catalyst / risk

Provider-supplied catalyst/risk tags are preserved. Legal status can also contribute to the risk assessment. The engine does not invent a catalyst when the provider has not supplied one.

## Missing data policy

Missing data is not silently converted to a zero component score. Each component exposes:

- `available`
- component score
- weight
- reasons
- risks

Overall score is re-normalized across available components, while `dataCompleteness` and `confidence` disclose the missing-data situation.

Critical low completeness can force `WAIT` rather than generating a falsely confident HOLD/BUY.

## Outputs

The engine returns:

- Action: BUY / HOLD / WATCH / WAIT / TRIM / NO_TRADE
- Score
- Quality
- Confidence
- Data completeness
- Valuation label
- Long-term trend state
- Score decomposition
- Reason codes
- Risk codes
- Catalysts
- Strategy version: `HOLD_QUALITY_GROWTH_v1`

## UI integration

Stock Detail now includes a Hold Engine panel with:

- action / score / quality / confidence
- data completeness
- score decomposition
- sector / valuation / long-term trend
- catalysts
- reasons
- risks / data gaps

The Hold Scanner page explicitly keeps universe-wide ranking/filtering for Phase 8.

## Verification

Focused TypeScript quant-layer check:

```text
tsc -p tsconfig.quant.json --pretty false
PASS
```

A full application build/test was not claimed because the working environment does not contain `node_modules` and package installation is unavailable/reliably cacheable in this run.

## Nice-to-have added

The engine tracks `dataCompleteness` explicitly. This is intended to prevent a future scanner from ranking a richly-covered company and a sparse-data company as though they had equal evidence quality.

## Next phase

PHASE 8 — SCANNERS:

- T+ Scanner
- Hold Scanner
- ranking
- filtering
- sorting
- universe orchestration
- cached scanner results
