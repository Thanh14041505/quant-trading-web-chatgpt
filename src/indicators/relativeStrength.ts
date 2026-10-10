import type { OHLCV } from "@/models/market"
import { alignByDate } from "./alignment"
import { pctChange, rankPercentile } from "./utils"

function returnOverPeriod(series: OHLCV[], period: number): number {
  return series.length > period ? pctChange(series.at(-1)!.close, series.at(-(period + 1))!.close) : Number.NaN
}

export function relativeStrength(stock: OHLCV[], benchmark?: OHLCV[], sector?: OHLCV[]) {
  const rs20 = returnOverPeriod(stock, 20)
  const rs60 = returnOverPeriod(stock, 60)
  const rs120 = returnOverPeriod(stock, 120)
  const benchmarkAligned = benchmark ? alignByDate(stock, benchmark).map((pair) => pair.right) : []
  const sectorAligned = sector ? alignByDate(stock, sector).map((pair) => pair.right) : []
  return {
    rs20,
    rs60,
    rs120,
    returnVsBenchmark20: benchmarkAligned.length > 20 ? rs20 - returnOverPeriod(benchmarkAligned, 20) : undefined,
    returnVsBenchmark60: benchmarkAligned.length > 60 ? rs60 - returnOverPeriod(benchmarkAligned, 60) : undefined,
    returnVsBenchmark120: benchmarkAligned.length > 120 ? rs120 - returnOverPeriod(benchmarkAligned, 120) : undefined,
    sectorRelative20: sectorAligned.length > 20 ? rs20 - returnOverPeriod(sectorAligned, 20) : undefined,
  }
}

export function relativeStrengthPercentile(rsValue: number, universeValues: number[]): number {
  return rankPercentile(rsValue, universeValues)
}
