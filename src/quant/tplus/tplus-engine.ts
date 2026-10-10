import type { OHLCV } from "@/models/market"
import { calculateFeatures } from "@/quant/features"
import type { FeatureSnapshot } from "@/indicators/types"
import type { MarketRegime } from "@/quant/regime"
import type {
  TplusConfig,
  TplusEngineInput,
  TplusEngineResult,
  TplusRiskPlan,
  TplusScoreBreakdown,
  TplusSetupCandidate,
  TradeQuality,
  TplusConfidence,
  TradingSignal,
} from "./types"

export const DEFAULT_TPLUS_CONFIG: TplusConfig = {
  minScoreToWatch: 65,
  minScoreToBuy: 75,
  minRiskReward: 1.5,
  preferredRiskReward: 2.0,
  atrStopMultiplier: 1.5,
  maxEntryDistanceAtr: 1.25,
  weights: {
    trendStructure: 0.20,
    relativeStrength: 0.15,
    setupQuality: 0.20,
    volumeMoneyFlow: 0.15,
    momentum: 0.10,
    marketRegime: 0.10,
    priceLocation: 0.05,
    liquidityRisk: 0.05,
  },
}

export const TPLUS_STRATEGY_VERSION = "TPLUS_MULTI_SETUP_v1"

const clamp = (value: number, min = 0, max = 100) => Math.min(max, Math.max(min, value))
const finite = (value: number, fallback = 0) => Number.isFinite(value) ? value : fallback

function mergeConfig(config?: Partial<TplusConfig>): TplusConfig {
  return {
    ...DEFAULT_TPLUS_CONFIG,
    ...config,
    weights: { ...DEFAULT_TPLUS_CONFIG.weights, ...(config?.weights ?? {}) },
  }
}

function regimeName(regime: TplusEngineInput["regime"]): MarketRegime {
  return typeof regime === "string" ? regime : regime.regime
}

function previousHigh(data: OHLCV[], lookback: number): number {
  if (data.length <= lookback) return Number.NaN
  return Math.max(...data.slice(-(lookback + 1), -1).map((bar) => bar.high))
}

function recentMinClose(data: OHLCV[], lookback: number): number {
  const window = data.slice(-lookback)
  return window.length ? Math.min(...window.map((bar) => bar.close)) : Number.NaN
}

function priceDistancePct(price: number, reference: number): number {
  return reference === 0 || !Number.isFinite(reference) ? Number.NaN : ((price / reference) - 1) * 100
}

function hasPositiveTrend(snapshot: FeatureSnapshot): boolean {
  return snapshot.trend.aboveEma50 && snapshot.trend.aboveEma200 && snapshot.trend.ema50Slope20Pct >= 0
}

function near(value: number, target: number, tolerance: number): boolean {
  return Math.abs(value - target) <= tolerance
}

function detectBreakout(data: OHLCV[], snapshot: FeatureSnapshot): TplusSetupCandidate | null {
  const price = snapshot.close
  const atr = finite(snapshot.trend.atr14, price * 0.02)
  const prior20 = previousHigh(data, 20)
  const prior50 = previousHigh(data, 50)
  const breakoutLevel = Math.max(finite(prior20, price), finite(prior50, price))
  const isBreakout = price > breakoutLevel && snapshot.volume.rvol20 >= 1.25 && snapshot.trend.aboveEma50
  if (!isBreakout) return null
  const low = breakoutLevel * 0.995
  const high = breakoutLevel + Math.min(0.35 * atr, price * 0.008)
  const invalidation = Math.min(snapshot.trend.ema20, breakoutLevel - 0.7 * atr)
  const extension = priceDistancePct(price, breakoutLevel)
  return {
    setup: "BREAKOUT",
    baseScore: clamp(66 + Math.min(20, snapshot.volume.rvol20 * 8) + (snapshot.trend.adx14 >= 25 ? 6 : 0) - Math.max(0, extension) * 4),
    trigger: `Breakout above ${breakoutLevel.toFixed(2)} with RVOL confirmation`,
    entryLow: low,
    entryHigh: high,
    invalidation,
    reasons: ["BREAKOUT_ABOVE_PRIOR_RANGE", "RVOL_CONFIRMATION", "ABOVE_EMA50"],
    risks: extension > 2 ? ["PRICE_EXTENDED_FROM_BREAKOUT"] : [],
    valid: true,
  }
}

