import type { FundamentalData } from "@/models/market"
import { calculateFeatures } from "@/quant/features"
import type { HoldConfig, HoldComponentScore, HoldEngineInput, HoldEngineResult, HoldSector, HoldSignal, HoldScoreBreakdown, HoldQuality, HoldConfidence, HoldAction } from "./types"

export const DEFAULT_HOLD_CONFIG: HoldConfig = {
  minScoreToWatch: 65,
  minScoreToHold: 72,
  minScoreToBuy: 82,
  maxPePremiumPct: 25,
  maxPbPremiumPct: 25,
  weights: {
    earningsGrowth: 0.25,
    businessQuality: 0.20,
    balanceSheetCashFlow: 0.20,
    valuation: 0.15,
    longTermTrend: 0.15,
    catalystRisk: 0.05,
  },
}

export const HOLD_STRATEGY_VERSION = "HOLD_QUALITY_GROWTH_v1"

const clamp = (value: number, min = 0, max = 100) => Math.min(max, Math.max(min, value))
const finite = (value: number | undefined, fallback = Number.NaN) => Number.isFinite(value) ? (value as number) : fallback

function mergeConfig(config?: Partial<HoldConfig>): HoldConfig {
  return {
    ...DEFAULT_HOLD_CONFIG,
    ...config,
    weights: { ...DEFAULT_HOLD_CONFIG.weights, ...(config?.weights ?? {}) },
  }
}

function sectorOf(value: string): HoldSector {
  if (value === "Banks" || value === "Securities" || value === "Real Estate" || value === "Manufacturing" || value === "Technology" || value === "Shipping & Ports") return value
  return "Other"
}

function scorePositiveThreshold(value: number | undefined, good: number, excellent: number, floor = 0): { score: number; available: boolean } {
  const n = finite(value)
  if (!Number.isFinite(n)) return { score: 0, available: false }
  if (n <= floor) return { score: 35, available: true }
  if (n >= excellent) return { score: 92, available: true }
  return { score: clamp(50 + ((n - good) / Math.max(excellent - good, 0.0001)) * 42), available: true }
}

function scoreMargin(value: number | undefined, weak: number, good: number, excellent: number): { score: number; available: boolean } {
  const n = finite(value)
  if (!Number.isFinite(n)) return { score: 0, available: false }
  if (n <= weak) return { score: 35, available: true }
  if (n >= excellent) return { score: 94, available: true }
  if (n >= good) return { score: clamp(70 + ((n - good) / Math.max(excellent - good, 0.0001)) * 24), available: true }
  return { score: clamp(35 + ((n - weak) / Math.max(good - weak, 0.0001)) * 35), available: true }
}

function scoreDebt(value: number | undefined, good: number, bad: number): { score: number; available: boolean } {
  const n = finite(value)
  if (!Number.isFinite(n)) return { score: 0, available: false }
  if (n <= good) return { score: 90, available: true }
  if (n >= bad) return { score: 30, available: true }
  return { score: clamp(90 - ((n - good) / Math.max(bad - good, 0.0001)) * 60), available: true }
}

function scoreGrowth(f: FundamentalData, weight: number): HoldComponentScore {
  const reasons: string[] = []
  const risks: string[] = []
  const growthInputs = [finite(f.revenueGrowth), finite(f.epsGrowth), finite(f.revenueCagr), finite(f.profitCagr)].filter(Number.isFinite) as number[]
  if (!growthInputs.length) return { key: "earningsGrowth", score: 0, weight, available: false, reasons, risks: ["MISSING_GROWTH_DATA"] }
  const avgGrowth = growthInputs.reduce((sum, n) => sum + n, 0) / growthInputs.length
  let score = avgGrowth >= 20 ? 92 : avgGrowth >= 12 ? 82 : avgGrowth >= 6 ? 68 : avgGrowth >= 0 ? 52 : 30
  if (finite(f.epsGrowth) > 0) reasons.push("EPS_GROWTH_POSITIVE")
  if (finite(f.revenueGrowth) > 0) reasons.push("REVENUE_GROWTH_POSITIVE")
  if (avgGrowth >= 15) reasons.push("GROWTH_RATE_SUPPORTS_LONG_TERM_THESIS")
  if (avgGrowth < 0) risks.push("NEGATIVE_GROWTH")
  if (finite(f.epsGrowth) < 0) risks.push("EPS_GROWTH_NEGATIVE")
  return { key: "earningsGrowth", score: clamp(score), weight, available: true, reasons, risks }
}

