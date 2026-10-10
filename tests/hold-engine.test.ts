import { describe, expect, it } from "vitest"
import type { CompanyInfo, FundamentalData, OHLCV } from "@/models/market"
import { calculateFeatures } from "@/quant/features"
import { calculateHoldSignal } from "@/quant/hold"

function fixture(length = 260): OHLCV[] {
  let price = 50
  return Array.from({ length }, (_, i) => {
    const date = new Date(Date.UTC(2026, 0, 1 + i)).toISOString().slice(0, 10)
    price *= 1.0018
    return { symbol: "TEST", date, open: price * 0.996, high: price * 1.01, low: price * 0.99, close: price, volume: 1_000_000 + i * 1_000 }
  })
}

const company: CompanyInfo = { symbol: "TEST", name: "Test Company", exchange: "HOSE", sector: "Manufacturing" }

const strongFundamentals: FundamentalData = {
  symbol: "TEST",
  roe: 19,
  roa: 8,
  roic: 16,
  grossMargin: 38,
  operatingMargin: 18,
  netMargin: 14,
  operatingCashFlow: 1_000_000,
  freeCashFlow: 800_000,
  pe: 11,
  pb: 1.5,
  historicalPe: 14,
  historicalPb: 1.8,
  sectorMedianPe: 14,
  sectorMedianPb: 1.8,
  revenueGrowth: 16,
  epsGrowth: 22,
  revenueCagr: 14,
  profitCagr: 18,
  debtToEquity: 0.5,
  inventory: 30,
  catalysts: ["EARNINGS_GROWTH"],
  risks: [],
}

describe("Hold Engine", () => {
  it("returns a structured long-horizon signal", () => {
    const data = fixture()
    const features = calculateFeatures(data)
    const result = calculateHoldSignal({ data, features, company, fundamentals: strongFundamentals })
    expect(result.signal.engine).toBe("HOLD")
    expect(result.signal.score).toBeGreaterThanOrEqual(0)
    expect(result.signal.score).toBeLessThanOrEqual(100)
    expect(result.signal.dataCompleteness).toBeGreaterThan(80)
    expect(result.signal.scoreBreakdown.longTermTrend).toBeGreaterThan(50)
  })

  it("does not silently treat missing fundamentals as zero quality", () => {
    const data = fixture()
    const features = calculateFeatures(data)
    const result = calculateHoldSignal({ data, features, company, fundamentals: { symbol: "TEST" } })
    expect(result.signal.dataCompleteness).toBeLessThan(50)
    expect(result.signal.confidence).toBe("LOW")
    expect(["WAIT", "WATCH"]).toContain(result.signal.action)
    expect(result.signal.riskCodes).toContain("MISSING_GROWTH_DATA")
  })

  it("keeps the valuation label separate from the total score", () => {
    const data = fixture()
    const features = calculateFeatures(data)
    const expensive = { ...strongFundamentals, pe: 40, pb: 5, sectorMedianPe: 14, sectorMedianPb: 1.8 }
    const result = calculateHoldSignal({ data, features, company, fundamentals: expensive })
    expect(["ATTRACTIVE", "FAIR", "RICH", "UNKNOWN"]).toContain(result.signal.valuationLabel)
    expect(result.signal.valuationLabel).toBe("RICH")
  })
})
