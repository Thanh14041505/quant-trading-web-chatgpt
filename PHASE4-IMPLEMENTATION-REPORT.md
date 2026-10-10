# PHASE 4 — FEATURE ENGINE IMPLEMENTATION REPORT

## Status

Implemented on top of Phase 3.

## Feature groups

### Trend
- EMA10/20/50/100/200
- SMA20/50/200
- ADX14
- DI+14 / DI-14
- EMA20/50/200 slope over 20 observations
- ATR14 (added as a future risk-engine dependency)

### Momentum
- RSI7/14/21
- MACD line / signal / histogram
- ROC5 / ROC20
- MFI14
- Stochastic %K14 / %D3

### Relative Strength
- RS20 / RS60 / RS120 as point-to-point stock return
- Relative return vs benchmark
- Relative return vs sector benchmark
- Optional cross-universe percentile
- Benchmark/sector series aligned by trading date before comparison

### Correlation / beta
- Rolling 20/60/120 correlation vs benchmark
- Rolling 20/60/120 beta vs benchmark
- Benchmark series aligned by date

### Price structure
- 20D/50D/120D/200D highs and lows
- Distance from 20D high / low
- 20D range position
- Rolling HH/HL/LH/LL flags that only inspect bars available before or at the current bar
- Structure states: ACCUMULATION / BREAKOUT / MARKUP / PULLBACK / DISTRIBUTION / MARKDOWN / REVERSAL / NEUTRAL

### Volume / money flow / VSA
- RVOL20 / RVOL60
- OBV + OBV slope20
- CMF20
- MFI14
- CLV
- Up/down volume
- Conservative VSA-style heuristic flags:
  - CLIMAX_UP
  - CLIMAX_DOWN
  - ABSORPTION
  - NO_DEMAND
  - NO_SUPPLY

VSA flags are intentionally implemented as a conservative heuristic layer. They are not presented as a claim of a canonical Wyckoff/VSA textbook classifier.

### Ichimoku
- Tenkan9
- Kijun26
- Senkou A/B
- Chikou reference series
- Cloud position
- Cloud thickness
- Distance to cloud
- TK spread
- Slope-based future-cloud direction
- `calculateMultiTimeframeIchimoku()` supports daily / weekly / monthly input series without mixing timeframes internally

### Divergence
- RSI bullish/bearish divergence
- MACD bullish/bearish divergence
- Divergence is calculated against prior historical extremes only; no future candle is used to confirm a current signal.
- This is intentionally conservative and backtest-safe rather than a future-pivot-based visual detector.

### Volume Profile
- POC
- VAH
- VAL
- HVN
- LVN
- Fixed-bin profile from daily OHLCV

The Volume Profile result is explicitly marked `approximate: true` because daily OHLCV does not contain intraday/tick volume distribution.

## Architecture

```text
Normalized OHLCV
      |
      v
Indicator modules
      |
      v
Feature Engine
      |
      +--> Trend
      +--> Momentum
      +--> Volume / VSA
      +--> Relative Strength
      +--> Correlation / Beta
      +--> Price Structure
      +--> Ichimoku
      +--> Divergence
      +--> Volume Profile
      |
      v
FeatureSnapshot + IndicatorBundle
```

No strategy logic, score weights, risk rules, or backtest logic were added to Phase 4.

## UI integration

Stock Detail now consumes the real Phase 4 feature engine for:
- RS20
- RVOL20
- RSI14
- EMA50
- ADX14
- CMF20
- structure state
- Ichimoku cloud position
- VSA state

The feature engine is memoized in the page so repeated renders do not recalculate the full feature set unnecessarily.

## Files added

```text
src/indicators/alignment.ts
src/indicators/types.ts
src/indicators/utils.ts
src/indicators/trend.ts
src/indicators/momentum.ts
src/indicators/volume.ts
src/indicators/relativeStrength.ts
src/indicators/correlation.ts
src/indicators/structure.ts
src/indicators/ichimoku.ts
src/indicators/divergence.ts
src/indicators/volumeProfile.ts
src/indicators/index.ts
src/quant/features/feature-engine.ts
src/quant/features/index.ts
tests/feature-engine.test.ts
```

## Verification

Focused TypeScript compilation of the complete Phase 4 indicator/feature layer: **PASS**.

Full project dependency installation/build was not completed in this environment because `npm install` timed out. Therefore a production Vite build is **not claimed as verified here**.

## Known limitations

1. VSA classification is heuristic and should be calibrated/validated before being used directly in a trading strategy.
2. Volume Profile is approximate with daily OHLCV.
3. Relative strength currently represents return-based RS; cross-sectional stock-vs-universe scoring can be added once a universe batch is available.
4. Ichimoku multi-timeframe support accepts independently prepared timeframe datasets; higher-timeframe fetching/orchestration belongs to the scanner/data application layer.
5. No Dao Gam / Trinh Phat formula is implemented because no exact specification was supplied.

## Next phase

PHASE 5 — MARKET REGIME ENGINE.