function scoreQuality(f: FundamentalData, sector: HoldSector, weight: number): HoldComponentScore {
  const reasons: string[] = []
  const risks: string[] = []
  const scores: number[] = []
  const add = (metric: number | undefined, scorer: (x: number | undefined) => { score: number; available: boolean }, positiveCode: string, negativeCode: string) => {
    const result = scorer(metric)
    if (result.available) {
      scores.push(result.score)
      if (result.score >= 75) reasons.push(positiveCode)
      if (result.score < 50) risks.push(negativeCode)
    }
  }

  add(f.roe, (x) => scoreMargin(x, 5, 12, 18), "ROE_HEALTHY", "ROE_WEAK")
  add(f.roic, (x) => scoreMargin(x, 4, 10, 15), "ROIC_HEALTHY", "ROIC_WEAK")
  add(f.roa, (x) => scoreMargin(x, 2, 5, 8), "ROA_HEALTHY", "ROA_WEAK")
  add(f.grossMargin, (x) => scoreMargin(x, 15, 30, 45), "GROSS_MARGIN_HEALTHY", "GROSS_MARGIN_WEAK")
  add(f.operatingMargin, (x) => scoreMargin(x, 5, 12, 20), "OPERATING_MARGIN_HEALTHY", "OPERATING_MARGIN_WEAK")
  add(f.netMargin, (x) => scoreMargin(x, 3, 8, 15), "NET_MARGIN_HEALTHY", "NET_MARGIN_WEAK")

  if (sector === "Banks") {
    add(f.nim, (x) => scoreMargin(x, 2, 3.2, 4.5), "NIM_HEALTHY", "NIM_WEAK")
    add(f.npl, (x) => ({ score: !Number.isFinite(x) ? 0 : x! <= 1.2 ? 92 : x! <= 2 ? 75 : x! <= 3 ? 55 : 30, available: Number.isFinite(x) }), "NPL_CONTROLLED", "NPL_ELEVATED")
    add(f.casa, (x) => scorePositiveThreshold(x, 25, 40), "CASA_STRONG", "CASA_WEAK")
    add(f.provisioning, (x) => scoreMargin(x, 40, 70, 100), "PROVISIONING_COVERAGE_STRONG", "PROVISIONING_COVERAGE_WEAK")
  }
  if (sector === "Securities") {
    add(f.marginLendingGrowth, (x) => scorePositiveThreshold(x, 5, 15), "MARGIN_LENDING_GROWTH", "MARGIN_LENDING_WEAK")
    add(f.brokerageShareGrowth, (x) => scorePositiveThreshold(x, 0, 10), "BROKERAGE_SHARE_IMPROVING", "BROKERAGE_SHARE_WEAK")
    add(f.proprietaryTradingGrowth, (x) => scorePositiveThreshold(x, 3, 12), "PROPRIETARY_TRADING_GROWTH", "PROPRIETARY_TRADING_WEAK")
  }

  if (!scores.length) return { key: "businessQuality", score: 0, weight, available: false, reasons: [], risks: ["MISSING_QUALITY_DATA"] }
  const score = scores.reduce((sum, value) => sum + value, 0) / scores.length
  return { key: "businessQuality", score: clamp(score), weight, available: true, reasons, risks }
}

