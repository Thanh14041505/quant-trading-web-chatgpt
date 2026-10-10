import { describe, expect, it } from "vitest"
import type { OHLCV } from "@/models/market"
import { calculateTplusSignal } from "@/quant/tplus"
import type { MarketRegimeSnapshot } from "@/quant/regime"

function buildSeries(length = 180, pattern: "trend" | "pullback" | "oversold" = "trend"): OHLCV[] {
  const rows: OHLCV[] = []
  let price = 40
  for (let i = 0; i < length; i += 1) {
    const date = new Date(Date.UTC(2026, 0, 1 + i)).toISOString().slice(0, 10)
    let daily = 0.0025
    if (pattern === "pullback" && i > length - 8) daily = -0.008
    if (pattern === "oversold" && i > length - 10) daily = -0.018
    const open = price
    const close = Math.max(5, price * (1 + daily))
    const high = Math.max(open, close) * 1.008
    const low = Math.min(open, close) * 0.992
    const volume = pattern === "pullback" && i > length - 3 ? 2_500_000 : 1_000_000
    rows.push({ symbol: "TEST", date, open, high, low, close, volume, value: close * volume })
    price = close
  }
  return rows
}

const bullRegime: MarketRegimeSnapshot = {
  symbol: "VNINDEX",
  date: "2026-06-29",
  regime: "BULL",
  confidence: "HIGH",
  score: 80,
  components: { trend: 80, breadth: 75, momentum: 78, volatility: 70, participation: 75, total: 77 },
  metrics: {
    close: 1700, ema20: 1680, ema50: 1650, ema200: 1500, ema20Slope20Pct: 2, ema50Slope20Pct: 1.2, ema200Slope20Pct: 0.4,
    adx14: 28, diPlus14: 26, diMinus14: 16, rsi14: 60, roc20: 5, atr14Pct: 1.8, rvol20: 1.2, return1dPct: 0.4, return5dPct: 1.5,
    return20dPct: 5.2, distanceFromHigh20Pct: -1, distanceFromHigh50Pct: -2, aboveEma20: true, aboveEma50: true, aboveEma200: true,
    trendAligned: true, volatilityExpansion: false,
  },
  breadth: undefined,
  strongestSectors: [],
  weakestSectors: [],
  reasons: [],
  warnings: [],
}

describe("T+ Engine", () => {
  it("returns a structured signal with score decomposition and risk plan", () => {
    const result = calculateTplusSignal({ data: buildSeries(), regime: bullRegime })
    expect(result.signal.engine).toBe("TPLUS")
    expect(result.signal.scoreBreakdown.total).toBeGreaterThanOrEqual(0)
    expect(result.signal.scoreBreakdown.total).toBeLessThanOrEqual(100)
    expect(result.signal.opportunityScore).toBe(result.signal.score)
    expect(result.signal.reasons).toBeDefined()
  })

  it("keeps trade quality and confidence separate from opportunity score", () => {
    const result = calculateTplusSignal({ data: buildSeries(180, "pullback"), regime: bullRegime })
    expect(["LOW", "MEDIUM", "HIGH"]).toContain(result.signal.tradeQuality)
    expect(["LOW", "MEDIUM", "HIGH"]).toContain(result.signal.confidence)
    expect(typeof result.signal.opportunityScore).toBe("number")
  })

  it("does not force a BUY when risk reward is insufficient", () => {
    const result = calculateTplusSignal({ data: buildSeries(90, "oversold"), regime: "BEAR", config: { minScoreToBuy: 0, minRiskReward: 10 } })
    expect(result.signal.action).not.toBe("BUY")
  })

  it("enforces chronological data", () => {
    const data = buildSeries().reverse()
    expect(() => calculateTplusSignal({ data, regime: bullRegime })).toThrow()
  })
})
