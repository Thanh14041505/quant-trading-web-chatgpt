import type { OHLCV } from "@/models/market"
import { calculateFeatures } from "@/quant/features"
import type { FeatureSnapshot } from "@/indicators/types"
import type {
  BreadthSnapshot,
  MarketRegime,
  MarketRegimeComponentScores,
  MarketRegimeInput,
  MarketRegimeMetrics,
  MarketRegimeSnapshot,
  RegimeConfidence,
  SectorStrengthSnapshot,
  StockBreadthInput,
} from "./types"

function finite(value: number | undefined, fallback = 0) {
  return Number.isFinite(value) ? Number(value) : fallback
}

function clamp(value: number, min = 0, max = 100) {
  return Math.max(min, Math.min(max, value))
}

function latest<T>(values: T[]): T {
  return values[values.length - 1]
}

function pctChange(data: OHLCV[], periods: number) {
  if (data.length <= periods) return Number.NaN
  const from = data[data.length - periods - 1]?.close
  const to = data[data.length - 1]?.close
  if (!Number.isFinite(from) || !Number.isFinite(to) || from === 0) return Number.NaN
  return ((to / from) - 1) * 100
}

function percentileScore(value: number, low: number, high: number) {
  if (!Number.isFinite(value)) return 50
  return clamp(((value - low) / (high - low)) * 100)
}

function buildIndexMetrics(indexData: OHLCV[], feature: ReturnType<typeof calculateFeatures>): MarketRegimeMetrics {
  const latestBar = latest(indexData)
  const t = feature.snapshot.trend
  const m = feature.snapshot.momentum
  const v = feature.snapshot.volume
  const ps = feature.snapshot.priceStructure
  const atr14Pct = t.atr14 > 0 ? (t.atr14 / latestBar.close) * 100 : Number.NaN
  const return1dPct = indexData.length >= 2 ? ((latestBar.close / indexData[indexData.length - 2].close) - 1) * 100 : Number.NaN
  return {
    close: latestBar.close,
    ema20: finite(t.ema20), ema50: finite(t.ema50), ema200: finite(t.ema200),
    ema20Slope20Pct: finite(t.ema20Slope20Pct), ema50Slope20Pct: finite(t.ema50Slope20Pct), ema200Slope20Pct: finite(t.ema200Slope20Pct),
    adx14: finite(t.adx14), diPlus14: finite(t.diPlus14), diMinus14: finite(t.diMinus14),
    rsi14: finite(m.rsi14), roc20: finite(m.roc20), atr14Pct: finite(atr14Pct), rvol20: finite(v.rvol20),
    return1dPct: finite(return1dPct), return5dPct: finite(pctChange(indexData, 5)), return20dPct: finite(pctChange(indexData, 20)),
    distanceFromHigh20Pct: finite(ps.distanceFromHigh20), distanceFromHigh50Pct: ps.high50 > 0 ? ((latestBar.close / ps.high50) - 1) * 100 : 0,
    aboveEma20: latestBar.close > t.ema20, aboveEma50: latestBar.close > t.ema50, aboveEma200: latestBar.close > t.ema200,
    trendAligned: latestBar.close > t.ema20 && t.ema20 > t.ema50 && t.ema50 > t.ema200,
    volatilityExpansion: finite(v.rvol20) >= 1.4 || finite(atr14Pct) >= 2.2,
  }
}

function scoreTrend(m: MarketRegimeMetrics) {
  let score = 35
  if (m.aboveEma20) score += 12
  if (m.aboveEma50) score += 10
  if (m.aboveEma200) score += 10
  if (m.ema20Slope20Pct > 0) score += 7
  if (m.ema50Slope20Pct > 0) score += 7
  if (m.ema200Slope20Pct > 0) score += 4
  if (m.diPlus14 > m.diMinus14) score += 5
  if (m.adx14 >= 25) score += 5
  if (m.ema20Slope20Pct < 0) score -= 6
  if (m.ema50Slope20Pct < 0) score -= 8
  if (m.ema200Slope20Pct < 0) score -= 8
  return clamp(score)
}

function scoreBreadth(breadth?: BreadthSnapshot) {
  if (!breadth || breadth.totalStocks <= 0) return 50
  const ema20 = clamp(breadth.aboveEma20Pct)
  const ema50 = clamp(breadth.aboveEma50Pct)
  const adTotal = Math.max(1, breadth.advanceCount + breadth.declineCount)
  const adRatioScore = clamp((breadth.advanceCount / adTotal) * 100)
  const sectorScore = breadth.sectorBreadthPct == null ? 50 : clamp(breadth.sectorBreadthPct)
  return clamp(0.3 * ema20 + 0.3 * ema50 + 0.25 * adRatioScore + 0.15 * sectorScore)
}