function detectPullback(data: OHLCV[], snapshot: FeatureSnapshot): TplusSetupCandidate | null {
  if (!hasPositiveTrend(snapshot)) return null
  const price = snapshot.close
  const atr = finite(snapshot.trend.atr14, price * 0.02)
  const nearEma20 = near(price, snapshot.trend.ema20, Math.max(0.75 * atr, price * 0.015))
  const rsiHealthy = snapshot.momentum.rsi14 >= 40 && snapshot.momentum.rsi14 <= 67
  const recentLow = recentMinClose(data.slice(0, -1), 5)
  const hasControlledPullback = Number.isFinite(recentLow) && recentLow < price && price - recentLow <= 1.8 * atr
  if (!nearEma20 || !rsiHealthy || !hasControlledPullback) return null
  const support = Math.max(snapshot.trend.ema20, snapshot.priceStructure.low20)
  const low = Math.max(0.001, support - 0.25 * atr)
  const high = snapshot.trend.ema20 + 0.35 * atr
  const invalidation = Math.min(snapshot.trend.ema50, support - 0.85 * atr)
  return {
    setup: "PULLBACK",
    baseScore: clamp(68 + (snapshot.momentum.rsi14 >= 45 && snapshot.momentum.rsi14 <= 62 ? 7 : 0) + (snapshot.volume.cmf20 > 0 ? 5 : 0)),
    trigger: `Bullish reversal near EMA20/support ${support.toFixed(2)}`,
    entryLow: low,
    entryHigh: high,
    invalidation,
    reasons: ["UPTREND_INTACT", "EMA20_PULLBACK", "RSI_HEALTHY"],
    risks: snapshot.volume.cmf20 < 0 ? ["CMF_NEGATIVE"] : [],
    valid: true,
  }
}

function detectMomentumContinuation(data: OHLCV[], snapshot: FeatureSnapshot): TplusSetupCandidate | null {
  const price = snapshot.close
  const atr = finite(snapshot.trend.atr14, price * 0.02)
  const prior10 = previousHigh(data, 10)
  const strongMomentum = snapshot.momentum.roc20 >= 3 && snapshot.momentum.macdHistogram > 0 && snapshot.trend.adx14 >= 20
  const notTooExtended = Number.isFinite(prior10) ? priceDistancePct(price, prior10) < 3.5 : true
  if (!strongMomentum || !snapshot.trend.aboveEma50 || !notTooExtended) return null
  const entryLow = Math.max(snapshot.trend.ema20, price - 0.45 * atr)
  const entryHigh = price + 0.15 * atr
  const invalidation = Math.min(snapshot.trend.ema50, entryLow - 0.8 * atr)
  return {
    setup: "MOMENTUM_CONTINUATION",
    baseScore: clamp(63 + Math.min(12, snapshot.momentum.roc20 * 0.8) + (snapshot.volume.rvol20 >= 1.2 ? 7 : 0)),
    trigger: "Positive momentum continuation with MACD histogram and trend confirmation",
    entryLow,
    entryHigh,
    invalidation,
    reasons: ["ROC20_POSITIVE", "MACD_HISTOGRAM_POSITIVE", "ADX_SUPPORTS_TREND"],
    risks: snapshot.momentum.rsi14 >= 72 ? ["RSI_EXTENDED"] : [],
    valid: true,
  }
}

function detectRsiDivergenceReversal(data: OHLCV[], snapshot: FeatureSnapshot): TplusSetupCandidate | null {
  if (!snapshot.divergence.rsiBullish) return null
  const price = snapshot.close
  const atr = finite(snapshot.trend.atr14, price * 0.02)
  const support = Math.max(snapshot.priceStructure.low20, recentMinClose(data, 10))
  const entryLow = Math.max(0.001, support - 0.3 * atr)
  const entryHigh = price + 0.2 * atr
  const invalidation = support - 0.9 * atr
  return {
    setup: "RSI_DIVERGENCE_REVERSAL",
    baseScore: clamp(62 + (snapshot.momentum.rsi14 < 45 ? 10 : 4) + (snapshot.volume.cmf20 > -0.05 ? 4 : 0)),
    trigger: "Bullish RSI divergence with confirmation above recent support",
    entryLow,
    entryHigh,
    invalidation,
    reasons: ["RSI_BULLISH_DIVERGENCE", "NEAR_RECENT_SUPPORT"],
    risks: snapshot.trend.aboveEma200 ? [] : ["BELOW_EMA200"],
    valid: true,
  }
}