function scoreBalanceSheetCashFlow(f: FundamentalData, sector: HoldSector, weight: number): HoldComponentScore {
  const reasons: string[] = []
  const risks: string[] = []
  const scores: number[] = []
  const debt = scoreDebt(f.debtToEquity, sector === "Banks" ? 8 : 0.9, sector === "Real Estate" ? 2.5 : 1.8)
  if (debt.available) {
    scores.push(debt.score)
    if (debt.score >= 75) reasons.push("LEVERAGE_CONTROLLED")
    if (debt.score < 50) risks.push("LEVERAGE_ELEVATED")
  }
  const cashFlow = finite(f.freeCashFlow)
  if (Number.isFinite(cashFlow)) {
    scores.push(cashFlow > 0 ? 90 : 35)
    if (cashFlow > 0) reasons.push("FCF_POSITIVE")
    else risks.push("FCF_NEGATIVE")
  }
  const ocf = finite(f.operatingCashFlow)
  if (Number.isFinite(ocf)) {
    scores.push(ocf > 0 ? 86 : 36)
    if (ocf > 0) reasons.push("OPERATING_CASH_FLOW_POSITIVE")
    else risks.push("OPERATING_CASH_FLOW_NEGATIVE")
  }
  const interestCoverage = scorePositiveThreshold(f.interestCoverage, 3, 8)
  if (interestCoverage.available) {
    scores.push(interestCoverage.score)
    if (interestCoverage.score >= 75) reasons.push("INTEREST_COVERAGE_HEALTHY")
    if (interestCoverage.score < 50) risks.push("INTEREST_COVERAGE_WEAK")
  }
  if (sector === "Real Estate" && Number.isFinite(f.inventory)) {
    const inventoryScore = f.inventory! <= 100 ? 85 : f.inventory! <= 200 ? 65 : 40
    scores.push(inventoryScore)
    if (inventoryScore < 50) risks.push("INVENTORY_PRESSURE")
  }
  if (sector === "Real Estate" && Number.isFinite(f.projectPipeline)) {
    const pipelineScore = f.projectPipeline! >= 70 ? 90 : f.projectPipeline! >= 40 ? 70 : 45
    scores.push(pipelineScore)
    if (pipelineScore >= 75) reasons.push("PROJECT_PIPELINE_SUPPORTIVE")
    if (pipelineScore < 50) risks.push("PROJECT_PIPELINE_WEAK")
  }
  if (sector === "Manufacturing" && Number.isFinite(f.inventory)) {
    const inventoryScore = f.inventory! <= 35 ? 90 : f.inventory! <= 60 ? 70 : 45
    scores.push(inventoryScore)
    if (inventoryScore < 50) risks.push("INVENTORY_PRESSURE")
  }

  if (!scores.length) return { key: "balanceSheetCashFlow", score: 0, weight, available: false, reasons: [], risks: ["MISSING_BALANCE_SHEET_DATA"] }
  return { key: "balanceSheetCashFlow", score: clamp(scores.reduce((sum, value) => sum + value, 0) / scores.length), weight, available: true, reasons, risks }
}

function scoreValuation(f: FundamentalData, config: HoldConfig, weight: number): { component: HoldComponentScore; label: HoldSignal["valuationLabel"] } {
  const reasons: string[] = []
  const risks: string[] = []
  const scores: number[] = []
  const pe = finite(f.pe)
  const pb = finite(f.pb)
  const sectorPe = finite(f.sectorMedianPe)
  const sectorPb = finite(f.sectorMedianPb)
  const histPe = finite(f.historicalPe)
  const histPb = finite(f.historicalPb)

  const relativePe = Number.isFinite(pe) && Number.isFinite(sectorPe) && sectorPe > 0 ? pe / sectorPe : Number.NaN
  const relativePb = Number.isFinite(pb) && Number.isFinite(sectorPb) && sectorPb > 0 ? pb / sectorPb : Number.NaN
  if (Number.isFinite(relativePe)) scores.push(clamp(100 - Math.max(0, relativePe - 1) * 100))
  else if (Number.isFinite(pe)) scores.push(pe <= 10 ? 88 : pe <= 18 ? 72 : pe <= 28 ? 55 : 35)
  if (Number.isFinite(relativePb)) scores.push(clamp(100 - Math.max(0, relativePb - 1) * 90))
  else if (Number.isFinite(pb)) scores.push(pb <= 1.2 ? 88 : pb <= 2 ? 72 : pb <= 3.5 ? 55 : 35)
  if (Number.isFinite(histPe) && Number.isFinite(pe)) scores.push(clamp(100 - ((pe / Math.max(histPe!, 0.1)) - 1) * 120))
  if (Number.isFinite(histPb) && Number.isFinite(pb)) scores.push(clamp(100 - ((pb / Math.max(histPb!, 0.1)) - 1) * 100))
  if (Number.isFinite(f.evEbitda)) scores.push(f.evEbitda! <= 10 ? 85 : f.evEbitda! <= 16 ? 70 : f.evEbitda! <= 24 ? 52 : 35)
  if (Number.isFinite(f.peg)) scores.push(f.peg! <= 0.9 ? 90 : f.peg! <= 1.3 ? 76 : f.peg! <= 2 ? 55 : 35)
  if (Number.isFinite(f.dividendYield)) scores.push(f.dividendYield! >= 4 ? 85 : f.dividendYield! >= 2 ? 70 : f.dividendYield! >= 1 ? 55 : 45)

  if (!scores.length) return { component: { key: "valuation", score: 0, weight, available: false, reasons: [], risks: ["MISSING_VALUATION_DATA"] }, label: "UNKNOWN" }
  const score = clamp(scores.reduce((sum, value) => sum + value, 0) / scores.length)
  if (score >= 75) reasons.push("VALUATION_ATTRACTIVE")
  if (score < 50) risks.push("VALUATION_RICH")
  if (Number.isFinite(relativePe) && (relativePe! - 1) * 100 > config.maxPePremiumPct) risks.push("PE_PREMIUM_TO_SECTOR")
  if (Number.isFinite(relativePb) && (relativePb! - 1) * 100 > config.maxPbPremiumPct) risks.push("PB_PREMIUM_TO_SECTOR")
  const label = score >= 75 ? "ATTRACTIVE" : score >= 55 ? "FAIR" : "RICH"
  return { component: { key: "valuation", score, weight, available: true, reasons, risks }, label }
}

