import { describe, expect, it } from "vitest"
import type { OHLCV } from "@/models/market"
import { DEFAULT_BACKTEST_CONFIG, calculateBacktestMetrics, deriveMonthlyReturns, simulatePortfolio } from "@/quant/backtest/backtest-engine"
import type { BacktestSignalEvent, PortfolioSimulationInput } from "@/quant/backtest"
import type { TradingSignal } from "@/quant/tplus"

function bar(date: string, open: number, high: number, low: number, close: number): OHLCV {
  return { symbol: "HAH", date, open, high, low, close, volume: 100_000, value: close * 100_000 }
}

function buildSignal(date = "2026-01-01"): TradingSignal {
  return {
    symbol: "HAH",
    date,
    engine: "TPLUS",
    setup: "BREAKOUT",
    action: "BUY",
    score: 85,
    opportunityScore: 85,
    tradeQuality: "HIGH",
    confidence: "MEDIUM",
    entryZone: { low: 9.5, high: 10.5 },
    trigger: "Breakout confirmed",
    stopLoss: 9,
    tp1: 12,
    tp2: 13,
    riskReward: 2,
    riskRewardTp2: 3,
    reasons: ["TEST_SIGNAL"],
    risks: [],
    reasonCodes: ["TEST_SIGNAL"],
    riskCodes: [],
    marketRegime: "BULL",
    scoreBreakdown: { trendStructure: 80, relativeStrength: 80, setupQuality: 85, volumeMoneyFlow: 80, momentum: 80, marketRegime: 80, priceLocation: 80, liquidityRisk: 80, total: 85 },
    riskPlan: { referenceEntry: 10, stopLoss: 9, tp1: 12, tp2: 13, riskPerShare: 1, rewardToTp1: 2, rewardToTp2: 3, riskRewardTp1: 2, riskRewardTp2: 3 },
    strategyVersion: "TPLUS_MULTI_SETUP_v1",
  }
}

function simInput(rows: OHLCV[], exitModel: BacktestSimulationExit = "SL_TP_PARTIAL", overrides: Partial<PortfolioSimulationInput["config"]> = {}): PortfolioSimulationInput {
  const config = {
    ...DEFAULT_BACKTEST_CONFIG,
    symbols: ["HAH"],
    startDate: "2026-01-01",
    endDate: "2026-01-03",
    initialCapital: 100_000,
    commissionPct: 0.1,
    sellingTaxPct: 0.1,
    slippagePct: 0.1,
    lotSize: 100,
    riskPerTradePct: 1,
    maxPositionPct: 50,
    maxPortfolioExposurePct: 100,
    maxOpenPositions: 1,
    maxHoldingSessions: 15,
    exitModel,
    ...overrides,
  }
  const signal = buildSignal()
  const event: BacktestSignalEvent = { symbol: "HAH", signalDate: "2026-01-01", entryDate: "2026-01-02", setup: "BREAKOUT", score: 85, regime: "BULL", signal }
  return { config, strategy: "TPLUS_MULTI_SETUP_v1", barsBySymbol: { HAH: rows }, signalEvents: [event], providerId: "mock", isDemoData: true, benchmarkData: [] }
}

type BacktestSimulationExit = "SL_TP_PARTIAL" | "SL_TP2_ONLY" | "TIME_STOP"

describe("Event-driven backtest engine", () => {
  it("executes a close-T signal no earlier than the next session open and counts TP1/TP2", () => {
    const result = simulatePortfolio(simInput([
      bar("2026-01-01", 10, 10.4, 9.8, 10),
      bar("2026-01-02", 10, 10.5, 9.5, 10.1),
      bar("2026-01-03", 10.2, 13.5, 9.8, 13.2),
    ]))
    expect(result.trades).toHaveLength(1)
    expect(result.trades[0].signalDate).toBe("2026-01-01")
    expect(result.trades[0].entryDate).toBe("2026-01-02")
    expect(result.trades[0].tp1Hit).toBe(true)
    expect(result.trades[0].tp2Hit).toBe(true)
    expect(result.trades[0].exitReason).toBe("TP2")
    expect(result.trades[0].commissionVnd).toBeGreaterThan(0)
    expect(result.trades[0].taxVnd).toBeGreaterThan(0)
  })

  it("assumes stop-loss first when one daily candle crosses both stop and targets", () => {
    const result = simulatePortfolio(simInput([
      bar("2026-01-01", 10, 10.4, 9.8, 10),
      bar("2026-01-02", 10, 13, 8, 10.5),
      bar("2026-01-03", 10.5, 10.8, 10.2, 10.6),
    ]))
    expect(result.trades).toHaveLength(1)
    expect(result.trades[0].exitReason).toBe("SL")
    expect(result.trades[0].slHit).toBe(true)
    expect(result.trades[0].tp1Hit).toBe(false)
    expect(result.trades[0].tp2Hit).toBe(false)
    expect(result.trades[0].exitDate).toBe("2026-01-02")
  })

  it("rejects duplicated or out-of-order candles instead of silently repairing them", () => {
    expect(() => simulatePortfolio(simInput([
      bar("2026-01-02", 10, 10.4, 9.8, 10),
      bar("2026-01-01", 10, 10.4, 9.8, 10),
    ]))).toThrow(/unique and chronological/)
  })


  it("exits at the closing price when the configured maximum holding session is reached", () => {
    const result = simulatePortfolio(simInput([
      bar("2026-01-01", 10, 10.4, 9.8, 10),
      bar("2026-01-02", 10, 10.5, 9.8, 10.3),
      bar("2026-01-03", 10.3, 10.5, 10.1, 10.4),
    ], "TIME_STOP", { maxHoldingSessions: 1 }))
    expect(result.trades).toHaveLength(1)
    expect(result.trades[0].exitReason).toBe("TIME_STOP")
    expect(result.trades[0].exitDate).toBe("2026-01-02")
  })

  it("skips a next-open gap when the actual fill no longer meets minimum R:R", () => {
    const result = simulatePortfolio(simInput([
      bar("2026-01-01", 10, 10.4, 9.8, 10),
      bar("2026-01-02", 12, 12.5, 11.8, 12.2),
      bar("2026-01-03", 12.2, 12.5, 12.0, 12.3),
    ]))
    expect(result.trades).toHaveLength(0)
  })

  it("calculates monthly return and empty-trade metrics safely", () => {
    const equity = [
      { date: "2026-01-02", equity: 101_000, cash: 101_000, exposureVnd: 0, exposurePct: 0, drawdownPct: 0 },
      { date: "2026-02-02", equity: 99_000, cash: 99_000, exposureVnd: 0, exposurePct: 0, drawdownPct: -1.98 },
    ]
    const monthly = deriveMonthlyReturns(equity, 100_000)
    expect(monthly).toHaveLength(2)
    expect(monthly[0].returnPct).toBeCloseTo(1)
    const metrics = calculateBacktestMetrics([], equity, { ...DEFAULT_BACKTEST_CONFIG, initialCapital: 100_000 }, 0, 0, 0)
    expect(metrics.trades).toBe(0)
    expect(metrics.finalEquity).toBe(99_000)
    expect(metrics.winRatePct).toBe(0)
  })
})
