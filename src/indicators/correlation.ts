import type { OHLCV } from "@/models/market"
import { alignByDate } from "./alignment"
import { correlation, covariance, safeDiv } from "./utils"

function returnSeries(data: OHLCV[]): number[] {
  return data.map((bar, i) => i === 0 ? Number.NaN : (bar.close / data[i - 1].close) - 1)
}

function trailingPair(stock: number[], benchmark: number[], period: number) {
  const a = stock.slice(-period)
  const b = benchmark.slice(-period)
  return { a, b }
}

export function calculateCorrelationBeta(stock: OHLCV[], benchmark?: OHLCV[]) {
  if (!benchmark?.length) return { corr20: undefined, corr60: undefined, corr120: undefined, beta20: undefined, beta60: undefined, beta120: undefined }
  const aligned = alignByDate(stock, benchmark)
  const alignedStock = aligned.map((pair) => pair.left)
  const alignedBenchmark = aligned.map((pair) => pair.right)
  const stockReturns = returnSeries(alignedStock)
  const benchmarkReturns = returnSeries(alignedBenchmark)
  const calc = (period: number) => {
    const { a, b } = trailingPair(stockReturns, benchmarkReturns, period)
    const cov = covariance(a, b)
    const variance = covariance(b, b)
    return { corr: correlation(a, b), beta: safeDiv(cov, variance) }
  }
  const p20 = calc(20)
  const p60 = calc(60)
  const p120 = calc(120)
  return { corr20: p20.corr, corr60: p60.corr, corr120: p120.corr, beta20: p20.beta, beta60: p60.beta, beta120: p120.beta }
}