function scoreLongTermTrend(features: HoldEngineInput["features"], weight: number): HoldComponentScore {
  const snapshot = features.snapshot
  let score = 50
  const reasons: string[] = []
  const risks: string[] = []
  if (snapshot.trend.ema200Slope20Pct > 0) { score += 18; reasons.push("EMA200_SLOPE_POSITIVE") } else if (snapshot.trend.ema200Slope20Pct < 0) { score -= 18; risks.push("EMA200_SLOPE_NEGATIVE") }
  if (snapshot.trend.ema50Slope20Pct > 0) { score += 12; reasons.push("EMA50_SLOPE_POSITIVE") } else if (snapshot.trend.ema50Slope20Pct < 0) { score -= 10; risks.push("EMA50_SLOPE_NEGATIVE") }
  if (snapshot.trend.aboveEma200) { score += 15; reasons.push("PRICE_ABOVE_EMA200") } else { score -= 20; risks.push("PRICE_BELOW_EMA200") }
  if (snapshot.relativeStrength.rs120 > 0) { score += 8; reasons.push("RS120_OUTPERFORMS") } else if (snapshot.relativeStrength.rs120 < 0) { score -= 8; risks.push("RS120_UNDERPERFORMS") }
  if (snapshot.priceStructure.state === "ACCUMULATION" || snapshot.priceStructure.state === "MARKUP") { score += 6; reasons.push("POSITIVE_MARKET_STRUCTURE") }
  if (snapshot.priceStructure.state === "DISTRIBUTION" || snapshot.priceStructure.state === "MARKDOWN") { score -= 10; risks.push("NEGATIVE_MARKET_STRUCTURE") }
  return { key: "longTermTrend", score: clamp(score), weight, available: Number.isFinite(snapshot.trend.ema200Slope20Pct) && Number.isFinite(snapshot.relativeStrength.rs120), reasons, risks }
}

function scoreCatalystRisk(f: FundamentalData, weight: number): HoldComponentScore {
  const reasons = [...(f.catalysts ?? []).map((x) => `CATALYST_${x.toUpperCase().replace(/[^A-Z0-9]+/g, "_")}`)]
  const risks = [...(f.risks ?? []).map((x) => `RISK_${x.toUpperCase().replace(/[^A-Z0-9]+/g, "_")}`)]
  let score = 60
  if (reasons.length) score += Math.min(30, reasons.length * 10)
  if (risks.length) score -= Math.min(40, risks.length * 12)
  if (f.legalStatus === "Clear") score += 15
  if (f.legalStatus === "At Risk") { score -= 30; risks.push("LEGAL_STATUS_AT_RISK") }
  return { key: "catalystRisk", score: clamp(score), weight, available: reasons.length > 0 || risks.length > 0 || Boolean(f.legalStatus), reasons, risks }
}

function weightedTotal(components: HoldComponentScore[]): number {
  const available = components.filter((component) => component.available)
  if (!available.length) return 0
  const weight = available.reduce((sum, component) => sum + component.weight, 0)
  return clamp(available.reduce((sum, component) => sum + component.score * component.weight, 0) / Math.max(weight, 0.0001))
}