function detectVsaReversal(snapshot: FeatureSnapshot): TplusSetupCandidate | null {
  const vsa = snapshot.volume.vsa
  if (vsa !== "ABSORPTION" && vsa !== "NO_SUPPLY") return null
  if (snapshot.momentum.rsi14 > 60) return null
  const price = snapshot.close
  const atr = finite(snapshot.trend.atr14, price * 0.02)
  const support = snapshot.priceStructure.low20
  return {
    setup: "VSA_REVERSAL",
    baseScore: clamp(60 + (vsa === "ABSORPTION" ? 9 : 6) + (snapshot.volume.cmf20 > 0 ? 4 : 0)),
    trigger: `VSA ${vsa} confirmation around support`,
    entryLow: Math.max(0.001, support - 0.2 * atr),
    entryHigh: price + 0.15 * atr,
    invalidation: support - 0.8 * atr,
    reasons: [`VSA_${vsa}`],
    risks: snapshot.volume.rvol20 < 0.8 ? ["LOW_VOLUME_CONFIRMATION"] : [],
    valid: true,
  }
}

function detectMeanReversion(data: OHLCV[], snapshot: FeatureSnapshot, regime: MarketRegime): TplusSetupCandidate | null {
  if (regime === "BEAR" || regime === "PANIC") return null
  const oversold = snapshot.momentum.rsi14 <= 30 || snapshot.momentum.stochasticK14 <= 20
  const nearLow = snapshot.priceStructure.rangePosition20 <= 0.15
  if (!oversold || !nearLow) return null
  const price = snapshot.close
  const atr = finite(snapshot.trend.atr14, price * 0.02)
  const low = recentMinClose(data, 20)
  const entryLow = Math.max(0.001, low - 0.2 * atr)
  const entryHigh = price + 0.2 * atr
  const invalidation = low - 0.8 * atr
  return {
    setup: "MEAN_REVERSION",
    baseScore: clamp(58 + (snapshot.momentum.rsi14 <= 30 ? 8 : 4) + (nearLow ? 5 : 0)),
    trigger: "Oversold condition reverses from lower end of 20D range",
    entryLow,
    entryHigh,
    invalidation,
    reasons: ["OVERSOLD", "NEAR_20D_RANGE_LOW"],
    risks: ["COUNTER_TREND_RISK"],
    valid: true,
  }
}

function detectSetups(data: OHLCV[], snapshot: FeatureSnapshot, regime: MarketRegime): TplusSetupCandidate[] {
  const candidates = [
    detectBreakout(data, snapshot),
    detectPullback(data, snapshot),
    detectMomentumContinuation(data, snapshot),
    detectRsiDivergenceReversal(data, snapshot),
    detectVsaReversal(snapshot),
    detectMeanReversion(data, snapshot, regime),
  ]
  return candidates.filter((candidate): candidate is TplusSetupCandidate => candidate !== null && candidate.valid)
}

function validateCandidate(candidate: TplusSetupCandidate, snapshot: FeatureSnapshot, regime: MarketRegime, config: TplusConfig): TplusSetupCandidate {
  const warnings = [...candidate.risks]
  let valid = true
  if (candidate.entryHigh < candidate.entryLow) valid = false
  if (candidate.invalidation >= candidate.entryHigh) valid = false
  const mid = (candidate.entryLow + candidate.entryHigh) / 2
  const distanceAtr = snapshot.trend.atr14 > 0 ? Math.abs(mid - snapshot.close) / snapshot.trend.atr14 : 99
  if (distanceAtr > config.maxEntryDistanceAtr) warnings.push("ENTRY_TOO_FAR_FROM_CURRENT_PRICE")
  if ((regime === "BEAR" || regime === "PANIC") && ["BREAKOUT", "PULLBACK", "MOMENTUM_CONTINUATION"].includes(candidate.setup)) {
    warnings.push("MARKET_REGIME_HEADWIND")
    valid = false
  }
  return { ...candidate, risks: [...new Set(warnings)], valid }
}

