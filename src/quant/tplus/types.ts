import type { FeatureEngineContext, FeatureEngineResult } from "@/indicators/types"
import type { OHLCV } from "@/models/market"
import type { MarketRegime, MarketRegimeSnapshot } from "@/quant/regime"

export type TplusSetup =
  | "BREAKOUT"
  | "PULLBACK"
  | "MOMENTUM_CONTINUATION"
  | "RSI_DIVERGENCE_REVERSAL"
  | "VSA_REVERSAL"
  | "MEAN_REVERSION"

export type TplusAction = "BUY" | "WATCH" | "WAIT" | "NO_TRADE" | "EXIT" | "HOLD" | "TRIM"
export type TplusConfidence = "LOW" | "MEDIUM" | "HIGH"
export type TradeQuality = "LOW" | "MEDIUM" | "HIGH"

export interface TplusWeights {
  trendStructure: number
  relativeStrength: number
  setupQuality: number
  volumeMoneyFlow: number
  momentum: number
  marketRegime: number
  priceLocation: number
  liquidityRisk: number
}

export interface TplusConfig {
  minScoreToWatch: number
  minScoreToBuy: number
  minRiskReward: number
  preferredRiskReward: number
  atrStopMultiplier: number
  maxEntryDistanceAtr: number
  weights: TplusWeights
}

export interface TplusSetupCandidate {
  setup: TplusSetup
  baseScore: number
  trigger: string
  entryLow: number
  entryHigh: number
  invalidation: number
  reasons: string[]
  risks: string[]
  valid: boolean
}

export interface TplusScoreBreakdown {
  trendStructure: number
  relativeStrength: number
  setupQuality: number
  volumeMoneyFlow: number
  momentum: number
  marketRegime: number
  priceLocation: number
  liquidityRisk: number
  total: number
}

export interface TplusRiskPlan {
  referenceEntry: number
  stopLoss: number
  tp1: number
  tp2: number
  riskPerShare: number
  rewardToTp1: number
  rewardToTp2: number
  riskRewardTp1: number
  riskRewardTp2: number
}

export interface TradingSignal {
  symbol: string
  date: string
  engine: "TPLUS" | "HOLD"
  setup: TplusSetup | "NONE"
  action: TplusAction
  score: number
  opportunityScore: number
  tradeQuality: TradeQuality
  confidence: TplusConfidence
  entryZone?: { low: number; high: number }
  trigger?: string
  stopLoss?: number
  tp1?: number
  tp2?: number
  riskReward?: number
  riskRewardTp2?: number
  reasons: string[]
  risks: string[]
  reasonCodes: string[]
  riskCodes: string[]
  marketRegime: MarketRegime
  scoreBreakdown: TplusScoreBreakdown
  riskPlan?: TplusRiskPlan
  strategyVersion: string
}

export interface TplusEngineInput {
  data: OHLCV[]
  features?: FeatureEngineResult
  regime: MarketRegimeSnapshot | MarketRegime
  featureContext?: FeatureEngineContext
  config?: Partial<TplusConfig>
  allowedSetups?: TplusSetup[]
}

export interface TplusEngineResult {
  signal: TradingSignal
  features: FeatureEngineResult
  candidate: TplusSetupCandidate | null
}