function scoreMomentum(m: MarketRegimeMetrics) {
  let score = 50
  score += percentileScore(m.rsi14, 40, 65) * 0.3 - 15
  score += percentileScore(m.roc20, -5, 10) * 0.45 - 22.5
  if (m.return5dPct > 0) score += 6
  if (m.return20dPct > 0) score += 8
  if (m.rsi14 >= 75) score -= 10
  if (m.rsi14 <= 30) score -= 15
  return clamp(score)
}

function scoreVolatility(m: MarketRegimeMetrics) {
  if (!Number.isFinite(m.atr14Pct)) return 50
  let score = 70
  if (m.atr14Pct > 3.5) score -= 30
  else if (m.atr14Pct > 2.8) score -= 15
  else if (m.atr14Pct < 1.0) score -= 5
  if (m.return1dPct <= -3.5) score -= 35
  else if (m.return1dPct <= -2.0) score -= 18
  return clamp(score)
}

function scoreParticipation(m: MarketRegimeMetrics, breadth?: BreadthSnapshot) {
  let score = 50
  if (m.rvol20 >= 1.2) score += 10
  if (m.rvol20 >= 1.5) score += 10
  if (m.diPlus14 > m.diMinus14) score += 10
  if (breadth?.sectorBreadthPct != null) {
    score += (clamp(breadth.sectorBreadthPct) - 50) * 0.3
  }
  if (m.return1dPct < 0 && m.rvol20 >= 1.5) score -= 15
  return clamp(score)
}

function classifyRegime(m: MarketRegimeMetrics, scores: MarketRegimeComponentScores, breadth?: BreadthSnapshot): MarketRegime {
  const breadthScore = scores.breadth
  const severeBreadth = breadth ? breadth.aboveEma50Pct < 20 && breadth.advanceDeclineRatio < 0.55 : false
  const panic = (m.return1dPct <= -4 && m.rvol20 >= 1.8) || (m.close < m.ema200 && m.ema50Slope20Pct < -0.8 && severeBreadth)
  if (panic) return "PANIC"

  const bear = m.close < m.ema50 && m.ema50 < m.ema200 && m.ema50Slope20Pct < 0 && breadthScore < 42
  if (bear) return "BEAR"

  const distribution = m.close > m.ema200 && breadthScore < 45 && (m.distanceFromHigh20Pct > -3 || m.distanceFromHigh50Pct > -5) && scores.trend >= 52
  if (distribution) return "DISTRIBUTION"

  const pullback = m.close > m.ema200 && m.close < m.ema20 && m.return20dPct > 0 && breadthScore >= 45 && scores.trend >= 55
  if (pullback) return "BULL_PULLBACK"

  const bull = scores.total >= 64 && scores.trend >= 60 && scores.breadth >= 55 && m.close > m.ema200
  if (bull) return "BULL"

  return "SIDEWAYS"
}

function confidenceFor(regime: MarketRegime, scores: MarketRegimeComponentScores) {
  const spread = Math.max(...[scores.trend, scores.breadth, scores.momentum, scores.volatility, scores.participation]) - Math.min(...[scores.trend, scores.breadth, scores.momentum, scores.volatility, scores.participation])
  const conviction = regime === "SIDEWAYS" ? 100 - Math.abs(scores.total - 50) * 2 : Math.abs(scores.total - 50) * 2
  const agreement = 100 - spread
  const strength = conviction * 0.7 + agreement * 0.3
  if (strength >= 72) return "HIGH" as RegimeConfidence
  if (strength >= 48) return "MEDIUM" as RegimeConfidence
  return "LOW" as RegimeConfidence
}

