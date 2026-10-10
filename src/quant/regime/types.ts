import type { FeatureSnapshot } from "@/indicators/types"
import type { OHLCV } from "@/models/market"

export type MarketRegime = "BULL" | "BULL_PULLBACK" | "SIDEWAYS" | "DISTRIBUTION" | "BEAR" | "PANIC"
export type RegimeConfidence = "LOW" | "MEDIUM" | "HIGH"

export interface BreadthSnapshot {
  totalStocks: number
  aboveEma20Pct: number
  aboveEma50Pct: number
  advanceCount: number
  declineCount: number
  unchangedCount?: number
  advanceDeclineRatio: number
  sectorBreadthPct?: number
}

export interface SectorStrengthSnapshot {
  sector: string
  return20: number
  rs20?: number
  participationPct?: number
}

export interface MarketRegimeInput {
  indexData: OHLCV[]
  indexSymbol?: string
  breadth?: BreadthSnapshot
  sectorStrength?: SectorStrengthSnapshot[]
  previousSnapshot?: MarketRegimeSnapshot
}

export interface MarketRegimeComponentScores {
  trend: number
  breadth: number
  momentum: number
  volatility: number
  participation: number
  total: number
}

export interface MarketRegimeMetrics {
  close: number
  ema20: number
  ema50: number
  ema200: number
  ema20Slope20Pct: number
  ema50Slope20Pct: number
  ema200Slope20Pct: number
  adx14: number
  diPlus14: number
  diMinus14: number
  rsi14: number
  roc20: number
  atr14Pct: number
  rvol20: number
  return1dPct: number
  return5dPct: number
  return20dPct: number
  distanceFromHigh20Pct: number
  distanceFromHigh50Pct: number
  aboveEma20: boolean
  aboveEma50: boolean
  aboveEma200: boolean
  trendAligned: boolean
  volatilityExpansion: boolean
}

export interface MarketRegimeSnapshot {
  symbol: string
  date: string
  regime: MarketRegime
  confidence: RegimeConfidence
  score: number
  components: MarketRegimeComponentScores
  metrics: MarketRegimeMetrics
  breadth?: BreadthSnapshot
  strongestSectors: SectorStrengthSnapshot[]
  weakestSectors: SectorStrengthSnapshot[]
  reasons: string[]
  warnings: string[]
}

export interface StockBreadthInput {
  symbol: string
  previousClose?: number
  feature: FeatureSnapshot
}
