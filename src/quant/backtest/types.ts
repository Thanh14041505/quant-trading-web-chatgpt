import type { OHLCV } from "@/models/market"
import type { MarketRegime } from "@/quant/regime"
import type { TradingSignal, TplusSetup } from "@/quant/tplus"

export type BacktestStrategy =
  | "TPLUS_MULTI_SETUP_v1"
  | "TPLUS_BREAKOUT_v1"
  | "TPLUS_PULLBACK_v1"
  | "TPLUS_DIVERGENCE_v1"
  | "TPLUS_MEAN_REVERSION_v1"

export type BacktestEntryModel = "NEXT_OPEN" | "NEXT_OPEN_IF_IN_ZONE"
export type BacktestExitModel = "SL_TP_PARTIAL" | "SL_TP2_ONLY" | "TIME_STOP"
export type BacktestStage = "LOADING" | "SIGNALS" | "SIMULATION" | "COMPLETE" | "ERROR"

export interface BacktestConfig {
  symbols: string[]
  startDate: string
  endDate: string
  initialCapital: number
  commissionPct: number
  sellingTaxPct: number
  slippagePct: number
  lotSize: number
  riskPerTradePct: number
  maxPositionPct: number
  maxPortfolioExposurePct: number
  maxOpenPositions: number
  maxHoldingSessions: number
  minScoreToBuy: number
  minRiskReward: number
  entryModel: BacktestEntryModel
  exitModel: BacktestExitModel
}

export interface BacktestInput {
  config: BacktestConfig
  strategy: BacktestStrategy
  barsBySymbol: Record<string, OHLCV[]>
  benchmarkData: OHLCV[]
  providerId: string
  isDemoData: boolean
}

export interface BacktestSignalEvent {
  symbol: string
  signalDate: string
  entryDate: string
  setup: TplusSetup
  score: number
  regime: MarketRegime
  signal: TradingSignal
}

export interface BacktestTrade {
  id: string
  symbol: string
  strategy: BacktestStrategy
  strategyVersion: string
  setup: TplusSetup
  regime: MarketRegime
  signalDate: string
  entryDate: string
  exitDate: string
  entryPrice: number
  averageExitPrice: number
  initialShares: number
  exitShares: number
  pnlVnd: number
  returnPct: number
  riskMultiple: number
  commissionVnd: number
  taxVnd: number
  holdingSessions: number
  exitReason: "SL" | "TP1" | "TP2" | "TIME_STOP" | "END_OF_TEST"
  tp1Hit: boolean
  tp2Hit: boolean
  slHit: boolean
  maePct: number
  mfePct: number
  opportunityScore: number
  reasons: string[]
  risks: string[]
}

export interface EquityPoint {
  date: string
  equity: number
  cash: number
  exposureVnd: number
  exposurePct: number
  drawdownPct: number
}

export interface MonthlyReturn {
  month: string
  returnPct: number
  endEquity: number
}

export interface RegimePerformance {
  regime: MarketRegime
  trades: number
  winRatePct: number
  totalPnlVnd: number
  averageReturnPct: number
  profitFactor: number | null
}

export interface BacktestMetrics {
  totalReturnPct: number
  cagrPct: number | null
  maxDrawdownPct: number
  sharpeRatio: number | null
  sortinoRatio: number | null
  winRatePct: number
  averageWinPct: number | null
  averageLossPct: number | null
  averageWinVnd: number | null
  averageLossVnd: number | null
  expectancyVnd: number | null
  expectancyR: number | null
  profitFactor: number | null
  trades: number
  averageHoldingSessions: number | null
  exposurePct: number
  timeInMarketPct: number
  turnoverPct: number
  tp1HitRatePct: number
  tp2HitRatePct: number
  slHitRatePct: number
  averageMaePct: number | null
  averageMfePct: number | null
  grossProfitVnd: number
  grossLossVnd: number
  finalEquity: number
}

export interface BacktestResult {
  id: string
  createdAt: string
  providerId: string
  isDemoData: boolean
  strategy: BacktestStrategy
  config: BacktestConfig
  dataSummary: {
    symbolsRequested: string[]
    symbolsProcessed: string[]
    symbolErrors: Array<{ symbol: string; message: string }>
    benchmarkSymbol: string
    benchmarkBars: number
    startDateAvailable: string | null
    endDateAvailable: string | null
    barsBySymbol: Record<string, number>
    warnings: string[]
  }
  metrics: BacktestMetrics
  equityCurve: EquityPoint[]
  trades: BacktestTrade[]
  monthlyReturns: MonthlyReturn[]
  regimePerformance: RegimePerformance[]
  exitDistribution: Array<{ reason: string; trades: number }>
  returnDistribution: Array<{ bucket: string; trades: number }>
}

export interface BacktestProgress {
  stage: BacktestStage
  processed: number
  total: number
  message: string
}

export type BacktestWorkerRequest =
  | { type: "RUN"; requestId: string; input: BacktestInput }

export type BacktestWorkerResponse =
  | { type: "PROGRESS"; requestId: string; progress: BacktestProgress }
  | { type: "RESULT"; requestId: string; result: BacktestResult }
  | { type: "ERROR"; requestId: string; message: string }

export interface PortfolioSimulationInput {
  config: BacktestConfig
  strategy: BacktestStrategy
  barsBySymbol: Record<string, OHLCV[]>
  signalEvents: BacktestSignalEvent[]
  providerId: string
  isDemoData: boolean
  benchmarkData: OHLCV[]
  dataSummary?: BacktestResult["dataSummary"]
}
