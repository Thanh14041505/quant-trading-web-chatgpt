import { describe, expect, it } from "vitest"
import type { ScannerRunResult } from "@/quant/scanner"
import { buildTplusXlsx } from "@/quant/scanner/tplus-xlsx"

function sampleResult(): ScannerRunResult {
  return {
    schemaVersion: 3,
    engine: "TPLUS",
    providerId: "http-json",
    generatedAt: "2026-10-24T15:00:00.000Z",
    rows: [{
      engine: "TPLUS",
      symbol: "TEST",
      company: { symbol: "TEST", name: "Test Company", exchange: "HOSE", sector: "Technology" },
      averageValue20: 6_000_000_000,
      status: "FAILED",
      error: "fixture row to validate failed-symbol export",
      history: [{ symbol: "TEST", date: "2026-10-23", open: 10, high: 11, low: 9, close: 10.5, volume: 1000, value: 10500 }],
    }],
    requestedSymbols: ["TEST"],
    scanConfig: { engine: "TPLUS", symbols: ["TEST"] },
    errors: [{ symbol: "TEST", code: "DATA_ERROR", message: "fixture failure" }],
    progress: { total: 1, processed: 1, success: 0, failed: 1, cached: 0, fresh: 0 },
    dataMode: "LIVE",
    universeSource: "CONFIGURED",
  }
}

describe("T+ XLSX export", () => {
  it("creates a valid ZIP-based Office Open XML workbook", () => {
    const bytes = buildTplusXlsx(sampleResult())
    expect(bytes.byteLength).toBeGreaterThan(500)
    expect(bytes[0]).toBe(0x50)
    expect(bytes[1]).toBe(0x4b)
    expect(bytes[2]).toBe(0x03)
    expect(bytes[3]).toBe(0x04)

    // ZIP entries use the store method, so their names and XML are searchable
    // in the archive bytes; this also guards key worksheet names and metadata.
    const archiveText = new TextDecoder().decode(bytes)
    expect(archiveText).toContain("[Content_Types].xml")
    expect(archiveText).toContain("xl/workbook.xml")
    expect(archiveText).toContain("Tplus Ranked")
    expect(archiveText).toContain("Technical Snapshot")
    expect(archiveText).toContain("Score Breakdown")
    expect(archiveText).toContain("Trade Plan Diagnostics")
    expect(archiveText).toContain("OHLCV History")
    expect(archiveText).toContain("Methodology")
    expect(archiveText).toContain("Requested Symbols")
    expect(archiveText).toContain("Scan configuration")
    expect(archiveText).toContain("minScoreToBuy")
    expect(archiveText).toContain("TP1 model")
    expect(archiveText).toContain("TEST")
  })
})
