# Market Regime Engine

The regime engine classifies the market into:

- BULL
- BULL_PULLBACK
- SIDEWAYS
- DISTRIBUTION
- BEAR
- PANIC

It combines index trend, breadth, momentum, volatility and participation. It is intentionally explainable and returns component scores, reasons and warnings.

`confidence` is a qualitative model confidence label, **not** a calibrated probability of winning.

The engine consumes normalized OHLCV and optional breadth/sector inputs. It does not fetch data itself.
