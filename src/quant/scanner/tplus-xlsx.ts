import { DEFAULT_TPLUS_CONFIG, TPLUS_STRATEGY_VERSION } from "@/quant/tplus"
import type { ScannerRunResult, ScannerRow } from "./types"

type CellValue = string | number | boolean | null | undefined
type Flat = Record<string, CellValue>
type Matrix = CellValue[][]
const encoder = new TextEncoder()

function xml(value: unknown): string {
  const raw: string = value == null ? "" : typeof value === "object" ? (JSON.stringify(value) ?? "") : String(value)
  const text = raw
    .replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F]/g, "")
    .slice(0, 32000)
  return text.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;").replace(/'/g, "&apos;")
}
function scalar(value: unknown): CellValue {
  if (value == null) return ""
  if (typeof value === "number") return Number.isFinite(value) ? value : ""
  if (typeof value === "string" || typeof value === "boolean") return value
  if (Array.isArray(value)) return value.map((v) => v == null ? "" : typeof v === "object" ? JSON.stringify(v) : String(v)).join(" | ")
  return JSON.stringify(value)
}
function flatten(value: unknown, prefix = "", out: Flat = {}): Flat {
  if (value == null || typeof value !== "object" || Array.isArray(value)) {
    out[prefix || "value"] = scalar(value)
    return out
  }
  for (const [key, child] of Object.entries(value as Record<string, unknown>)) flatten(child, prefix ? prefix + "." + key : key, out)
  return out
}
function columnName(n: number): string {
  let x = n + 1, label = ""
  while (x > 0) { const r = (x - 1) % 26; label = String.fromCharCode(65 + r) + label; x = Math.floor((x - 1) / 26) }
  return label
}
function cell(address: string, value: CellValue): string {
  if (value == null || value === "" || (typeof value === "number" && !Number.isFinite(value))) return '<c r="' + address + '"/>'
  if (typeof value === "number" && Number.isFinite(value)) return '<c r="' + address + '"><v>' + value + '</v></c>'
  if (typeof value === "boolean") return '<c r="' + address + '" t="b"><v>' + (value ? 1 : 0) + '</v></c>'
  return '<c r="' + address + '" t="inlineStr"><is><t xml:space="preserve">' + xml(value) + '</t></is></c>'
}
function sheetXml(matrix: Matrix): string {
  const rowXml = matrix.map((row, ri) => '<row r="' + (ri + 1) + '">' + row.map((v, ci) => cell(columnName(ci) + (ri + 1), v)).join("") + '</row>').join("")
  let columns = 1
  for (const row of matrix) if (row.length > columns) columns = row.length
  const rows = Math.max(1, matrix.length)
  const edge = columnName(columns - 1) + rows
  return '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>' +
    '<worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main"><dimension ref="A1:' + edge + '"/>' +
    '<sheetViews><sheetView workbookViewId="0"><pane ySplit="1" topLeftCell="A2" activePane="bottomLeft" state="frozen"/></sheetView></sheetViews>' +
    '<sheetFormatPr defaultRowHeight="18"/><sheetData>' + rowXml + '</sheetData><autoFilter ref="A1:' + edge + '"/></worksheet>'
}
function objectMatrix(items: Flat[]): Matrix {
  const headers = [...new Set(items.flatMap((item) => Object.keys(item)))].sort((a, b) => a.localeCompare(b))
  return [headers, ...items.map((item) => headers.map((h) => item[h] ?? ""))]
}
function kvMatrix(items: Array<[string, CellValue]>): Matrix {
  return [["Field", "Value"], ...items.map(([key, value]) => [key, value])]
}
function isTplusSuccess(row: ScannerRow): boolean {
  return row.engine === "TPLUS" && row.status === "SUCCESS" && Boolean(row.signal)
}
function orderedRows(rows: ScannerRow[]): ScannerRow[] {
  const success = rows.filter(isTplusSuccess).sort((a, b) => (b.signal?.score ?? -1) - (a.signal?.score ?? -1) || b.averageValue20 - a.averageValue20)
  const failed = rows.filter((row) => !isTplusSuccess(row)).sort((a, b) => a.symbol.localeCompare(b.symbol))
  return [...success, ...failed]
}
function rankedMatrix(rows: ScannerRow[]): Matrix {
  return objectMatrix(rows.map((row, index) => {
    const s = row.signal, d = row.executionDiagnostics, f = row.feature
    return {
      rank: isTplusSuccess(row) ? index + 1 : "",
      symbol: row.symbol, status: row.status, error: row.error ?? "", companyName: row.company?.name ?? "",
      exchange: row.company?.exchange ?? "", sectorGroup: row.company?.sector ?? "", industry: row.company?.industry ?? "",
      industryCode: row.company?.industryCode ?? "", dataDate: d?.asOfDate ?? f?.date ?? row.history?.at(-1)?.date ?? "",
      referenceClose: d?.referenceClose ?? f?.close ?? "", averageValue20_valueOrCloseTimesVolume: row.averageValue20,
      setup: s?.setup ?? "NONE", action: s?.action ?? "NO_SIGNAL", opportunityScore: s?.opportunityScore ?? "",
      tradeQuality: s?.tradeQuality ?? "", confidence: s?.confidence ?? "", marketRegime: s?.marketRegime ?? "",
      RS20_return_pct: f?.relativeStrength.rs20 ?? "", RS60_return_pct: f?.relativeStrength.rs60 ?? "", RS120_return_pct: f?.relativeStrength.rs120 ?? "",
      excessReturnVNINDEX20_pp: f?.relativeStrength.returnVsBenchmark20 ?? "", excessReturnVNINDEX60_pp: f?.relativeStrength.returnVsBenchmark60 ?? "",
      excessReturnVNINDEX120_pp: f?.relativeStrength.returnVsBenchmark120 ?? "", RVOL20: f?.volume.rvol20 ?? "", RVOL60: f?.volume.rvol60 ?? "",
      RSI14: f?.momentum.rsi14 ?? "", MFI14: f?.momentum.mfi14 ?? "", CMF20: f?.volume.cmf20 ?? "", VSA: f?.volume.vsa ?? "",
      structure: f?.priceStructure.state ?? "", EMA20: f?.trend.ema20 ?? "", EMA50: f?.trend.ema50 ?? "", EMA200: f?.trend.ema200 ?? "",
      ATR14: f?.trend.atr14 ?? "", ADX14: f?.trend.adx14 ?? "", closeAboveEMA50: f?.trend.aboveEma50 ?? "",
      closeAboveEMA200: f?.trend.aboveEma200 ?? "", high20: f?.priceStructure.high20 ?? "", high50: f?.priceStructure.high50 ?? "",
      high120: f?.priceStructure.high120 ?? "", volumePOC_approx: row.volumeProfile?.poc ?? "",
      volumeVAH_approx: row.volumeProfile?.vah ?? "", volumeVAL_approx: row.volumeProfile?.val ?? "",
      entryLow: s?.entryZone?.low ?? "", entryHigh: s?.entryZone?.high ?? "", triggerText: s?.trigger ?? "", triggerPrice: d?.triggerPrice ?? "", invalidation: row.setupCandidate?.invalidation ?? "",
      stopLoss: s?.stopLoss ?? "", TP1_strategy: s?.tp1 ?? "", TP2_strategy: s?.tp2 ?? "",
      RR_TP1_strategy: s?.riskReward ?? "", RR_TP2_strategy: s?.riskRewardTp2 ?? "",
      entryZoneStatus: d?.entryZoneStatus ?? "", distanceToEntryLowPct: d?.distanceToEntryLowPct ?? "",
      distanceToEntryMidPct: d?.distanceToEntryMidPct ?? "", distanceToEntryHighPct: d?.distanceToEntryHighPct ?? "",
      riskPctAtEntryLow: d?.riskPctAtEntryLow ?? "", riskPctAtEntryMid: d?.riskPctAtEntryMid ?? "", riskPctAtEntryHigh: d?.riskPctAtEntryHigh ?? "", riskPctAtReferenceClose: d?.riskPctAtReferenceClose ?? "", rrTp1AtReferenceClose: d?.rrTp1AtReferenceClose ?? "",
      rewardPctTP1AtEntryLow: d?.rewardPctTp1AtEntryLow ?? "", rewardPctTP1AtEntryMid: d?.rewardPctTp1AtEntryMid ?? "",
      rewardPctTP1AtEntryHigh: d?.rewardPctTp1AtEntryHigh ?? "", RR_TP1_atEntryLow: d?.rrTp1AtEntryLow ?? "",
      RR_TP1_atEntryMid: d?.rrTp1AtEntryMid ?? "", RR_TP1_atEntryHigh: d?.rrTp1AtEntryHigh ?? "",
      nearestResistance: d?.nearestResistance ?? "", resistanceSource: d?.nearestResistanceSource ?? "",
      structuralRAtEntryMid: d?.structuralRAtEntryMid ?? "", structuralTP1Alternative: d?.structuralTp1Alternative ?? "", TP1ExceedsNearestResistance: d?.tp1ExceedsNearestResistance ?? "",
      triggerStatus: d?.triggerStatus ?? "", mainBlockingReason: d?.mainBlockingReason ?? "",
      nextActionRequired: d?.nextActionRequired ?? "", weeklyBias: d?.weeklyBias ?? "", monthlyBias: d?.monthlyBias ?? "",
      higherTimeframeRisk: d?.higherTimeframeRisk ?? "", liquidityFlag: d?.liquidityFlag ?? "", liquidityBasis: d?.liquidityBasis ?? "",
      executionReadinessScore: d?.executionReadinessScore ?? "", executionReadinessLabel: d?.executionReadinessLabel ?? "",
      actionableNow_diagnosticOnly: d?.actionableNow ?? false, validPlan: d?.validPlan ?? false,
      reasons: s?.reasons.join(" | ") ?? "", risks: s?.risks.join(" | ") ?? "",
    }
  }))
}
function technicalMatrix(rows: ScannerRow[]): Matrix {
  return objectMatrix(rows.map((row) => ({
    symbol: row.symbol, status: row.status, ...flatten(row.feature ?? {}),
    averageValue20_valueOrCloseTimesVolume: row.averageValue20, featureWarnings: (row.detailWarnings ?? []).join(" | "),
  })))
}
function scoreMatrix(rows: ScannerRow[]): Matrix {
  return objectMatrix(rows.map((row) => ({
    symbol: row.symbol, status: row.status, strategyVersion: row.signal?.strategyVersion ?? TPLUS_STRATEGY_VERSION,
    totalScore: row.signal?.score ?? "", weights: JSON.stringify(DEFAULT_TPLUS_CONFIG.weights),
    weight_trendStructure: DEFAULT_TPLUS_CONFIG.weights.trendStructure,
    weight_relativeStrength: DEFAULT_TPLUS_CONFIG.weights.relativeStrength,
    weight_setupQuality: DEFAULT_TPLUS_CONFIG.weights.setupQuality,
    weight_volumeMoneyFlow: DEFAULT_TPLUS_CONFIG.weights.volumeMoneyFlow,
    weight_momentum: DEFAULT_TPLUS_CONFIG.weights.momentum,
    weight_marketRegime: DEFAULT_TPLUS_CONFIG.weights.marketRegime,
    weight_priceLocation: DEFAULT_TPLUS_CONFIG.weights.priceLocation,
    weight_liquidityRisk: DEFAULT_TPLUS_CONFIG.weights.liquidityRisk,
    ...flatten(row.signal?.scoreBreakdown ?? {}),
  })))
}
function planMatrix(rows: ScannerRow[]): Matrix {
  return objectMatrix(rows.map((row) => ({
    symbol: row.symbol, status: row.status,
    ...flatten({ signal: row.signal ?? null, candidate: row.setupCandidate ?? null, executionDiagnostics: row.executionDiagnostics ?? null }),
  })))
}
function rawBars(rows: ScannerRow[]): Flat[] {
  const result: Flat[] = []
  for (const row of rows) for (const bar of row.history ?? []) result.push({
    symbol: row.symbol, companyName: row.company?.name ?? "", exchange: row.company?.exchange ?? "",
    date: bar.date, open: bar.open, high: bar.high, low: bar.low, close: bar.close, volume: bar.volume,
    value_providerNative: bar.value ?? "",
  })
  return result
}
const CRC_TABLE = (() => {
  const table = new Uint32Array(256)
  for (let n = 0; n < 256; n += 1) {
    let value = n
    for (let k = 0; k < 8; k += 1) value = (value & 1) ? (value >>> 1) ^ 0xedb88320 : value >>> 1
    table[n] = value >>> 0
  }
  return table
})()
function crc32(bytes: Uint8Array): number {
  let crc = 0xffffffff
  for (const byte of bytes) crc = CRC_TABLE[(crc ^ byte) & 0xff] ^ (crc >>> 8)
  return (crc ^ 0xffffffff) >>> 0
}
function u16(view: DataView, offset: number, value: number) { view.setUint16(offset, value, true) }
function u32(view: DataView, offset: number, value: number) { view.setUint32(offset, value >>> 0, true) }
function zipStore(files: Array<{ name: string; data: Uint8Array }>): Uint8Array {
  const local: Uint8Array[] = [], central: Uint8Array[] = []
  let offset = 0, centralSize = 0
  for (const file of files) {
    const name = encoder.encode(file.name), data = file.data, crc = crc32(data)
    const header = new Uint8Array(30), h = new DataView(header.buffer)
    u32(h, 0, 0x04034b50); u16(h, 4, 20); u16(h, 6, 0x0800); u16(h, 8, 0)
    u16(h, 10, 0); u16(h, 12, 0x0021); u32(h, 14, crc); u32(h, 18, data.length); u32(h, 22, data.length)
    u16(h, 26, name.length); u16(h, 28, 0)
    local.push(header, name, data); offset += header.length + name.length + data.length
    const cdOffset = offset - header.length - name.length - data.length
    const cd = new Uint8Array(46), d = new DataView(cd.buffer)
    u32(d, 0, 0x02014b50); u16(d, 4, 20); u16(d, 6, 20); u16(d, 8, 0x0800); u16(d, 10, 0)
    u16(d, 12, 0); u16(d, 14, 0x0021); u32(d, 16, crc); u32(d, 20, data.length); u32(d, 24, data.length)
    u16(d, 28, name.length); u16(d, 30, 0); u16(d, 32, 0); u16(d, 34, 0); u16(d, 36, 0)
    u32(d, 38, 0); u32(d, 42, cdOffset)
    central.push(cd, name); centralSize += cd.length + name.length
  }
  if (offset > 0xffffffff || centralSize > 0xffffffff || files.length > 65535) throw new Error("XLSX_EXPORT_TOO_LARGE")
  const end = new Uint8Array(22), e = new DataView(end.buffer)
  u32(e, 0, 0x06054b50); u16(e, 4, 0); u16(e, 6, 0); u16(e, 8, files.length); u16(e, 10, files.length)
  u32(e, 12, centralSize); u32(e, 16, offset); u16(e, 20, 0)
  const out = new Uint8Array(offset + centralSize + end.length)
  let cursor = 0
  for (const chunk of [...local, ...central, end]) { out.set(chunk, cursor); cursor += chunk.length }
  return out
}
function makeXlsx(sheets: Array<{ name: string; matrix: Matrix }>): Uint8Array {
  const files: Array<{ name: string; data: Uint8Array }> = []
  const add = (name: string, text: string) => files.push({ name, data: encoder.encode(text) })
  const overrides = sheets.map((_, i) => '<Override PartName="/xl/worksheets/sheet' + (i + 1) + '.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/>').join("")
  add("[Content_Types].xml", '<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/><Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/>' + overrides + '</Types>')
  add("_rels/.rels", '<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="xl/workbook.xml"/></Relationships>')
  const sheetTags = sheets.map((s, i) => '<sheet name="' + xml(s.name) + '" sheetId="' + (i + 1) + '" r:id="rId' + (i + 1) + '"/>').join("")
  add("xl/workbook.xml", '<?xml version="1.0" encoding="UTF-8" standalone="yes"?><workbook xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"><bookViews><workbookView/></bookViews><sheets>' + sheetTags + '</sheets></workbook>')
  const rels = sheets.map((_, i) => '<Relationship Id="rId' + (i + 1) + '" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet' + (i + 1) + '.xml"/>').join("")
  add("xl/_rels/workbook.xml.rels", '<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">' + rels + '</Relationships>')
  sheets.forEach((s, i) => add("xl/worksheets/sheet" + (i + 1) + ".xml", sheetXml(s.matrix)))
  return zipStore(files)
}

