import type { OHLCV } from "@/models/market"
import { calculateCorrelationBeta } from "@/indicators/correlation"
import { calculateDivergence } from "@/indicators/divergence"
import { calculateIchimoku } from "@/indicators/ichimoku"
import { calculateMomentumIndicators } from "@/indicators/momentum"
import { relativeStrength, relativeStrengthPercentile } from "@/indicators/relativeStrength"
import { calculatePriceStructure } from "@/indicators/structure"
import { calculateTrendIndicators } from "@/indicators/trend"
import { calculateVolumeIndicators } from "@/indicators/volume"
import { calculateVolumeProfile } from "@/indicators/volumeProfile"
import type { FeatureEngineContext, FeatureEngineResult, IndicatorBundle } from "@/indicators/types"

function assertChronological(data: OHLCV[]) {
  for (let i = 1; i < data.length; i += 1) {
    if (data[i].date < data[i - 1].date) throw new Error("FeatureEngine requires chronological OHLCV data")
  }
}

function latest<T>(values: T[]): T {
  return values[values.length - 1]
}

export function calculateFeatures(data: OHLCV[], context: FeatureEngineContext = {}): FeatureEngineResult {
  if (!data.length) throw new Error("FeatureEngine requires at least one OHLCV row")
  assertChronological(data)
  const trend = calculateTrendIndicators(data)
  const momentum = calculateMomentumIndicators(data)
  const volume = calculateVolumeIndicators(data)
  const structure = calculatePriceStructure(data, volume.rvol20)
  const ichimoku = calculateIchimoku(data)
  const divergence = calculateDivergence(data, momentum.rsi14, momentum.macd)
  const rs = relativeStrength(data, context.benchmark, context.sectorBenchmark)
  const benchmarkCorrelation = calculateCorrelationBeta(data, context.benchmark)
  const snapshot = {
    symbol: latest(data).symbol,
    date: latest(data).date,
    close: latest(data).close,
    trend: {
      ema20: latest(trend.ema20), ema50: latest(trend.ema50), ema200: latest(trend.ema200),
      aboveEma50: latest(data).close > latest(trend.ema50), aboveEma200: latest(data).close > latest(trend.ema200),
      adx14: latest(trend.adx14), diPlus14: latest(trend.diPlus14), diMinus14: latest(trend.diMinus14),
      ema20Slope20Pct: latest(trend.ema20Slope20), ema50Slope20Pct: latest(trend.ema50Slope20), ema200Slope20Pct: latest(trend.ema200Slope20), atr14: latest(trend.atr14),
    },
    momentum: {
      rsi7: latest(momentum.rsi7), rsi14: latest(momentum.rsi14), rsi21: latest(momentum.rsi21),
      macd: latest(momentum.macd), macdSignal: latest(momentum.macdSignal), macdHistogram: latest(momentum.macdHistogram),
      roc5: latest(momentum.roc5), roc20: latest(momentum.roc20), mfi14: latest(momentum.mfi14),
      stochasticK14: latest(momentum.stochasticK14), stochasticD3: latest(momentum.stochasticD3),
    },
    relativeStrength: {
      ...rs,
      percentileVsUniverse: context.universeRs20 ? relativeStrengthPercentile(rs.rs20, context.universeRs20) : undefined,
    },
    correlation: benchmarkCorrelation,
    volume: {
      rvol20: latest(volume.rvol20), rvol60: latest(volume.rvol60), obv: latest(volume.obv), obvSlope20: latest(volume.obvSlope20),
      cmf20: latest(volume.cmf20), mfi14: latest(volume.mfi14), clv: latest(volume.clv),
      upVolume20: data.slice(-20).reduce((sum, _, idx) => sum + (volume.upVolume[data.length - 20 + idx] || 0), 0),
      downVolume20: data.slice(-20).reduce((sum, _, idx) => sum + (volume.downVolume[data.length - 20 + idx] || 0), 0),
      vsa: latest(volume.vsa),
    },
    priceStructure: {
      high20: latest(structure.high20), low20: latest(structure.low20), high50: latest(structure.high50), low50: latest(structure.low50),
      high120: latest(structure.high120), low120: latest(structure.low120), high200: latest(structure.high200), low200: latest(structure.low200),
      distanceFromHigh20: latest(structure.distanceFromHigh20), distanceFromLow20: latest(structure.distanceFromLow20), rangePosition20: latest(structure.rangePosition20), state: latest(structure.state),
      hh: latest(structure.hh), hl: latest(structure.hl), lh: latest(structure.lh), ll: latest(structure.ll),
    },
    ichimoku: {
      tenkan9: latest(ichimoku.tenkan9), kijun26: latest(ichimoku.kijun26), senkouA: latest(ichimoku.senkouA), senkouB: latest(ichimoku.senkouB),
      chikou26: latest(ichimoku.chikou26), cloudThickness: latest(ichimoku.cloudThickness), distanceToCloud: latest(ichimoku.distanceToCloud), tkSpread: latest(ichimoku.tkSpread),
      futureCloudDirection: latest(ichimoku.futureCloudDirection), cloudPosition: latest(ichimoku.cloudPosition),
    },
    divergence: {
      rsiBullish: latest(divergence.rsiBullish), rsiBearish: latest(divergence.rsiBearish), macdBullish: latest(divergence.macdBullish), macdBearish: latest(divergence.macdBearish),
    },
  }
  const indicators: IndicatorBundle = {
    dates: data.map((bar) => bar.date),
    trend: {
      ema10: trend.ema10, ema20: trend.ema20, ema50: trend.ema50, ema100: trend.ema100, ema200: trend.ema200,
      sma20: trend.sma20, sma50: trend.sma50, sma200: trend.sma200, adx14: trend.adx14, diPlus14: trend.diPlus14, diMinus14: trend.diMinus14,
      ema20Slope20: trend.ema20Slope20, ema50Slope20: trend.ema50Slope20, ema200Slope20: trend.ema200Slope20, atr14: trend.atr14,
    },
    momentum,
    volume,
    priceStructure: structure,
    ichimoku,
    divergence,
  }
  return { indicators, snapshot, volumeProfile: calculateVolumeProfile(data) }
}
