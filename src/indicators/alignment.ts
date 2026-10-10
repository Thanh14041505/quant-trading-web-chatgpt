import type { OHLCV } from "@/models/market"

export interface AlignedPair {
  date: string
  left: OHLCV
  right: OHLCV
}

export function alignByDate(left: OHLCV[], right: OHLCV[]): AlignedPair[] {
  const rightByDate = new Map(right.map((row) => [row.date, row] as const))
  return left.flatMap((row) => {
    const counterpart = rightByDate.get(row.date)
    return counterpart ? [{ date: row.date, left: row, right: counterpart }] : []
  })
}
