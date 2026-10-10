import type { OHLCV } from "@/models/market"

export type ChartInterval = "1D" | "1W" | "1M"
export type ChartRange = "3M" | "6M" | "1Y" | "ALL"

function localDateKey(date: Date) {
  const year = date.getFullYear()
  const month = String(date.getMonth() + 1).padStart(2, "0")
  const day = String(date.getDate()).padStart(2, "0")
  return `${year}-${month}-${day}`
}

function intervalKey(dateText: string, interval: Exclude<ChartInterval, "1D">) {
  const parsed = new Date(`${dateText}T12:00:00`)
  if (interval === "1M") return dateText.slice(0, 7)
  const monday = new Date(parsed)
  monday.setDate(monday.getDate() - ((monday.getDay() + 6) % 7))
  return localDateKey(monday)
}

export function aggregateOhlcv(data: OHLCV[], interval: ChartInterval): OHLCV[] {
  if (interval === "1D") return [...data]
  const groups = new Map<string, OHLCV[]>()
  for (const row of data) {
    const key = intervalKey(row.date, interval)
    const group = groups.get(key) ?? []
    group.push(row)
    groups.set(key, group)
  }

  return [...groups.values()].map((group) => {
    const first = group[0]
    const last = group[group.length - 1]
    const values = group.flatMap((item) => item.value == null ? [] : [item.value])
    return {
      symbol: first.symbol,
      date: last.date,
      open: first.open,
      high: Math.max(...group.map((item) => item.high)),
      low: Math.min(...group.map((item) => item.low)),
      close: last.close,
      volume: group.reduce((sum, item) => sum + item.volume, 0),
      ...(values.length === group.length ? { value: values.reduce((sum, value) => sum + value, 0) } : {}),
    }
  })
}

export function selectChartRange<T>(data: T[], range: ChartRange, interval: ChartInterval): { data: T[]; startIndex: number } {
  if (range === "ALL") return { data, startIndex: 0 }
  const periods: Record<ChartInterval, Record<Exclude<ChartRange, "ALL">, number>> = {
    "1D": { "3M": 63, "6M": 126, "1Y": 252 },
    "1W": { "3M": 13, "6M": 26, "1Y": 52 },
    "1M": { "3M": 3, "6M": 6, "1Y": 12 },
  }
  const count = periods[interval][range]
  const startIndex = Math.max(0, data.length - count)
  return { data: data.slice(startIndex), startIndex }
}

export function calculateEma(values: number[], period: number): number[] {
  if (!Number.isInteger(period) || period < 1) throw new Error("EMA period must be a positive integer")
  const result = Array<number>(values.length).fill(Number.NaN)
  if (values.length < period) return result

  let seed = 0
  for (let i = 0; i < period; i += 1) seed += values[i]
  let previous = seed / period
  result[period - 1] = previous
  const alpha = 2 / (period + 1)
  for (let i = period; i < values.length; i += 1) {
    previous = values[i] * alpha + previous * (1 - alpha)
    result[i] = previous
  }
  return result
}
