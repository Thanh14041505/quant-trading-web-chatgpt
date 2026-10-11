import type { ScannerRunResult } from "./types"

type Flat = Record<string, unknown>
function flatten(value: unknown, prefix = "", out: Flat = {}): Flat {
  if (value == null || typeof value !== "object" || value instanceof Date) {
    out[prefix || "value"] = value instanceof Date ? value.toISOString() : value
    return out
  }
  if (Array.isArray(value)) {
    if (!value.length) out[prefix || "value"] = ""
    else if (value.every((item) => item == null || typeof item !== "object")) out[prefix || "value"] = value.join(" | ")
    else value.forEach((item, i) => flatten(item, prefix ? `${prefix}[${i}]` : String(i), out))
    return out
  }
  for (const [key, child] of Object.entries(value as Record<string, unknown>)) {
    flatten(child, prefix ? `${prefix}.${key}` : key, out)
  }
  return out
}
function xml(value: unknown) {
  const text = value == null ? "" : typeof value === "object" ? JSON.stringify(value) : String(value)
  return text.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;").replace(/'/g, "&apos;")
}
function cell(value: unknown) {
  const numeric = typeof value === "number" && Number.isFinite(value)
  return `<Cell><Data ss:Type="${numeric ? "Number" : "String"}">${xml(value)}</Data></Cell>`
}
function worksheet(name: string, rows: unknown[][]) {
  const body = rows.map(row => `<Row>${row.map(cell).join("")}</Row>`).join("")
  return `<Worksheet ss:Name="${xml(name.slice(0,31))}"><Table>${body}</Table></Worksheet>`
}
function objectSheet(name: string, items: Flat[]) {
  const keys = [...new Set(items.flatMap(item => Object.keys(item)))].sort()
  return worksheet(name, [keys, ...items.map(item => keys.map(key => item[key] ?? ""))])
}
function safeFilename(engine: string, date: string) {
  return `vn_quant_${engine.toLowerCase()}_${date.replace(/[:.]/g, "-")}.xls`
}

/** Export a multi-sheet Excel-compatible SpreadsheetML workbook without an extra runtime dependency. */
export function exportScannerExcel(result: ScannerRunResult) {
  const generated = result.generatedAt || new Date().toISOString()
  const rows = result.rows ?? []
  const successful = rows.filter(row => row.status === "SUCCESS")
  const failures = rows.filter(row => row.status !== "SUCCESS")
  const signals = rows.map(row => ({
    engine: row.engine, symbol: row.symbol, status: row.status, error: row.error ?? "",
    company: row.company, averageValue20: row.averageValue20,
    signal: row.signal ?? row.tplusSignal ?? row.holdSignal ?? null,
    feature: row.feature ?? null, fundamentals: row.fundamentals ?? null,
    detailWarnings: row.detailWarnings ?? [],
  }))
  const prices = rows.flatMap(row => (row.history ?? []).map(bar => ({ ...bar, engine: row.engine, companyName: row.company.name })))
  const indicators = rows.flatMap(row => {
    const detail = row.featureDetails
    if (!detail) return []
    const dates = detail.indicators.dates
    return dates.map((date, index) => ({
      engine: row.engine, symbol: row.symbol, date,
      close: row.history?.find(bar => bar.date === date)?.close ?? "",
      ...flatten({
        trend: Object.fromEntries(Object.entries(detail.indicators.trend).map(([key, values]) => [key, values[index]])),
        momentum: Object.fromEntries(Object.entries(detail.indicators.momentum).map(([key, values]) => [key, values[index]])),
        volume: Object.fromEntries(Object.entries(detail.indicators.volume).map(([key, values]) => [key, values[index]])),
        priceStructure: Object.fromEntries(Object.entries(detail.indicators.priceStructure).map(([key, values]) => [key, values[index]])),
        ichimoku: Object.fromEntries(Object.entries(detail.indicators.ichimoku).map(([key, values]) => [key, values[index]])),
        divergence: Object.fromEntries(Object.entries(detail.indicators.divergence).map(([key, values]) => [key, values[index]])),
      }),
    }))
  })
  const summary = [
    ["Field", "Value"],
    ["Engine", result.engine], ["Provider", result.providerId], ["Generated at", generated],
    ["Universe source", result.universeSource], ["Requested symbols", result.requestedSymbols?.length ?? result.progress.total],
    ["Rows in snapshot", rows.length], ["Successful", successful.length], ["Failed", failures.length],
    ["Progress processed", result.progress.processed], ["Progress success", result.progress.success],
    ["Progress failed", result.progress.failed], ["Data mode", result.dataMode],
    ["Scan config", JSON.stringify(result.scanConfig ?? {})],
    ["Market regime", JSON.stringify(result.marketRegime ?? {})],
    ["Export notes", "Blank cells mean unavailable/not supplied, not zero. Signal confidence is not a calibrated win probability. Technical indicators are calculated from available daily OHLCV; verify source, units and data freshness."],
  ]
  const errors = rows.filter(row => row.status !== "SUCCESS").map(row => ({ symbol: row.symbol, engine: row.engine, status: row.status, error: row.error ?? "", company: row.company }))
  const workbook = `<?xml version="1.0" encoding="UTF-8"?><?mso-application progid="Excel.Sheet"?><Workbook xmlns="urn:schemas-microsoft-com:office:spreadsheet" xmlns:o="urn:schemas-microsoft-com:office:office" xmlns:x="urn:schemas-microsoft-com:office:excel" xmlns:ss="urn:schemas-microsoft-com:office:spreadsheet"><Styles><Style ss:ID="Default" ss:Name="Normal"><Alignment ss:Vertical="Top" ss:WrapText="1"/><Font ss:FontName="Arial" ss:Size="10"/></Style></Styles>${worksheet("Summary", summary)}${objectSheet("All Scanned Stocks", signals)}${objectSheet("Raw OHLCV History", prices)}${objectSheet("Daily Indicators", indicators)}${objectSheet("Market Regime", [flatten(result.marketRegime ?? {})])}${objectSheet("Scan Errors", errors)}${objectSheet("Requested Symbols", (result.requestedSymbols ?? rows.map(row => row.symbol)).map((symbol, index) => ({ order: index + 1, symbol, scanned: rows.some(row => row.symbol === symbol) })))} </Workbook>`
  const blob = new Blob(["\ufeff", workbook], { type: "application/vnd.ms-excel;charset=utf-8" })
  const url = URL.createObjectURL(blob)
  const anchor = document.createElement("a")
  anchor.href = url
  anchor.download = safeFilename(result.engine, generated)
  document.body.appendChild(anchor)
  anchor.click()
  anchor.remove()
  URL.revokeObjectURL(url)
}