function scoreTrendStructure(snapshot: FeatureSnapshot): number {
  let score = 35
  if (snapshot.trend.aboveEma50) score += 18
  if (snapshot.trend.aboveEma200) score += 18
  if (snapshot.trend.ema50Slope20Pct > 0) score += 8
  if (snapshot.trend.adx14 >= 25) score += 8
  if (snapshot.priceStructure.hh || snapshot.priceStructure.hl) score += 8
  if (snapshot.priceStructure.lh || snapshot.priceStructure.ll) score -= 10
  return clamp(score)
}

function scoreRelativeStrength(snapshot: FeatureSnapshot): number {
  const rs20 = snapshot.relativeStrength.rs20
  const percentile = snapshot.relativeStrength.percentileVsUniverse
  let score = 50 + Math.max(-20, Math.min(25, rs20 * 1.5))
  if (percentile != null && Number.isFinite(percentile)) score = score * 0.4 + percentile * 0.6
  return clamp(score)
}

function scoreSetupQuality(candidate: TplusSetupCandidate | null): number {
  return candidate ? candidate.baseScore : 20
}

function scoreVolumeMoneyFlow(snapshot: FeatureSnapshot): number {
  let score = 45
  if (snapshot.volume.rvol20 >= 1.2) score += 15
  if (snapshot.volume.rvol20 >= 1.5) score += 8
  if (snapshot.volume.cmf20 > 0) score += 15
  if (snapshot.volume.obvSlope20 > 0) score += 8
  if (snapshot.volume.vsa === "ABSORPTION" || snapshot.volume.vsa === "NO_SUPPLY") score += 8
  if (snapshot.volume.vsa === "NO_DEMAND") score -= 12
  return clamp(score)
}

function scoreMomentum(snapshot: FeatureSnapshot): number {
  let score = 45
  if (snapshot.momentum.macdHistogram > 0) score += 15
  if (snapshot.momentum.roc20 > 0) score += 10
  if (snapshot.momentum.rsi14 >= 45 && snapshot.momentum.rsi14 <= 68) score += 15
  if (snapshot.momentum.rsi14 > 72) score -= 10
  if (snapshot.momentum.rsi14 < 30) score -= 5
  return clamp(score)
}

function scoreMarketRegime(regime: MarketRegime): number {
  switch (regime) {
    case "BULL": return 90
    case "BULL_PULLBACK": return 82
    case "SIDEWAYS": return 55
    case "DISTRIBUTION": return 42
    case "BEAR": return 25
    case "PANIC": return 10
  }
}

function scorePriceLocation(snapshot: FeatureSnapshot): number {
  let score = 60
  if (snapshot.priceStructure.rangePosition20 <= 0.25) score += 15
  if (snapshot.priceStructure.rangePosition20 >= 0.9) score -= 18
  if (snapshot.priceStructure.distanceFromHigh20 < -1 && snapshot.priceStructure.distanceFromHigh20 > -8) score += 5
  return clamp(score)
}

function scoreLiquidityRisk(snapshot: FeatureSnapshot): number {
  if (snapshot.volume.rvol20 <= 0) return 20
  if (snapshot.volume.rvol20 < 0.6) return 35
  if (snapshot.volume.rvol20 < 0.9) return 45
  return 80
}

function weightedScore(breakdown: Omit<TplusScoreBreakdown, "total">, weights: TplusConfig["weights"]): number {
  return clamp(
    breakdown.trendStructure * weights.trendStructure +
    breakdown.relativeStrength * weights.relativeStrength +
    breakdown.setupQuality * weights.setupQuality +
    breakdown.volumeMoneyFlow * weights.volumeMoneyFlow +
    breakdown.momentum * weights.momentum +
    breakdown.marketRegime * weights.marketRegime +
    breakdown.priceLocation * weights.priceLocation +
    breakdown.liquidityRisk * weights.liquidityRisk,
  )
}

