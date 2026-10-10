import type { FundamentalData, CompanyInfo, OHLCV } from "@/models/market"
import type { FeatureEngineResult } from "@/indicators/types"

export type HoldSector =
  | "Banks"
  | "Securities"
  | "Real Estate"
  | "Manufacturing"
  | "Technology"
  | "Shipping & Ports"
  | "Other"

export type HoldAction = "BUY" | "HOLD" | "WATCH" | "WAIT" | "TRIM" | "NO_TRADE"
export type HoldConfidence = "LOW" | "MEDIUM" | "HIGH"
export type HoldQuality = "LOW" | "MEDIUM" | "HIGH"

export interface HoldWeights {
  earningsGrowth: number
  businessQuality: number
  balanceSheetCashFlow: number
  valuation: number
  longTermTrend: number
  catalystRisk: number
}

export interface HoldConfig {
  minScoreToWatch: number
  minScoreToHold: number
  minScoreToBuy: number
  maxPePremiumPct: number
  maxPbPremiumPct: number
  weights: HoldWeights
}

export interface HoldComponentScore {
  key: keyof HoldWeights
  score: number
  weight: number
  available: boolean
  reasons: string[]
  risks: string[]
}

export interface HoldScoreBreakdown {
  earningsGrowth: number
  businessQuality: number
  balanceSheetCashFlow: number
  valuation: number
  longTermTrend: number
  catalystRisk: number
  total: number
}

export interface HoldSignal {
  symbol: string
  date: string
  engine: "HOLD"
  sector: HoldSector
  action: HoldAction
  score: number
  confidence: HoldConfidence
  quality: HoldQuality
  dataCompleteness: number
  horizonMonths: number
  reasons: string[]
  risks: string[]
  reasonCodes: string[]
  riskCodes: string[]
  catalysts: string[]
  scoreBreakdown: HoldScoreBreakdown
  components: HoldComponentScore[]
  valuationLabel: "ATTRACTIVE" | "FAIR" | "RICH" | "UNKNOWN"
  longTermTrend: "BULLISH" | "NEUTRAL" | "BEARISH" | "UNKNOWN"
  strategyVersion: string
}

export interface HoldEngineInput {
  company: CompanyInfo
  fundamentals: FundamentalData
  features: FeatureEngineResult
  data: OHLCV[]
  config?: Partial<HoldConfig>
  horizonMonths?: number
}

export interface HoldEngineResult {
  signal: HoldSignal
}