export function buildTplusXlsx(result: ScannerRunResult): Uint8Array {
  const rows = orderedRows(result.rows ?? [])
  const bars = rawBars(rows)
  const maxRows = 1_048_574
  const historySheets: Array<{ name: string; matrix: Matrix }> = []
  for (let offset = 0, sheet = 1; offset < bars.length; offset += maxRows, sheet += 1) {
    historySheets.push({ name: sheet === 1 ? "OHLCV History" : "OHLCV History " + sheet, matrix: objectMatrix(bars.slice(offset, offset + maxRows)) })
  }
  if (!historySheets.length) historySheets.push({ name: "OHLCV History", matrix: objectMatrix([]) })
  const summary: Array<[string, CellValue]> = [
    ["Generated at", result.generatedAt], ["Data as-of (latest bar)", rows.map((row) => row.feature?.date ?? row.history?.at(-1)?.date ?? "").filter(Boolean).sort().at(-1) ?? ""], ["Provider", result.providerId], ["Data mode", result.dataMode],
    ["Universe source", result.universeSource], ["Requested symbols", result.requestedSymbols?.length ?? rows.length],
    ["Scan configuration", JSON.stringify(result.scanConfig ?? {})], ["Score weights", JSON.stringify(DEFAULT_TPLUS_CONFIG.weights)],
    ["Successful", rows.filter(isTplusSuccess).length], ["Failed", rows.filter((r) => r.status !== "SUCCESS").length],
    ["Actionable now (diagnostic only)", rows.filter((r) => r.executionDiagnostics?.actionableNow).length],
    ["Market regime", result.marketRegime?.regime ?? "N/A"], ["Strategy version", TPLUS_STRATEGY_VERSION],
    ["Export generation", "Prepared in browser Web Worker after scanning and cached in IndexedDB. Export click only downloads the existing Blob; no Vercel API or recalculation on click."],
    ["Strategy changes", "No score weights, original Action, Entry, SL or TP formula was changed by the diagnostics layer."],
  ]
  const methodology: Array<[string, CellValue]> = [
    ["Strategy version", TPLUS_STRATEGY_VERSION], ["Score weights", JSON.stringify(DEFAULT_TPLUS_CONFIG.weights)],
    ...Object.entries(DEFAULT_TPLUS_CONFIG.weights).map(([key, value]) => ["weight." + key, value] as [string, CellValue]),
    ["minScoreToWatch", DEFAULT_TPLUS_CONFIG.minScoreToWatch],
    ["minScoreToBuy", DEFAULT_TPLUS_CONFIG.minScoreToBuy],
    ["minRiskReward", DEFAULT_TPLUS_CONFIG.minRiskReward],
    ["preferredRiskReward", DEFAULT_TPLUS_CONFIG.preferredRiskReward],
    ["atrStopMultiplier", DEFAULT_TPLUS_CONFIG.atrStopMultiplier],
    ["maxEntryDistanceAtr", DEFAULT_TPLUS_CONFIG.maxEntryDistanceAtr],
    ["Score - Trend/Structure", "Start 35; +18 above EMA50; +18 above EMA200; +8 positive EMA50 slope; +8 ADX14>=25; +8 HH or HL; -10 LH or LL; clamp 0..100."],
    ["Score - Relative Strength", "Start 50 + clamp(RS20*1.5, -20, 25); if percentileVsUniverse exists, blend raw score 40% and percentile 60%. Current T+ scan does not pass universe percentiles, so raw RS20 is the active input."],
    ["Score - Setup Quality", "Selected candidate baseScore; if there is no candidate, score component is 20."],
    ["Score - Volume/Money Flow", "Start 45; +15 RVOL20>=1.2; +8 RVOL20>=1.5; +15 CMF20>0; +8 OBV slope>0; +8 VSA ABSORPTION/NO_SUPPLY; -12 VSA NO_DEMAND; clamp 0..100."],
    ["Score - Momentum", "Start 45; +15 MACD histogram>0; +10 ROC20>0; +15 RSI14 in 45..68; -10 RSI14>72; -5 RSI14<30; clamp 0..100."],
    ["Score - Market Regime", "BULL=90; BULL_PULLBACK=82; SIDEWAYS=55; DISTRIBUTION=42; BEAR=25; PANIC=10."],
    ["Score - Price Location", "Start 60; +15 rangePosition20<=0.25; -18 rangePosition20>=0.90; +5 if distanceFromHigh20 is between -8 and -1; clamp 0..100."],
    ["Score - Liquidity/Risk", "RVOL20<=0 => 20; RVOL20<0.6 => 35; RVOL20<0.9 => 45; otherwise 80."],
    ["Setup - BREAKOUT", "Close above max prior 20D/50D high; RVOL20>=1.25; above EMA50. Entry low=level*0.995; entry high=level+min(0.35*ATR14, 0.8% of close)."],
    ["Setup - PULLBACK", "Positive trend (above EMA50/EMA200 and EMA50 slope>=0); close near EMA20 within max(0.75*ATR14, 1.5% of price); RSI14 40..67; controlled 5-bar pullback no deeper than 1.8*ATR14."],
    ["Setup - MOMENTUM_CONTINUATION", "ROC20>=3; MACD histogram>0; ADX14>=20; above EMA50; distance from prior 10D high <3.5%. RVOL20>=1.2 adds score but is not a hard detection gate."],
    ["Setup - RSI_DIVERGENCE_REVERSAL", "Requires bullish RSI divergence; entry uses recent support/low20 with ATR offsets."],
    ["Setup - VSA_REVERSAL", "Requires VSA ABSORPTION or NO_SUPPLY and RSI14<=60."],
    ["Setup - MEAN_REVERSION", "Disallowed in BEAR/PANIC; RSI14<=30 or Stochastic K<=20 and rangePosition20<=0.15."],
    ["Candidate validation", "Invalid if Entry High<Entry Low or invalidation>=Entry High. Entry midpoint distance > maxEntryDistanceAtr creates a warning. BEAR/PANIC invalidates BREAKOUT/PULLBACK/MOMENTUM_CONTINUATION."],
    ["Trade Quality", "HIGH when TP1 R>=2 and score>=75; MEDIUM when TP1 R>=1.5 and score>=65; otherwise LOW or LOW when no candidate/risk plan."],
    ["Action", "NO_TRADE if no candidate/plan, invalid candidate, or TP1 R<1.2. BUY only if score>=minScoreToBuy, quality HIGH, TP1 R>=minRiskReward and regime is not BEAR/PANIC. WATCH if score>=minScoreToWatch; otherwise WAIT."],
    ["Market regime component weights", "Index trend 30%; breadth 25%; momentum 15%; volatility 15%; participation 15%."],
    ["Market regime breadth input", "This T+ scanner currently calls MarketRegimeEngine with VNINDEX OHLCV only; no stock-universe breadth or sector-strength snapshot is supplied. Missing breadth is scored neutral at 50, so this regime is index-derived rather than a full-market breadth regime."],
    ["Market regime PANIC gate", "One-day index return<=-4% with RVOL20>=1.8; alternatively close<EMA200, EMA50 slope<-0.8 and severe breadth (only when breadth data is supplied)."],
    ["Market regime BEAR gate", "Index close<EMA50<EMA200, EMA50 slope<0 and breadth score<42. With breadth absent, breadth score is neutral 50, so this exact BEAR gate does not trigger."],
    ["Market regime DISTRIBUTION gate", "Close>EMA200, breadth score<45, near high context (distanceFromHigh20>-3% or distanceFromHigh50>-5%) and trend score>=52."],
    ["Market regime BULL_PULLBACK gate", "Close>EMA200, close<EMA20, 20D return>0, breadth score>=45 and trend score>=55."],
    ["Market regime BULL gate", "Total regime score>=64, trend score>=60, breadth score>=55 and close>EMA200. Otherwise regime defaults to SIDEWAYS."],
    ["Confidence", "Composite heuristic from score, count of positive flags (EMA50/200, CMF+, MACD+, RS20+, candidate) and bull-regime agreement. LOW/MEDIUM/HIGH is not a calibrated win probability."],
    ["Diagnostics-only guardrails", "Separate from strategy score/action: RSI14>75; RS60>40%; RVOL20<0.8; midpoint stop risk>7%; close > Entry High by >3%; structural R<1.6; TP1 > nearest resistance. These flags do not change original score/action/TP/SL."],
    ["RS20/60/120", "Stock own-price returns over 20/60/120 trading bars, in percent."],
    ["Relative-strength score input", "Current scan uses RS20 for the score: 50 + clamp(RS20*1.5, -20, 25), unless a universe percentile is supplied. This scanner does not pass universe percentiles, so RS60/RS120 are diagnostics only and do not change the current score."],
    ["Excess return", "Stock return less aligned VNINDEX return over same lookback; percentage points."],
    ["TP1 model", "Existing TPLUS_MULTI_SETUP_v1 target is 1.75R in current implementation. The workbook separately reports nearest structural resistance; strategy targets are unchanged."],
    ["R metrics", "Risk/reward is separately reported at Entry Low, midpoint and High because risk changes across the entry zone."],
    ["Structural resistance", "Nearest prior 20D/50D/120D high or approximate OHLCV volume-profile VAH/POC/HVN above entry midpoint."],
    ["Volume Profile", "Approximate from daily OHLCV; not tick-level volume-at-price."],
    ["Weekly/monthly bias", "Lightweight proxy from aggregated closes versus EMA and slope; not canonical multi-timeframe parity."],
    ["Price/volume units", "Provider-native units are preserved. Verify price, volume and value conventions before cross-provider comparison."],
    ["averageValue20 calculation", "Mean of up to 20 bars: use each bar value when supplied; otherwise use close*volume. The diagnostics sheet records value-field coverage (0-20 of the latest 20 bars); units are not assumed to be VND."],
    ["Missing values", "Blank cells mean unavailable/not supplied/not derivable, not zero."],
    ["Confidence", "Model confidence label, not calibrated probability of profit."],
    ["Export ranking order", "All scanned rows are exported; successful rows are ordered by original Opportunity Score descending, then averageValue20 descending. Client-side table filters do not remove rows from the workbook."],
    ["Export scope", "Latest FeatureSnapshot fields used by the scan plus raw OHLCV history, score breakdown, original signal, diagnostics and scan failures. Full daily indicator arrays are omitted to bound generation time/file size."],
  ]
  const errors = rows.filter((r) => r.status !== "SUCCESS").map((r) => ({ symbol: r.symbol, engine: r.engine, status: r.status, error: r.error ?? "" }))
  const sheets = [
    { name: "Summary", matrix: kvMatrix(summary) },
    { name: "Tplus Ranked", matrix: rankedMatrix(rows) },
    { name: "Technical Snapshot", matrix: technicalMatrix(rows) },
    { name: "Score Breakdown", matrix: scoreMatrix(rows) },
    { name: "Trade Plan Diagnostics", matrix: planMatrix(rows) },
    { name: "Market Regime", matrix: objectMatrix([flatten({ generatedAt: result.generatedAt, providerId: result.providerId, dataMode: result.dataMode, regime: result.marketRegime ?? null })]) },
    { name: "Methodology", matrix: kvMatrix(methodology) },
    { name: "Requested Symbols", matrix: objectMatrix((result.requestedSymbols ?? rows.map((row) => row.symbol)).map((symbol, index) => {
      const row = rows.find((item) => item.symbol === symbol)
      return { order: index + 1, symbol, status: row?.status ?? "NOT_RETURNED", score: row?.signal?.score ?? "", action: row?.signal?.action ?? "", error: row?.error ?? "" }
    })) },
    ...historySheets,
    ...(errors.length ? [{ name: "Scan Errors", matrix: objectMatrix(errors) }] : []),
  ]
  return makeXlsx(sheets)
}
export function tplusXlsxFilename(result: ScannerRunResult): string {
  return "vn_quant_tplus_" + (result.generatedAt || new Date().toISOString()).replace(/[:.]/g, "-") + ".xlsx"
}