function buildRiskPlan(candidate: TplusSetupCandidate, snapshot: FeatureSnapshot, data: OHLCV[], config: TplusConfig): TplusRiskPlan | undefined {
  const entry = (candidate.entryLow + candidate.entryHigh) / 2
  const atr = finite(snapshot.trend.atr14, entry * 0.02)
  const atrStop = entry - config.atrStopMultiplier * atr
  const stop = Math.min(candidate.invalidation, atrStop)
  const risk = entry - stop
  if (!Number.isFinite(entry) || !Number.isFinite(stop) || risk <= 0) return undefined

  const recentResistance = Math.max(previousHigh(data, 20), previousHigh(data, 50), entry + config.preferredRiskReward * risk)
  const tp1 = Math.max(entry + config.minRiskReward * risk, Math.min(recentResistance, entry + 1.75 * risk))
  const tp2 = Math.max(entry + config.preferredRiskReward * risk, recentResistance)
  return {
    referenceEntry: entry,
    stopLoss: stop,
    tp1,
    tp2,
    riskPerShare: risk,
    rewardToTp1: tp1 - entry,
    rewardToTp2: tp2 - entry,
    riskRewardTp1: (tp1 - entry) / risk,
    riskRewardTp2: (tp2 - entry) / risk,
  }
}

function determineTradeQuality(score: number, riskPlan: TplusRiskPlan | undefined, candidate: TplusSetupCandidate | null): TradeQuality {
  if (!candidate || !riskPlan) return "LOW"
  if (riskPlan.riskRewardTp1 >= 2 && score >= 75) return "HIGH"
  if (riskPlan.riskRewardTp1 >= 1.5 && score >= 65) return "MEDIUM"
  return "LOW"
}

function determineConfidence(snapshot: FeatureSnapshot, score: number, candidate: TplusSetupCandidate | null, regime: MarketRegime): TplusConfidence {
  const positiveSignals = [
    snapshot.trend.aboveEma50,
    snapshot.trend.aboveEma200,
    snapshot.volume.cmf20 > 0,
    snapshot.momentum.macdHistogram > 0,
    snapshot.relativeStrength.rs20 > 0,
    candidate != null,
  ].filter(Boolean).length
  const regimeAgreement = ["BULL", "BULL_PULLBACK"].includes(regime) ? 1 : 0
  const strength = score * 0.65 + ((positiveSignals / 6) * 100) * 0.25 + regimeAgreement * 10
  if (strength >= 78) return "HIGH"
  if (strength >= 58) return "MEDIUM"
  return "LOW"
}

function buildReasonCodes(snapshot: FeatureSnapshot, candidate: TplusSetupCandidate | null, regime: MarketRegime, riskPlan?: TplusRiskPlan) {
  const reasons = [...(candidate?.reasons ?? [])]
  const risks = [...(candidate?.risks ?? [])]
  if (snapshot.trend.aboveEma50) reasons.push("ABOVE_EMA50")
  if (snapshot.trend.aboveEma200) reasons.push("ABOVE_EMA200")
  if (snapshot.relativeStrength.rs20 > 5) reasons.push("RS20_STRONG")
  if (snapshot.volume.rvol20 >= 1.4) reasons.push("RVOL_HIGH")
  if (snapshot.volume.cmf20 > 0) reasons.push("CMF_POSITIVE")
  if (regime === "BULL") reasons.push("MARKET_REGIME_BULL")
  if (regime === "BULL_PULLBACK") reasons.push("MARKET_REGIME_BULL_PULLBACK")
  if (snapshot.momentum.rsi14 >= 72) risks.push("RSI_EXTENDED")
  if (snapshot.priceStructure.rangePosition20 >= 0.9) risks.push("NEAR_RANGE_HIGH")
  if (snapshot.volume.rvol20 < 0.8) risks.push("LOW_LIQUIDITY")
  if (snapshot.relativeStrength.rs20 < 0) risks.push("WEAK_RELATIVE_STRENGTH")
  if ((regime === "BEAR" || regime === "PANIC") && !["RSI_DIVERGENCE_REVERSAL", "VSA_REVERSAL", "MEAN_REVERSION"].includes(candidate?.setup ?? "")) risks.push("INDEX_BEAR")
  if (riskPlan && riskPlan.riskRewardTp1 < 1.5) risks.push("WEAK_RR")
  return { reasons: [...new Set(reasons)].slice(0, 10), risks: [...new Set(risks)].slice(0, 10) }
}

