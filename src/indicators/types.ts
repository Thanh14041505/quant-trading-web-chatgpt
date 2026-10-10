import type { OHLCV } from "@/models/market"

export interface NumericSeriesPoint {
  date: string
  value: number
}

export interface IndicatorSnapshot {
  date: string
  value: number
}

export type MarketStructureState =
  | "ACCUMULATION"
  | "BREAKOUT"
  | "MARKUP"
  | "PULLBACK"
  | "DISTRIBUTION"
  | "MARKDOWN"
  | "REVERSAL"
  | "NEUTRAL"

export interface IndicatorBundle {
  dates: string[]
  trend: {
    ema10: number[]
    ema20: number[]
    ema50: number[]
    ema100: number[]
    ema200: number[]
    sma20: number[]
    sma50: number[]
    sma200: number[]
    adx14: number[]
    diPlus14: number[]
    diMinus14: number[]
    ema20Slope20: number[]
    ema50Slope20: number[]
    ema200Slope20: number[]
    atr14: number[]
  }
  momentum: {
    rsi7: number[]
    rsi14: number[]
    rsi21: number[]
    macd: number[]
    macdSignal: number[]
    macdHistogram: number[]
    roc5: number[]
    roc20: number[]
    mfi14: number[]
    stochasticK14: number[]
    stochasticD3: number[]
  }
  volume: {
    rvol20: number[]
    rvol60: number[]
    obv: number[]
    obvSlope20: number[]
    cmf20: number[]
    mfi14: number[]
    clv: number[]
    upVolume: number[]
    downVolume: number[]
    vsa: Array<"NONE" | "CLIMAX_UP" | "CLIMAX_DOWN" | "ABSORPTION" | "NO_DEMAND" | "NO_SUPPLY">
  }
  priceStructure: {
    high20: number[]
    low20: number[]
    high50: number[]
    low50: number[]
    high120: number[]
    low120: number[]
    high200: number[]
    low200: number[]
    distanceFromHigh20: number[]
    distanceFromLow20: number[]
    rangePosition20: number[]
    state: MarketStructureState[]
    hh: boolean[]
    hl: boolean[]
    lh: boolean[]
    ll: boolean[]
  }
  ichimoku: {
    tenkan9: number[]
    kijun26: number[]
    senkouA: number[]
    senkouB: number[]
    chikou26: number[]
    cloudThickness: number[]
    distanceToCloud: number[]
    tkSpread: number[]
    futureCloudDirection: Array<"UP" | "DOWN" | "FLAT">
    cloudPosition: Array<"ABOVE" | "INSIDE" | "BELOW" | "UNKNOWN">
  }
  divergence: {
    rsiBullish: boolean[]
    rsiBearish: boolean[]
    macdBullish: boolean[]
    macdBearish: boolean[]
  }
}

export interface FeatureSnapshot {
  symbol: string
  date: string
  close: number
  trend: IndicatorBundle["trend"] extends infer _T ? {
    ema20: number
    ema50: number
    ema200: number
    aboveEma50: boolean
    aboveEma200: boolean
    adx14: number
    diPlus14: number
    diMinus14: number
    ema20Slope20Pct: number
    ema50Slope20Pct: number
    ema200Slope20Pct: number
    atr14: number
  } : never
  momentum: {
    rsi7: number
    rsi14: number
    rsi21: number
    macd: number
    macdSignal: number
    macdHistogram: number
    roc5: number
    roc20: number
    mfi14: number
    stochasticK14: number
    stochasticD3: number
  }
  relativeStrength: {
    rs20: number
    rs60: number
    rs120: number
    percentileVsUniverse?: number
    returnVsBenchmark20?: number
    returnVsBenchmark60?: number
    returnVsBenchmark120?: number
    sectorRelative20?: number
  }
  correlation: {
    corr20?: number
    corr60?: number
    corr120?: number
    beta20?: number
    beta60?: number
    beta120?: number
  }
  volume: {
    rvol20: number
    rvol60: number
    obv: number
    obvSlope20: number
    cmf20: number
    mfi14: number
    clv: number
    upVolume20: number
    downVolume20: number
    vsa: IndicatorBundle["volume"]["vsa"][number]
  }
  priceStructure: {
    high20: number
    low20: number
    high50: number
    low50: number
    high120: number
    low120: number
    high200: number
    low200: number
    distanceFromHigh20: number
    distanceFromLow20: number
    rangePosition20: number
    state: MarketStructureState
    hh: boolean
    hl: boolean
    lh: boolean
    ll: boolean
  }
  ichimoku: {
    tenkan9: number
    kijun26: number
    senkouA: number
    senkouB: number
    chikou26: number
    cloudThickness: number
    distanceToCloud: number
    tkSpread: number
    futureCloudDirection: "UP" | "DOWN" | "FLAT"
    cloudPosition: "ABOVE" | "INSIDE" | "BELOW" | "UNKNOWN"
  }
  divergence: {
    rsiBullish: boolean
    rsiBearish: boolean
    macdBullish: boolean
    macdBearish: boolean
  }
}

export interface VolumeProfileResult {
  poc: number
  vah: number
  val: number
  hvn: number[]
  lvn: number[]
  bins: Array<{ low: number; high: number; volume: number; share: number }>
  approximate: true
}

export interface FeatureEngineResult {
  indicators: IndicatorBundle
  snapshot: FeatureSnapshot
  volumeProfile: VolumeProfileResult
}

export interface FeatureEngineContext {
  benchmark?: OHLCV[]
  sectorBenchmark?: OHLCV[]
  universeRs20?: number[]
}
