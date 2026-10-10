import type { OHLCV } from "@/models/market"
import { rollingMax, rollingMin, safeDiv } from "./utils"
import type { MarketStructureState } from "./types"
import { ema } from "./trend"

function classifyState(data: OHLCV[], i: number, high20: number[], low20: number[], ema20: number[], ema50: number[], volumeRatio: number[]): MarketStructureState {
  if (i < 20 || !Number.isFinite(ema20[i]) || !Number.isFinite(ema50[i])) return "NEUTRAL"
  const close = data[i].close
  const prevHigh20 = i > 20 ? high20[i - 1] : Number.NaN
  const prevLow20 = i > 20 ? low20[i - 1] : Number.NaN
  const rangePos = safeDiv(close - low20[i], high20[i] - low20[i])
  const breakout = Number.isFinite(prevHigh20) && close > prevHigh20 && volumeRatio[i] >= 1.2
  const breakdown = Number.isFinite(prevLow20) && close < prevLow20 && volumeRatio[i] >= 1.2
  const trendUp = close > ema20[i] && ema20[i] > ema50[i]
  const trendDown = close < ema20[i] && ema20[i] < ema50[i]
  const pullback = trendUp && rangePos < 0.55
  const distribution = trendUp && rangePos > 0.8 && volumeRatio[i] > 1.6 && close < data[i].high * 0.995

  if (breakout) return "BREAKOUT"
  if (breakdown) return "MARKDOWN"
  if (distribution) return "DISTRIBUTION"
  if (trendDown) return "MARKDOWN"
  if (pullback) return "PULLBACK"
  if (trendUp) return "MARKUP"
  if (rangePos >= 0.35 && rangePos <= 0.65 && volumeRatio[i] < 1) return "ACCUMULATION"
  if ((trendUp && !trendDown) && rangePos < 0.25) return "REVERSAL"
  return "NEUTRAL"
}

export function calculatePriceStructure(data: OHLCV[], volumeRatio: number[]) {
  const highs = data.map((bar) => bar.high)
  const lows = data.map((bar) => bar.low)
  const closes = data.map((bar) => bar.close)
  const high20 = rollingMax(highs, 20)
  const low20 = rollingMin(lows, 20)
  const high50 = rollingMax(highs, 50)
  const low50 = rollingMin(lows, 50)
  const high120 = rollingMax(highs, 120)
  const low120 = rollingMin(lows, 120)
  const high200 = rollingMax(highs, 200)
  const low200 = rollingMin(lows, 200)
  const ema20 = ema(closes, 20)
  const ema50 = ema(closes, 50)
  const rangePosition20 = closes.map((close, i) => safeDiv(close - low20[i], high20[i] - low20[i]))
  const state = data.map((_, i) => classifyState(data, i, high20, low20, ema20, ema50, volumeRatio))
  const hh = data.map((bar, i) => i >= 20 && bar.high > Math.max(...highs.slice(i - 20, i)))
  const hl = data.map((bar, i) => i >= 20 && bar.low > Math.min(...lows.slice(i - 20, i)))
  const lh = data.map((bar, i) => i >= 20 && bar.high < Math.max(...highs.slice(i - 20, i)))
  const ll = data.map((bar, i) => i >= 20 && bar.low < Math.min(...lows.slice(i - 20, i)))
  return {
    high20,
    low20,
    high50,
    low50,
    high120,
    low120,
    high200,
    low200,
    distanceFromHigh20: closes.map((close, i) => safeDiv(close, high20[i]) * 100 - 100),
    distanceFromLow20: closes.map((close, i) => safeDiv(close, low20[i]) * 100 - 100),
    rangePosition20,
    state,
    hh,
    hl,
    lh,
    ll,
  }
}
