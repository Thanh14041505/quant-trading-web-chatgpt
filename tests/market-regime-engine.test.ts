import { describe, expect, it } from "vitest"
import type { OHLCV } from "@/models/market"
import { calculateMarketRegime } from "@/quant/regime"

function buildSeries(symbol: string, points: number, mode: "bull" | "bear" | "sideways" | "panic") : OHLCV[] {
  const rows: OHLCV[] = []
  let price = mode === "bear" ? 120 : 100
  for (let i = 0; i < points; i += 1) {
    const date = new Date(Date.UTC(2026, 0, 1 + i)).toISOString().slice(0, 10)
    let daily = 0.001
    if (mode === "bull") daily = 0.003
    if (mode === "bear") daily = -0.003
    if (mode === "sideways") daily = i % 2 === 0 ? 0.0007 : -0.0007
    if (mode === "panic" && i > points - 4) daily = -0.055
    const open = price
    const close = Math.max(10, open * (1 + daily))
    const high = Math.max(open, close) * 1.004
    const low = Math.min(open, close) * 0.996
    const volume = mode === "panic" && i > points - 4 ? 5_000_000 : 1_000_000
    rows.push({ symbol, date, open, high, low, close, volume, value: close * volume })
    price = close
  }
  return rows
}

const healthyBreadth = {
  totalStocks: 100,
  aboveEma20Pct: 72,
  aboveEma50Pct: 68,
  advanceCount: 62,
  declineCount: 30,
  unchangedCount: 8,
  advanceDeclineRatio: 2.07,
}

const weakBreadth = {
  totalStocks: 100,
  aboveEma20Pct: 18,
  aboveEma50Pct: 15,
  advanceCount: 18,
  declineCount: 75,
  unchangedCount: 7,
  advanceDeclineRatio: 0.24,
}

describe("MarketRegimeEngine", () => {
  it("classifies a strong trend as BULL", () => {
    const result = calculateMarketRegime({ indexData: buildSeries("VNINDEX", 260, "bull"), breadth: healthyBreadth })
    expect(result.regime).toBe("BULL")
    expect(result.components.trend).toBeGreaterThan(60)
  })

  it("classifies a healthy pullback separately from a bear market", () => {
    const data = buildSeries("VNINDEX", 260, "bull")
    for (let i = data.length - 5; i < data.length; i += 1) {
      const previous = data[i - 1]
      const bar = data[i]
      bar.open = previous.close
      bar.close = previous.close * 0.99
      bar.high = previous.close * 1.001
      bar.low = previous.close * 0.985
    }
    const result = calculateMarketRegime({ indexData: data, breadth: healthyBreadth })
    expect(["BULL", "BULL_PULLBACK"]).toContain(result.regime)
    expect(result.metrics.aboveEma200).toBe(true)
  })

  it("classifies a weak trend with weak breadth as BEAR", () => {
    const result = calculateMarketRegime({ indexData: buildSeries("VNINDEX", 260, "bear"), breadth: weakBreadth })
    expect(result.regime).toBe("BEAR")
    expect(result.warnings).toContain("BEAR_TREND")
  })

  it("detects panic conditions from a sharp sell-off and volume expansion", () => {
    const result = calculateMarketRegime({ indexData: buildSeries("VNINDEX", 260, "panic"), breadth: weakBreadth })
    expect(result.regime).toBe("PANIC")
    expect(result.warnings).toContain("PANIC_RISK")
  })

  it("remains explainable when breadth is unavailable", () => {
    const result = calculateMarketRegime({ indexData: buildSeries("VNINDEX", 260, "sideways") })
    expect(result.breadth).toBeUndefined()
    expect(result.components.breadth).toBe(50)
    expect(result.reasons.length + result.warnings.length).toBeGreaterThan(0)
  })
})
