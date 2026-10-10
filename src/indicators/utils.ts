export const EPSILON = 1e-12

export function finiteOrNaN(value: number): number {
  return Number.isFinite(value) ? value : Number.NaN
}

export function safeDiv(numerator: number, denominator: number, fallback = Number.NaN): number {
  return Math.abs(denominator) <= EPSILON ? fallback : numerator / denominator
}

export function clamp(value: number, min: number, max: number): number {
  return Math.min(Math.max(value, min), max)
}

export function mean(values: number[]): number {
  const valid = values.filter(Number.isFinite)
  if (!valid.length) return Number.NaN
  return valid.reduce((sum, value) => sum + value, 0) / valid.length
}

export function standardDeviation(values: number[]): number {
  const valid = values.filter(Number.isFinite)
  if (valid.length < 2) return Number.NaN
  const avg = mean(valid)
  return Math.sqrt(mean(valid.map((value) => (value - avg) ** 2)))
}

export function covariance(a: number[], b: number[]): number {
  const pairs = a.map((value, i) => [value, b[i]] as const).filter(([x, y]) => Number.isFinite(x) && Number.isFinite(y))
  if (pairs.length < 2) return Number.NaN
  const ax = mean(pairs.map(([x]) => x))
  const by = mean(pairs.map(([, y]) => y))
  return mean(pairs.map(([x, y]) => (x - ax) * (y - by)))
}

export function correlation(a: number[], b: number[]): number {
  const cov = covariance(a, b)
  const sdA = standardDeviation(a)
  const sdB = standardDeviation(b)
  return finiteOrNaN(safeDiv(cov, sdA * sdB))
}

export function linearSlope(values: number[]): number {
  const indexed = values.map((value, i) => ({ x: i, y: value })).filter((point) => Number.isFinite(point.y))
  if (indexed.length < 2) return Number.NaN
  const xMean = mean(indexed.map((point) => point.x))
  const yMean = mean(indexed.map((point) => point.y))
  const numerator = indexed.reduce((sum, point) => sum + (point.x - xMean) * (point.y - yMean), 0)
  const denominator = indexed.reduce((sum, point) => sum + (point.x - xMean) ** 2, 0)
  return safeDiv(numerator, denominator)
}

export function rollingMean(values: number[], period: number): number[] {
  const result = Array(values.length).fill(Number.NaN)
  if (period <= 0) return result
  let sum = 0
  let valid = 0
  for (let i = 0; i < values.length; i += 1) {
    const value = values[i]
    if (Number.isFinite(value)) {
      sum += value
      valid += 1
    }
    if (i >= period) {
      const old = values[i - period]
      if (Number.isFinite(old)) {
        sum -= old
        valid -= 1
      }
    }
    if (i >= period - 1 && valid > 0) result[i] = sum / valid
  }
  return result
}

export function rollingSum(values: number[], period: number): number[] {
  const result = Array(values.length).fill(Number.NaN)
  let sum = 0
  let valid = 0
  for (let i = 0; i < values.length; i += 1) {
    const value = values[i]
    if (Number.isFinite(value)) {
      sum += value
      valid += 1
    }
    if (i >= period) {
      const old = values[i - period]
      if (Number.isFinite(old)) {
        sum -= old
        valid -= 1
      }
    }
    if (i >= period - 1 && valid > 0) result[i] = sum
  }
  return result
}

export function rollingMax(values: number[], period: number): number[] {
  const result = Array(values.length).fill(Number.NaN)
  for (let i = 0; i < values.length; i += 1) {
    if (i < period - 1) continue
    const window = values.slice(i - period + 1, i + 1).filter(Number.isFinite)
    if (window.length) result[i] = Math.max(...window)
  }
  return result
}

export function rollingMin(values: number[], period: number): number[] {
  const result = Array(values.length).fill(Number.NaN)
  for (let i = 0; i < values.length; i += 1) {
    if (i < period - 1) continue
    const window = values.slice(i - period + 1, i + 1).filter(Number.isFinite)
    if (window.length) result[i] = Math.min(...window)
  }
  return result
}

export function pctChange(current: number, previous: number): number {
  return finiteOrNaN((current / previous - 1) * 100)
}

export function lastFinite<T>(values: T[], predicate: (value: T) => boolean = (value) => Number.isFinite(value)) : T | undefined {
  for (let i = values.length - 1; i >= 0; i -= 1) {
    if (predicate(values[i])) return values[i]
  }
  return undefined
}

export function rankPercentile(value: number, population: number[]): number {
  const valid = population.filter(Number.isFinite).sort((a, b) => a - b)
  if (!valid.length || !Number.isFinite(value)) return Number.NaN
  const lessOrEqual = valid.filter((item) => item <= value).length
  return (lessOrEqual / valid.length) * 100
}
