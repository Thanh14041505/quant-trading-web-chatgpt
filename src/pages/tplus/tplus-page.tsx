import { useMemo, useState } from "react"
import { Filter, RefreshCw, Search, XCircle } from "lucide-react"
import { Link } from "react-router-dom"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import { PageHeader } from "@/components/common/page-header"
import { useScanner } from "@/hooks/useScanner"
import { filterAndRankRows } from "@/quant/scanner"
import type { ScannerConfig, TplusScannerRow } from "@/quant/scanner"
import type { TplusAction } from "@/quant/tplus"

const DEFAULT_UNIVERSE = ['FPT', 'VCB', 'HPG', 'TCB', 'ACB', 'BID', 'MWG', 'SSI', 'VND', 'CTD', 'VHM', 'VIC', 'VRE', 'PNJ', 'MSN',
                   'GAS', 'PLX', 'SAB', 'STB', 'SHB', 'LPB', 'VPB', 'MBB', 'HDB', 'TPB', 'OCB', 'SSB', 'VIB', 'CTG', 'POW',
                   'GVR', 'DGC', 'DPM', 'BSR', 'PVD', 'PVT', 'VCG', 'VSC', 'HSG', 'NKG', 'BCM', 'KDH', 'DXG', 'NLG', 'TCH',
                   'DIG', 'PDR', 'KBC', 'CRE', 'VPI', 'HDG', 'AGG', 'HT1', 'AAA', 'DBC', 'NVL', 'VHC', 'MSH', 'CII', 'VGI',
                   'ANV', 'SMC', 'HAG', 'DLG', 'BFC', 'PTB', 'TLH', 'PHR', 'DCM', 'LAS', 'VIX', 'MSR', 'GEL', 'HUT', 'GEG',
                   'GEX', 'FTS', 'HCM', 'CTS', 'MBS', 'VCI', 'ORS', 'BSI', 'BAF', 'BMP', 'BVH', 'BWE', 'CMG', 'CTR', 'DGW',
                   'DSE', 'DXS', 'EIB', 'EVF', 'FRT', 'GEE', 'GMD', 'HDC', 'HHV', 'IMP', 'KDC', 'KOS', 'MSB', 'NAB', 'NT2',
                   'PAN', 'PC1', 'REE', 'SBT', 'SCS', 'SIP', 'SJS', 'SZC', 'VGC', 'VJC', 'VNM', 'VPL', 'CEO', 'SHS', 'PVS',
                   'MST', 'VC3', 'IDC', 'VTZ', 'VFS', 'PVC', 'C69', 'TNG', 'VGS', 'KSF', 'PVB', 'BVS', 'CTP', 'FID', 'VTV',
                   'PLC', 'OCH', 'PVI', 'NTP', 'IPA', 'DXP', 'VIW', 'TVN', 'OIL', 'ACV', 'HNG', 'BVB', 'FOX', 'DRI', 'DDV',
                   'AAS', 'VEA', 'TV1', 'ABB', 'VGT', 'QTP', 'MZG', 'PHP', 'SBS', 'STH', 'F88', 'HNM', 'FOC', 'DSH', 'BMS',
                   'QNS', 'TOS', 'XMC', 'BNA', 'VC7', 'VC2', 'DTD', 'UNI', 'NBC', 'NAG', 'CAP', 'PSI', 'VGP', 'PPT', 'PCH',
                   'NVB', 'L40', 'APS', 'VHE', 'API', 'PVG', 'IDJ', 'LDP', 'CMS', 'DST', 'AAV', 'AMS', 'BIG', 'VTD', 'G36',
                   'DSH', 'DDB', 'CLI', 'PIV', 'CLX', 'TTG', 'DVN', 'PXL', 'MPC', 'ABW', 'PGB', 'VBB', 'NCG', 'ALC', 'KCB',
                   'GCF', 'KLB', 'VAB', 'C32', 'CIG', 'HSL', 'RYG', 'VTO', 'HII', 'TCM', 'PPC', 'ELC', 'TCI', 'SHI', 'DAH',
                   'LDG', 'HQC', 'HHP', 'SCR', 'LCG', 'QCG', 'TTH', 'NRC', 'TVC', 'TIG', 'SVN', 'DL1', 'KIP', 'CTX', 'APF',
                   'SBB', 'VNP', 'HVN', 'TLG', 'PET', 'VOS', 'KSB']