function buildReasons(regime: MarketRegime, m: MarketRegimeMetrics, scores: MarketRegimeComponentScores, breadth?: BreadthSnapshot) {
  const reasons: string[] = []
  const warnings: string[] = []
  if (m.trendAligned) reasons.push("INDEX_TREND_ALIGNED")
  if (m.aboveEma200) reasons.push("INDEX_ABOVE_EMA200")
  if (m.ema20Slope20Pct > 0) reasons.push("EMA20_SLOPE_POSITIVE")
  if (m.adx14 >= 25) reasons.push("ADX_TRENDING")
  if (breadth && breadth.aboveEma50Pct >= 60) reasons.push("BREADTH_ABOVE_EMA50_HEALTHY")
  if (breadth && breadth.advanceDeclineRatio >= 1.5) reasons.push("ADVANCE_DECLINE_POSITIVE")
  if (m.rvol20 >= 1.4) reasons.push("INDEX_RVOL_HIGH")
  if (m.return20dPct > 5) reasons.push("20D_MOMENTUM_POSITIVE")

  if (m.rsi14 >= 72) warnings.push("INDEX_RSI_EXTENDED")
  if (m.rsi14 <= 30) warnings.push("INDEX_RSI_OVERSOLD")
  if (m.return1dPct <= -2) warnings.push("INDEX_DAILY_SELL_OFF")
  if (m.volatilityExpansion) warnings.push("VOLATILITY_EXPANSION")
  if (breadth && breadth.aboveEma50Pct < 45) warnings.push("BREADTH_WEAK")
  if (breadth && breadth.advanceDeclineRatio < 0.8) warnings.push("ADVANCE_DECLINE_WEAK")
  if (regime === "DISTRIBUTION") warnings.push("DISTRIBUTION_RISK")
  if (regime === "BEAR") warnings.push("BEAR_TREND")
  if (regime === "PANIC") warnings.push("PANIC_RISK")
  if (scores.volatility < 35) warnings.push("VOLATILITY_RISK")

  return { reasons: reasons.slice(0, 8), warnings: warnings.slice(0, 8) }
}

function sortSectors(sectors: SectorStrengthSnapshot[] | undefined) {
  return [...(sectors ?? [])].sort((a, b) => b.return20 - a.return20)
}

export function calculateMarketRegime(input: MarketRegimeInput): MarketRegimeSnapshot {
  if (!input.indexData.length) throw new Error("MarketRegimeEngine requires indexData")
  const feature = calculateFeatures(input.indexData)
  const metrics = buildIndexMetrics(input.indexData, feature)
  const components: MarketRegimeComponentScores = {
    trend: scoreTrend(metrics),
    breadth: scoreBreadth(input.breadth),
    momentum: scoreMomentum(metrics),
    volatility: scoreVolatility(metrics),
    participation: scoreParticipation(metrics, input.breadth),
    total: 0,
  }
  components.total = clamp(
    components.trend * 0.30 +
    components.breadth * 0.25 +
    components.momentum * 0.15 +
    components.volatility * 0.15 +
    components.participation * 0.15,
  )

  const regime = classifyRegime(metrics, components, input.breadth)
  const confidence = confidenceFor(regime, components)
  const sectors = sortSectors(input.sectorStrength)
  const { reasons, warnings } = buildReasons(regime, metrics, components, input.breadth)

  return {
    symbol: input.indexSymbol ?? latest(input.indexData).symbol,
    date: latest(input.indexData).date,
    regime,
    confidence,
    score: Math.round(components.total * 10) / 10,
    components,
    metrics,
    breadth: input.breadth,
    strongestSectors: sectors.slice(0, 3),
    weakestSectors: sectors.slice(-3).reverse(),
    reasons,
    warnings,
  }
}

export function calculateBreadthFromFeatures(stockInputs: StockBreadthInput[]): BreadthSnapshot {
  if (!stockInputs.length) {
    return {
      totalStocks: 0, aboveEma20Pct: 0, aboveEma50Pct: 0, advanceCount: 0, declineCount: 0,
      unchangedCount: 0, advanceDeclineRatio: 1,
    }
  }
  let aboveEma20 = 0
  let aboveEma50 = 0
  let advances = 0
  let declines = 0
  let unchanged = 0
  for (const stock of stockInputs) {
    const { feature } = stock
    if (feature.trend.ema20 < feature.close && feature.close > feature.trend.ema20) aboveEma20 += 1
    if (feature.trend.ema50 < feature.close && feature.close > feature.trend.ema50) aboveEma50 += 1
    if (stock.previousClose == null) unchanged += 1
    else if (feature.close > stock.previousClose) advances += 1
    else if (feature.close < stock.previousClose) declines += 1
    else unchanged += 1
  }
  return {
    totalStocks: stockInputs.length,
    aboveEma20Pct: (aboveEma20 / stockInputs.length) * 100,
    aboveEma50Pct: (aboveEma50 / stockInputs.length) * 100,
    advanceCount: advances,
    declineCount: declines,
    unchangedCount: unchanged,
    advanceDeclineRatio: declines === 0 ? advances : advances / declines,
  }
}

export function deriveBreadthFromFeatures(features: FeatureSnapshot[]) {
  return calculateBreadthFromFeatures(features.map((feature) => ({ symbol: feature.symbol, feature })))
}
