import { describe, expect, it } from "vitest"
import type { CompanyInfo } from "@/models/market"
import type { TplusScannerRow, ScannerConfig } from "@/quant/scanner"
import { filterAndRankRows } from "@/quant/scanner"

const constCompany = (symbol: string, exchange: CompanyInfo["exchange"] = "HOSE"): CompanyInfo => ({ symbol, name: `${symbol} Co`, exchange, sector: "Shipping & Ports" })

function row(symbol: string, score: number, averageValue20: number): TplusScannerRow {
  return {
    engine: "TPLUS",
    symbol,
    company: constCompany(symbol),
    averageValue20,
    status: "SUCCESS",
    signal: {
      symbol,
      date: "2026-10-08",
      engine: "TPLUS",
      setup: "BREAKOUT",
      action: score >= 80 ? "BUY" : "WATCH",
      score,
      opportunityScore: score,
      tradeQuality: "HIGH",
      confidence: "HIGH",
      marketRegime: "BULL",
      reasonCodes: [],
      riskCodes: [],
      reasons: [],
      risks: [],
      scoreBreakdown: { trendStructure: 0, relativeStrength: 0, setupQuality: 0, volumeMoneyFlow: 0, momentum: 0, marketRegime: 0, priceLocation: 0, liquidityRisk: 0, total: score },
      strategyVersion: "TPLUS_MULTI_SETUP_v1",
    },
  }
}

describe("scanner ranking", () => {
  it("sorts by score then liquidity and filters universe", () => {
    const config: ScannerConfig = { engine: "TPLUS", symbols: ["A", "B", "C"], universe: { minAverageValue20: 5_000_000_000 }, tplus: { minScore: 70 } }
    const result = filterAndRankRows([row("A", 80, 6e9), row("B", 80, 12e9), row("C", 65, 20e9)], config)
    expect(result.map((item) => item.symbol)).toEqual(["B", "A"])
  })
})
