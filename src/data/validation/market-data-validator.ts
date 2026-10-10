import type { OHLCV } from "@/models/market"
import type { DataQualityIssue, DataValidationReport } from "@/models/provider"

export interface ValidatedOHLCVResult {
  data: OHLCV[]
  report: DataValidationReport
}

function issue(
  level: DataQualityIssue["level"],
  code: string,
  message: string,
  row?: number,
  date?: string,
): DataQualityIssue {
  return { level, code, message, row, date }
}

export function validateOHLCVRows(rows: OHLCV[]): ValidatedOHLCVResult {
  const warnings: DataQualityIssue[] = []
  const errors: DataQualityIssue[] = []
  const valid: OHLCV[] = []
  const seen = new Set<string>()

  rows.forEach((row, index) => {
    const requiredNumbers = [row.open, row.high, row.low, row.close, row.volume]
    if (!row.symbol || !row.date) {
      errors.push(issue("error", "MISSING_IDENTITY", "Missing symbol or date.", index, row.date))
      return
    }
    if (requiredNumbers.some((value) => !Number.isFinite(value))) {
      errors.push(issue("error", "NON_FINITE_VALUE", "OHLCV contains a non-finite numeric value.", index, row.date))
      return
    }
    if (row.open < 0 || row.high < 0 || row.low < 0 || row.close < 0 || row.volume < 0) {
      errors.push(issue("error", "NEGATIVE_VALUE", "OHLCV contains a negative value.", index, row.date))
      return
    }
    if (row.high < row.low || row.high < row.open || row.high < row.close) {
      errors.push(issue("error", "INVALID_HIGH", "High is lower than open, close, or low.", index, row.date))
      return
    }
    if (row.low > row.open || row.low > row.close) {
      errors.push(issue("error", "INVALID_LOW", "Low is higher than open or close.", index, row.date))
      return
    }

    const key = `${row.symbol.toUpperCase()}|${row.date}`
    if (seen.has(key)) {
      warnings.push(issue("warning", "DUPLICATE_DATE", "Duplicate symbol/date row was dropped during normalization.", index, row.date))
      return
    }
    seen.add(key)
    valid.push({ ...row, symbol: row.symbol.toUpperCase(), date: row.date.slice(0, 10) })
  })

  valid.sort((a, b) => a.date.localeCompare(b.date))


  const report: DataValidationReport = {
    acceptedRows: valid.length,
    originalRows: rows.length,
    droppedRows: rows.length - valid.length,
    warnings,
    errors,
  }

  return { data: valid, report }
}

export function assertUsableOHLCV(result: ValidatedOHLCVResult): OHLCV[] {
  if (result.data.length === 0) {
    throw new Error("No usable OHLCV rows remain after validation.")
  }
  if (result.report.errors.length > 0 && result.data.length < Math.max(1, result.report.originalRows * 0.5)) {
    throw new Error(`Data quality failure: ${result.report.errors.length} invalid row(s) prevent a reliable dataset.`)
  }
  return result.data
}

export function summarizeValidation(result: ValidatedOHLCVResult): string {
  const parts = [`${result.report.acceptedRows}/${result.report.originalRows} rows accepted`]
  if (result.report.droppedRows > 0) parts.push(`${result.report.droppedRows} dropped`)
  if (result.report.warnings.length > 0) parts.push(`${result.report.warnings.length} warning(s)`)
  if (result.report.errors.length > 0) parts.push(`${result.report.errors.length} error(s)`)
  return parts.join(" · ")
}