function determineQuality(score: number, completeness: number, valuationLabel: HoldSignal["valuationLabel"]): HoldQuality {
  if (completeness < 0.55) return "LOW"
  if (score >= 82 && valuationLabel !== "RICH") return "HIGH"
  if (score >= 68) return "MEDIUM"
  return "LOW"
}

function determineConfidence(completeness: number, score: number, componentCount: number): HoldConfidence {
  if (completeness >= 0.85 && componentCount >= 5 && score >= 75) return "HIGH"
  if (completeness >= 0.65 && componentCount >= 4) return "MEDIUM"
  return "LOW"
}

function determineAction(score: number, completeness: number, quality: HoldQuality, config: HoldConfig, valuationLabel: HoldSignal["valuationLabel"]): HoldAction {
  if (completeness < 0.50) return "WAIT"
  if (valuationLabel === "RICH" && score < config.minScoreToBuy) return score >= config.minScoreToWatch ? "WATCH" : "WAIT"
  if (score >= config.minScoreToBuy && quality === "HIGH") return "BUY"
  if (score >= config.minScoreToHold) return "HOLD"
  if (score >= config.minScoreToWatch) return "WATCH"
  return "WAIT"
}

export function calculateHoldSignal(input: HoldEngineInput): HoldEngineResult {
  if (!input.data.length) throw new Error("HoldEngine requires OHLCV data")
  const config = mergeConfig(input.config)
  const sector = sectorOf(input.company.sector)
  const growth = scoreGrowth(input.fundamentals, config.weights.earningsGrowth)
  const quality = scoreQuality(input.fundamentals, sector, config.weights.businessQuality)
  const balance = scoreBalanceSheetCashFlow(input.fundamentals, sector, config.weights.balanceSheetCashFlow)
  const valuation = scoreValuation(input.fundamentals, config, config.weights.valuation)
  const trend = scoreLongTermTrend(input.features, config.weights.longTermTrend)
  const catalyst = scoreCatalystRisk(input.fundamentals, config.weights.catalystRisk)
  const components = [growth, quality, balance, valuation.component, trend, catalyst]
  const scoreBreakdown: HoldScoreBreakdown = {
    earningsGrowth: growth.score,
    businessQuality: quality.score,
    balanceSheetCashFlow: balance.score,
    valuation: valuation.component.score,
    longTermTrend: trend.score,
    catalystRisk: catalyst.score,
    total: weightedTotal(components),
  }
  const dataCompleteness = components.reduce((sum, component) => sum + (component.available ? component.weight : 0), 0)
  const completeness = dataCompleteness / Object.values(config.weights).reduce((sum, value) => sum + value, 0)
  const reasons = components.flatMap((component) => component.reasons)
  const risks = components.flatMap((component) => component.risks)
  const qualityLabel = determineQuality(scoreBreakdown.total, completeness, valuation.label)
  const confidence = determineConfidence(completeness, scoreBreakdown.total, components.filter((component) => component.available).length)
  const action = determineAction(scoreBreakdown.total, completeness, qualityLabel, config, valuation.label)
  const longTermTrend = trend.score >= 70 ? "BULLISH" : trend.score <= 45 ? "BEARISH" : "NEUTRAL"
  const signal: HoldSignal = {
    symbol: input.company.symbol,
    date: input.features.snapshot.date,
    engine: "HOLD",
    sector,
    action,
    score: Math.round(scoreBreakdown.total),
    confidence,
    quality: qualityLabel,
    dataCompleteness: Math.round(completeness * 100),
    horizonMonths: input.horizonMonths ?? 3,
    reasons,
    risks,
    reasonCodes: reasons,
    riskCodes: risks,
    catalysts: input.fundamentals.catalysts ?? [],
    scoreBreakdown,
    components,
    valuationLabel: valuation.label,
    longTermTrend,
    strategyVersion: HOLD_STRATEGY_VERSION,
  }
  return { signal }
}

export function calculateHoldSignalFromData(input: Omit<HoldEngineInput, "features"> & { benchmark?: import("@/models/market").OHLCV[]; sectorBenchmark?: import("@/models/market").OHLCV[] }) : HoldEngineResult {
  const features = calculateFeatures(input.data, { benchmark: input.benchmark, sectorBenchmark: input.sectorBenchmark })
  return calculateHoldSignal({ ...input, features })
}