function determineAction(score: number, quality: TradeQuality, riskPlan: TplusRiskPlan | undefined, candidate: TplusSetupCandidate | null, regime: MarketRegime, config: TplusConfig): TradingSignal["action"] {
  if (!candidate || !riskPlan) return "NO_TRADE"
  if (!candidate.valid || riskPlan.riskRewardTp1 < 1.2) return "NO_TRADE"
  const hostile = regime === "BEAR" || regime === "PANIC"
  if (score >= config.minScoreToBuy && quality === "HIGH" && riskPlan.riskRewardTp1 >= config.minRiskReward && !hostile) return "BUY"
  if (score >= config.minScoreToWatch) return "WATCH"
  return "WAIT"
}

export function calculateTplusSignal(input: TplusEngineInput): TplusEngineResult {
  if (input.data.length < 60) throw new Error("TplusEngine requires at least 60 chronological OHLCV bars")
  for (let i = 1; i < input.data.length; i += 1) {
    if (input.data[i].date < input.data[i - 1].date) throw new Error("TplusEngine requires chronological OHLCV data")
  }
  const config = mergeConfig(input.config)
  const features = input.features ?? calculateFeatures(input.data, input.featureContext)
  const snapshot = features.snapshot
  const regime = regimeName(input.regime)
  const candidates = detectSetups(input.data, snapshot, regime).filter((candidate) =>
    !input.allowedSetups || input.allowedSetups.includes(candidate.setup),
  )
  const rankedCandidates = candidates
    .map((candidate) => validateCandidate(candidate, snapshot, regime, config))
    .sort((a, b) => b.baseScore - a.baseScore)
  const candidate = rankedCandidates[0] ?? null
  const baseBreakdown = {
    trendStructure: scoreTrendStructure(snapshot),
    relativeStrength: scoreRelativeStrength(snapshot),
    setupQuality: scoreSetupQuality(candidate),
    volumeMoneyFlow: scoreVolumeMoneyFlow(snapshot),
    momentum: scoreMomentum(snapshot),
    marketRegime: scoreMarketRegime(regime),
    priceLocation: scorePriceLocation(snapshot),
    liquidityRisk: scoreLiquidityRisk(snapshot),
  }
  const breakdown: TplusScoreBreakdown = { ...baseBreakdown, total: weightedScore(baseBreakdown, config.weights) }
  const riskPlan = candidate ? buildRiskPlan(candidate, snapshot, input.data, config) : undefined
  const tradeQuality = determineTradeQuality(breakdown.total, riskPlan, candidate)
  const confidence = determineConfidence(snapshot, breakdown.total, candidate, regime)
  const action = determineAction(breakdown.total, tradeQuality, riskPlan, candidate, regime, config)
  const { reasons, risks } = buildReasonCodes(snapshot, candidate, regime, riskPlan)
  const signal: TradingSignal = {
    symbol: snapshot.symbol,
    date: snapshot.date,
    engine: "TPLUS",
    setup: candidate?.setup ?? "NONE",
    action,
    score: Math.round(breakdown.total),
    opportunityScore: Math.round(breakdown.total),
    tradeQuality,
    confidence,
    entryZone: candidate ? { low: candidate.entryLow, high: candidate.entryHigh } : undefined,
    trigger: candidate?.trigger,
    stopLoss: riskPlan?.stopLoss,
    tp1: riskPlan?.tp1,
    tp2: riskPlan?.tp2,
    riskReward: riskPlan?.riskRewardTp1,
    riskRewardTp2: riskPlan?.riskRewardTp2,
    reasons,
    risks,
    reasonCodes: reasons,
    riskCodes: risks,
    marketRegime: regime,
    scoreBreakdown: breakdown,
    riskPlan,
    strategyVersion: TPLUS_STRATEGY_VERSION,
  }
  return { signal, features, candidate }
}