const baseConfig: ScannerConfig = {
  engine: "TPLUS",
  symbols: DEFAULT_UNIVERSE,
  concurrency: 4,
  universeSource: "CONFIGURED",
  universe: { minAverageValue20: 0 },
}

function parseSymbols(value: string) {
  return [...new Set(value.split(/[,\s]+/).map((symbol) => symbol.trim().toUpperCase()).filter(Boolean))]
}

function actionVariant(action: string) {
  if (action === "BUY") return "success" as const
  if (action === "NO_TRADE") return "muted" as const
  return "warning" as const
}

function formatPrice(value?: number) {
  return value == null || !Number.isFinite(value) ? "--" : value.toFixed(2)
}

export function TplusPage() {
  const [customMode, setCustomMode] = useState(false)
  const [symbolInput, setSymbolInput] = useState(DEFAULT_UNIVERSE.join(", "))
  const [search, setSearch] = useState("")
  const [minScore, setMinScore] = useState("0")
  const [setup, setSetup] = useState("ALL")
  const [action, setAction] = useState("ALL")
  const [exchange, setExchange] = useState("ALL")
  const [sector, setSector] = useState("ALL")
  const [minLiquidity, setMinLiquidity] = useState("5000000")

  const config = useMemo<ScannerConfig>(() => ({
    ...baseConfig,
    symbols: customMode ? parseSymbols(symbolInput) : DEFAULT_UNIVERSE,
    universeSource: customMode ? "CUSTOM" : "CONFIGURED",
  }), [customMode, symbolInput])

  const { result, progress, isLoading, error, run, excelReady, isPreparingExcel, excelError, downloadExcel } = useScanner(config)

  const rows = useMemo(() => {
    if (!result) return [] as TplusScannerRow[]
    const filtered = filterAndRankRows(result.rows, {
      ...config,
      universe: {
        minAverageValue20: Number(minLiquidity) || 0,
        exchanges: exchange === "ALL" ? undefined : [exchange as "HOSE" | "HNX" | "UPCOM"],
        sectors: sector === "ALL" ? undefined : [sector],
      },
      tplus: {
        minScore: Number(minScore) || 0,
        actions: action === "ALL" ? undefined : [action as TplusAction],
      },
    }) as TplusScannerRow[]
    return filtered.filter((row) => {
      if (search && !row.symbol.includes(search.toUpperCase()) && !row.company.name.toUpperCase().includes(search.toUpperCase())) return false
      if (setup !== "ALL" && row.signal?.setup !== setup) return false
      if (action !== "ALL" && row.signal?.action !== action) return false
      return true
    })
  }, [action, config, exchange, minLiquidity, minScore, result, search, sector, setup])

  return <div className="space-y-6">
    <PageHeader
      eyebrow="Short-term engine"
      title="T+ Scanner"
      description="3–15 session setup detection, ranking and risk planning over the configured symbol universe. Scanner results are cached client-side."
      actions={<div className="flex gap-2"><Button variant="outline" size="sm" onClick={() => { setSearch(""); setSetup("ALL"); setAction("ALL"); setExchange("ALL"); setSector("ALL"); setMinScore("0"); setMinLiquidity("5000000") }}><XCircle className="size-3.5" /> Reset filters</Button>{result && <Button variant="outline" size="sm" onClick={() => downloadExcel()} disabled={!excelReady || isPreparingExcel}><span className="text-xs">{isPreparingExcel ? "Preparing XLSX…" : excelReady ? "Export XLSX" : "XLSX unavailable"}</span></Button>}<Button size="sm" onClick={() => void run(true)} disabled={isLoading}><RefreshCw className={`size-3.5 ${isLoading ? "animate-spin" : ""}`} /> {isLoading ? "Scanning…" : "Scan again"}</Button></div>}
    />

    <Card>
      <CardContent className="space-y-4 p-4">
        <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-7">
          <label className="space-y-1.5 text-xs"><span className="text-[var(--app-text-muted)]">Search</span><div className="relative"><Search className="absolute left-2.5 top-2.5 size-3.5 text-[var(--app-text-muted)]" /><Input className="pl-8" value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Symbol / company" /></div></label>
          <label className="space-y-1.5 text-xs"><span className="text-[var(--app-text-muted)]">Min score</span><Input type="number" value={minScore} onChange={(e) => setMinScore(e.target.value)} /></label>
          <label className="space-y-1.5 text-xs"><span className="text-[var(--app-text-muted)]">Setup</span><select className="h-9 w-full rounded-md border border-[var(--app-border)] bg-[var(--app-panel)] px-3 text-sm" value={setup} onChange={(e) => setSetup(e.target.value)}><option>ALL</option><option>BREAKOUT</option><option>PULLBACK</option><option>MOMENTUM_CONTINUATION</option><option>RSI_DIVERGENCE_REVERSAL</option><option>VSA_REVERSAL</option><option>MEAN_REVERSION</option></select></label>
          <label className="space-y-1.5 text-xs"><span className="text-[var(--app-text-muted)]">Action</span><select className="h-9 w-full rounded-md border border-[var(--app-border)] bg-[var(--app-panel)] px-3 text-sm" value={action} onChange={(e) => setAction(e.target.value)}><option>ALL</option><option>BUY</option><option>WATCH</option><option>WAIT</option><option>NO_TRADE</option></select></label>
          <label className="space-y-1.5 text-xs"><span className="text-[var(--app-text-muted)]">Exchange</span><select className="h-9 w-full rounded-md border border-[var(--app-border)] bg-[var(--app-panel)] px-3 text-sm" value={exchange} onChange={(e) => setExchange(e.target.value)}><option>ALL</option><option>HOSE</option><option>HNX</option><option>UPCOM</option></select></label>
          <label className="space-y-1.5 text-xs"><span className="text-[var(--app-text-muted)]">Sector</span><select className="h-9 w-full rounded-md border border-[var(--app-border)] bg-[var(--app-panel)] px-3 text-sm" value={sector} onChange={(e) => setSector(e.target.value)}><option>ALL</option>{[...new Set((result?.rows ?? []).map((row) => row.company.sector).filter(Boolean))].sort().map((sectorName) => <option key={sectorName} value={sectorName}>{sectorName}</option>)}</select></label>
          <label className="space-y-1.5 text-xs"><span className="text-[var(--app-text-muted)]">Min 20D Value (native)</span><Input type="number" value={minLiquidity} onChange={(e) => setMinLiquidity(e.target.value)} /></label>
        </div>
        <div className="flex flex-wrap items-end gap-3 border-t border-[var(--app-border)] pt-4">
          <label className="flex items-center gap-2 text-xs"><input type="checkbox" checked={customMode} onChange={(e) => setCustomMode(e.target.checked)} /> Custom Symbol List</label>
          {customMode && <Input className="min-w-[280px] flex-1" value={symbolInput} onChange={(e) => setSymbolInput(e.target.value)} placeholder="HAH, GMD, DXP, PHP" />}
          <Button variant="outline" size="sm" onClick={() => void run(false)} disabled={isLoading || (customMode && !parseSymbols(symbolInput).length)}><Filter className="size-3.5" /> {result ? "Load cached / run" : "Run scanner"}</Button>
          {result && <div className="flex flex-wrap gap-2 text-xs"><Badge variant={result.dataMode === "LIVE" ? "success" : "warning"}>{result.dataMode}</Badge><Badge variant="muted">Regime {result.marketRegime?.regime ?? "--"}</Badge><Badge variant="muted">{result.rows.length} scanned</Badge><Badge variant="muted">{result.progress.failed} failed</Badge><Badge variant={result.rows.some((row) => row.executionDiagnostics?.actionableNow) ? "success" : "warning"}>{result.rows.filter((row) => row.executionDiagnostics?.actionableNow).length} actionable*</Badge></div>}
        </div>
        {isLoading && progress && <div className="space-y-1.5"><div className="flex justify-between text-[11px] text-[var(--app-text-muted)]"><span>Scanning {progress.processed} / {progress.total}</span><span>{progress.success} success · {progress.failed} failed</span></div><div className="h-1.5 overflow-hidden rounded-full bg-slate-500/10"><div className="h-full bg-blue-500 transition-all" style={{ width: `${progress.total ? (progress.processed / progress.total) * 100 : 0}%` }} /></div></div>}
        {error && <div className="rounded-lg border border-red-500/20 bg-red-500/5 p-3 text-xs text-red-500">Scanner error: {error.message}</div>}
        {!result && !isLoading && <div className="rounded-lg border border-amber-500/20 bg-amber-500/5 p-3 text-[11px] leading-5 text-[var(--app-text-muted)]">Frontend-only V1 has no universal symbol-list endpoint. Configure a custom symbol list to scan beyond the default development universe.</div>}
        {!result && !isLoading && <div className="rounded-lg border border-dashed border-[var(--app-border)] p-8 text-center text-xs text-[var(--app-text-muted)]">Run the scanner to build a fresh T+ ranking over the configured universe. Cached results are used when available.</div>}
      </CardContent>
    </Card>

    {result && <Card><CardHeader className="flex-row items-center justify-between"><div><CardTitle>Ranked opportunities</CardTitle><p className="mt-1 text-xs text-[var(--app-text-muted)]">Ranked by Opportunity Score, then liquidity. Filters and sorting run client-side.</p></div><Badge variant="muted">{result.universeSource}</Badge></CardHeader><CardContent className="p-0"><div className="mb-3 space-y-1 text-[10px] leading-4 text-[var(--app-text-muted)]"><p>RS20/60/120 and excess return are percentages; RVOL is a multiple. Close/Entry/SL/TP use provider-native price units. Strategy R:R remains the original strategy output; structural R and readiness are separate diagnostics. “Actionable*” and Readiness are audit-only diagnostics, not a replacement for the original Action or a promise of profit. TP1 in the current strategy is 1.75R; the nearest structural resistance is shown separately.</p>{isPreparingExcel && <p>Preparing the AI-ready XLSX in a browser Web Worker. It will be cached locally so future exports only download the prebuilt file.</p>}{excelError && <p className="text-amber-600">XLSX preparation failed: {excelError}. Try Scan again to rebuild the workbook.</p>}</div><div className="overflow-x-auto"><table className="min-w-[2850px] w-full text-left text-xs"><thead className="border-b border-[var(--app-border)] bg-[var(--app-panel-muted)] text-[10px] uppercase tracking-wide text-[var(--app-text-muted)]"><tr>{["Rank","Symbol","As of","Close","Setup","Action","Score","Quality","Confidence","Readiness","RS20 %","RS60 %","RS120 %","Excess RS20 pp","RVOL20 x","Avg Value 20D (native)","Value coverage / 20","Liquidity basis","RSI14","Daily Trend (EMA50)","Structure","Entry Zone","Zone Status","Distance Mid %","Risk Mid %","SL","TP1","TP2","Strategy R:R","Resistance","Structural R","Trigger Price","TP1 > Res?","Trigger Status","Blocking Reason","Weekly","Monthly","HTF Risk","Regime"].map((h) => <th key={h} className="px-3 py-3">{h}</th>)}</tr></thead><tbody>{rows.map((row, index) => { const d = row.executionDiagnostics; return <tr key={row.symbol} className="border-b border-[var(--app-border)] last:border-none hover:bg-slate-500/5"><td className="px-3 py-3 text-[var(--app-text-muted)]">{index + 1}</td><td className="px-3 py-3 font-semibold"><Link className="hover:text-blue-500" to={"/stock/" + row.symbol}>{row.symbol}</Link></td><td className="px-3 py-3">{d?.asOfDate ?? row.feature?.date ?? "--"}</td><td className="px-3 py-3">{formatPrice(d?.referenceClose ?? row.feature?.close)}</td><td className="px-3 py-3">{row.signal?.setup}</td><td className="px-3 py-3"><Badge variant={actionVariant(row.signal?.action ?? "WAIT")}>{row.signal?.action}</Badge>{d?.actionableNow && <div className="mt-1"><Badge variant="success">Ready*</Badge></div>}</td><td className="px-3 py-3 font-semibold">{row.signal?.score ?? "--"}</td><td className="px-3 py-3">{row.signal?.tradeQuality ?? "--"}</td><td className="px-3 py-3">{row.signal?.confidence ?? "--"}</td><td className="px-3 py-3">{d ? d.executionReadinessLabel + " · " + d.executionReadinessScore : "--"}</td><td className="px-3 py-3">{row.feature ? row.feature.relativeStrength.rs20.toFixed(2) + "%" : "--"}</td><td className="px-3 py-3">{row.feature ? row.feature.relativeStrength.rs60.toFixed(2) + "%" : "--"}</td><td className="px-3 py-3">{row.feature ? row.feature.relativeStrength.rs120.toFixed(2) + "%" : "--"}</td><td className="px-3 py-3">{row.feature?.relativeStrength.returnVsBenchmark20 != null ? row.feature.relativeStrength.returnVsBenchmark20.toFixed(2) + " pp" : "--"}</td><td className="px-3 py-3">{row.feature ? row.feature.volume.rvol20.toFixed(2) + "x" : "--"}</td><td className="px-3 py-3">{Number.isFinite(row.averageValue20) ? row.averageValue20.toLocaleString("en-US", { maximumFractionDigits: 0 }) : "--"}</td><td className="px-3 py-3">{d ? d.valueFieldCoverage20Count + "/20" : "--"}</td><td className="px-3 py-3 max-w-[240px] whitespace-normal">{d?.liquidityFlag ?? "--"}</td><td className="px-3 py-3">{row.feature?.momentum.rsi14.toFixed(1) ?? "--"}</td><td className="px-3 py-3">{row.feature ? (row.feature.trend.aboveEma50 ? "ABOVE_EMA50" : "BELOW_EMA50") : "--"}</td><td className="px-3 py-3">{row.feature?.priceStructure.state ?? "--"}{d?.trendStructureConflict && <div className="mt-1"><Badge variant="warning">Conflict</Badge></div>}</td><td className="px-3 py-3">{formatPrice(row.signal?.entryZone?.low)}–{formatPrice(row.signal?.entryZone?.high)}</td><td className="px-3 py-3">{d?.entryZoneStatus ?? "--"}</td><td className="px-3 py-3">{d?.distanceToEntryMidPct != null ? d.distanceToEntryMidPct.toFixed(2) + "%" : "--"}</td><td className="px-3 py-3">{d?.riskPctAtEntryMid != null ? d.riskPctAtEntryMid.toFixed(2) + "%" : "--"}</td><td className="px-3 py-3">{formatPrice(row.signal?.stopLoss)}</td><td className="px-3 py-3">{formatPrice(row.signal?.tp1)}</td><td className="px-3 py-3">{formatPrice(row.signal?.tp2)}</td><td className="px-3 py-3 font-semibold">{row.signal?.riskReward?.toFixed(2) ?? "--"}</td><td className="px-3 py-3">{formatPrice(d?.nearestResistance)}</td><td className="px-3 py-3">{d?.structuralRAtEntryMid?.toFixed(2) ?? "--"}</td><td className="px-3 py-3">{formatPrice(d?.triggerPrice)}</td><td className="px-3 py-3">{d?.tp1ExceedsNearestResistance == null ? "--" : d.tp1ExceedsNearestResistance ? "YES" : "NO"}</td><td className="px-3 py-3">{d?.triggerStatus ?? "--"}</td><td className="px-3 py-3 max-w-[230px] whitespace-normal">{d?.mainBlockingReason ?? "--"}</td><td className="px-3 py-3">{d?.weeklyBias ?? "--"}</td><td className="px-3 py-3">{d?.monthlyBias ?? "--"}</td><td className="px-3 py-3">{d?.higherTimeframeRisk ?? "--"}</td><td className="px-3 py-3">{row.signal?.marketRegime ?? "--"}</td></tr>})}</tbody></table></div>{!rows.length && <div className="p-8 text-center text-xs text-[var(--app-text-muted)]">No T+ rows match the current filters.</div>}</CardContent></Card>}
  </div>
}
