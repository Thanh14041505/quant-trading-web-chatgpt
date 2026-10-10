# Quant Engine Boundary

Phase 4 introduces a pure client-side feature layer. Indicators and feature calculations live outside React components and consume normalized OHLCV only.

Feature groups implemented:
- Trend: EMA/SMA 10/20/50/100/200, ADX/DI, ATR14, slope
- Momentum: RSI 7/14/21, MACD, ROC 5/20, MFI, Stochastic
- Relative Strength: RS20/60/120, benchmark/sector relative return, percentile
- Correlation: rolling correlation and beta vs benchmark
- Price Structure: rolling highs/lows 20/50/120/200, distance, range position, rolling HH/HL/LH/LL, structure state
- Volume/VSA: RVOL, OBV, CMF, CLV, up/down volume and conservative VSA heuristics
- Ichimoku: Tenkan/Kijun/Senkou A/B/Chikou, cloud position, thickness and slope-based future cloud direction; callable for daily/weekly/monthly series
- Divergence: look-ahead-safe rolling regular divergence checks against prior historical extremes; no future-candle pivot confirmation
- Volume Profile: daily-OHLCV approximation of POC/VAH/VAL/HVN/LVN

Important: Volume Profile is explicitly approximate when only daily OHLCV is available. Divergence and structure implementations do not use future candles to confirm signals at the current bar.

Recommended next stages:
1. `src/quant/regime/*`
2. `src/quant/strategies/*`
3. `src/quant/scoring/*`
4. `src/quant/risk/*`
5. `src/quant/backtest/*`

## T+ Engine

Phase 6 implements a rule-based 3–15 session T+ engine with setup detection, explainable scoring, entry zone, invalidation/stop, TP1/TP2, R:R, trade quality, confidence, reason codes and strategy versioning.

The engine deliberately keeps `opportunityScore`, `tradeQuality` and `confidence` separate. It does not treat confidence as a calibrated win probability.
