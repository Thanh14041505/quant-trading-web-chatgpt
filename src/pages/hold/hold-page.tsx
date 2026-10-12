import { useMemo, useState } from "react"
import { RefreshCw, Search, SlidersHorizontal, XCircle } from "lucide-react"
import { Link } from "react-router-dom"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import { PageHeader } from "@/components/common/page-header"
import { useScanner } from "@/hooks/useScanner"
import { exportScannerExcel } from "@/quant/scanner/export-excel"
import { filterAndRankRows } from "@/quant/scanner"
import type { HoldScannerRow, ScannerConfig } from "@/quant/scanner"

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
const baseConfig: ScannerConfig = { engine: "HOLD", symbols: DEFAULT_UNIVERSE, concurrency: 4, universeSource: "CONFIGURED", universe: { minAverageValue20: 0 } }

function parseSymbols(value: string) { return [...new Set(value.split(/[,\s]+/).map((symbol) => symbol.trim().toUpperCase()).filter(Boolean))] }
function actionVariant(action: string) { return action === "BUY" || action === "HOLD" ? "success" as const : action === "WAIT" ? "muted" as const : "warning" as const }

export function HoldPage() {
  const [customMode, setCustomMode] = useState(false)
  const [symbolInput, setSymbolInput] = useState(DEFAULT_UNIVERSE.join(", "))
  const [search, setSearch] = useState("")
  const [minScore, setMinScore] = useState("0")
  const [action, setAction] = useState("ALL")
  const [exchange, setExchange] = useState("ALL")
  const [sector, setSector] = useState("ALL")
  const [minLiquidity, setMinLiquidity] = useState("5000000000")

  const config = useMemo<ScannerConfig>(() => ({ ...baseConfig, symbols: customMode ? parseSymbols(symbolInput) : DEFAULT_UNIVERSE, universeSource: customMode ? "CUSTOM" : "CONFIGURED" }), [customMode, symbolInput])
  const { result, progress, isLoading, error, run } = useScanner(config)

  const rows = useMemo(() => {
    if (!result) return [] as HoldScannerRow[]
    const filtered = filterAndRankRows(result.rows, { ...config, universe: { minAverageValue20: Number(minLiquidity) || 0, exchanges: exchange === "ALL" ? undefined : [exchange as "HOSE" | "HNX" | "UPCOM"], sectors: sector === "ALL" ? undefined : [sector] }, hold: { minScore: Number(minScore) || 0, actions: action === "ALL" ? undefined : [action as "BUY" | "HOLD" | "WATCH" | "WAIT" | "TRIM" | "NO_TRADE"] } }) as HoldScannerRow[]
    return filtered.filter((row) => !search || row.symbol.includes(search.toUpperCase()) || row.company.name.toUpperCase().includes(search.toUpperCase()))
  }, [action, config, exchange, minLiquidity, minScore, result, search, sector])

  return <div className="space-y-6">
    <PageHeader eyebrow="Longer horizon" title="Hold Scanner" description="3+ month quality, growth, valuation and long-term trend ranking over the configured symbol universe, with sector-aware fundamentals." actions={<div className="flex gap-2"><Button variant="outline" size="sm" onClick={() => { setSearch(""); setAction("ALL"); setSector("ALL") }}><XCircle className="size-3.5" /> Reset filters</Button>{result && <Button variant="outline" size="sm" onClick={() => exportScannerExcel(result)}><span className="text-xs">Export Excel</span></Button>}<Button size="sm" onClick={() => void run(true)} disabled={isLoading}><RefreshCw className={`size-3.5 ${isLoading ? "animate-spin" : ""}`} /> {isLoading ? "Scanning…" : "Scan again"}</Button></div>} />

    <Card><CardContent className="space-y-4 p-4">
      <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-6">
        <label className="space-y-1.5 text-xs"><span className="text-[var(--app-text-muted)]">Search</span><div className="relative"><Search className="absolute left-2.5 top-2.5 size-3.5 text-[var(--app-text-muted)]" /><Input className="pl-8" value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Symbol / company" /></div></label>
        <label className="space-y-1.5 text-xs"><span className="text-[var(--app-text-muted)]">Min score</span><Input type="number" value={minScore} onChange={(e) => setMinScore(e.target.value)} /></label>
        <label className="space-y-1.5 text-xs"><span className="text-[var(--app-text-muted)]">Action</span><select className="h-9 w-full rounded-md border border-[var(--app-border)] bg-[var(--app-panel)] px-3 text-sm" value={action} onChange={(e) => setAction(e.target.value)}><option>ALL</option><option>BUY</option><option>HOLD</option><option>WATCH</option><option>WAIT</option><option>TRIM</option><option>NO_TRADE</option></select></label>
        <label className="space-y-1.5 text-xs"><span className="text-[var(--app-text-muted)]">Exchange</span><select className="h-9 w-full rounded-md border border-[var(--app-border)] bg-[var(--app-panel)] px-3 text-sm" value={exchange} onChange={(e) => setExchange(e.target.value)}><option>ALL</option><option>HOSE</option><option>HNX</option><option>UPCOM</option></select></label>
        <label className="space-y-1.5 text-xs"><span className="text-[var(--app-text-muted)]">Min 20D Value</span><Input type="number" value={minLiquidity} onChange={(e) => setMinLiquidity(e.target.value)} /></label>
        <label className="space-y-1.5 text-xs"><span className="text-[var(--app-text-muted)]">Sector</span><select className="h-9 w-full rounded-md border border-[var(--app-border)] bg-[var(--app-panel)] px-3 text-sm" value={sector} onChange={(e) => setSector(e.target.value)}><option>ALL</option><option>Banks</option><option>Securities</option><option>Real Estate</option><option>Manufacturing</option><option>Technology</option><option>Shipping & Ports</option></select></label>
      </div>
      <div className="flex flex-wrap items-end gap-3 border-t border-[var(--app-border)] pt-4">
        <label className="flex items-center gap-2 text-xs"><input type="checkbox" checked={customMode} onChange={(e) => setCustomMode(e.target.checked)} /> Custom Symbol List</label>
        {customMode && <Input className="min-w-[280px] flex-1" value={symbolInput} onChange={(e) => setSymbolInput(e.target.value)} placeholder="VCB, TCB, FPT, HPG" />}
        <Button variant="outline" size="sm" onClick={() => void run(false)} disabled={isLoading || (customMode && !parseSymbols(symbolInput).length)}><SlidersHorizontal className="size-3.5" /> {result ? "Load cached / run" : "Run scanner"}</Button>
        {result && <div className="flex flex-wrap gap-2 text-xs"><Badge variant={result.dataMode === "LIVE" ? "success" : "warning"}>{result.dataMode}</Badge><Badge variant="muted">{result.rows.length} ranked</Badge><Badge variant="muted">{result.progress.failed} failed</Badge></div>}
      </div>
      {isLoading && progress && <div className="space-y-1.5"><div className="flex justify-between text-[11px] text-[var(--app-text-muted)]"><span>Scanning {progress.processed} / {progress.total}</span><span>{progress.success} success · {progress.failed} failed</span></div><div className="h-1.5 overflow-hidden rounded-full bg-slate-500/10"><div className="h-full bg-blue-500 transition-all" style={{ width: `${progress.total ? (progress.processed / progress.total) * 100 : 0}%` }} /></div></div>}
      {error && <div className="rounded-lg border border-red-500/20 bg-red-500/5 p-3 text-xs text-red-500">Scanner error: {error.message}</div>}
      {!result && !isLoading && <div className="rounded-lg border border-amber-500/20 bg-amber-500/5 p-3 text-[11px] leading-5 text-[var(--app-text-muted)]">Frontend-only V1 has no universal symbol-list endpoint. Configure a custom symbol list to scan beyond the default development universe.</div>}
      {!result && !isLoading && <div className="rounded-lg border border-dashed border-[var(--app-border)] p-8 text-center text-xs text-[var(--app-text-muted)]">Run the scanner to build a Hold ranking. Fundamental gaps are surfaced instead of being silently treated as zero.</div>}
    </CardContent></Card>

    {result && <Card><CardHeader className="flex-row items-center justify-between"><div><CardTitle>Ranked long-term opportunities</CardTitle><p className="mt-1 text-xs text-[var(--app-text-muted)]">Score, quality and data completeness remain separate outputs.</p></div><Badge variant="muted">{result.universeSource}</Badge></CardHeader><CardContent className="p-0"><div className="overflow-x-auto"><table className="min-w-[1350px] w-full text-left text-xs"><thead className="border-b border-[var(--app-border)] bg-[var(--app-panel-muted)] text-[10px] uppercase tracking-wide text-[var(--app-text-muted)]"><tr>{["Rank","Symbol","Sector","Industry","Score","Action","Quality","Confidence","Completeness","ROE","EPS Growth","Revenue Growth","PE","PB","Sector P/E","Sector P/B","Trend","Valuation","Catalysts","Risk"].map((h) => <th key={h} className="px-4 py-3">{h}</th>)}</tr></thead><tbody>{rows.map((row, index) => { const f = row.fundamentals; return <tr key={row.symbol} className="border-b border-[var(--app-border)] last:border-none hover:bg-slate-500/5"><td className="px-4 py-3 text-[var(--app-text-muted)]">{index + 1}</td><td className="px-4 py-3 font-semibold"><Link className="hover:text-blue-500" to={`/stock/${row.symbol}`}>{row.symbol}</Link></td><td className="px-4 py-3">{row.company.sector}</td><td className="px-4 py-3">{row.company.industry ?? "--"}</td><td className="px-4 py-3 font-semibold">{row.signal?.score ?? "--"}</td><td className="px-4 py-3"><Badge variant={actionVariant(row.signal?.action ?? "WAIT")}>{row.signal?.action}</Badge></td><td className="px-4 py-3">{row.signal?.quality ?? "--"}</td><td className="px-4 py-3">{row.signal?.confidence ?? "--"}</td><td className="px-4 py-3">{row.signal ? `${(row.signal.dataCompleteness * 100).toFixed(0)}%` : "--"}</td><td className="px-4 py-3">{f?.roe?.toFixed(1) ?? "--"}%</td><td className="px-4 py-3">{f?.epsGrowth?.toFixed(1) ?? "--"}%</td><td className="px-4 py-3">{f?.revenueGrowth?.toFixed(1) ?? "--"}%</td><td className="px-4 py-3">{f?.pe?.toFixed(1) ?? "--"}</td><td className="px-4 py-3">{f?.pb?.toFixed(1) ?? "--"}</td><td className="px-4 py-3">{f?.sectorMedianPe?.toFixed(1) ?? "--"}</td><td className="px-4 py-3">{f?.sectorMedianPb?.toFixed(1) ?? "--"}</td><td className="px-4 py-3">{row.signal?.longTermTrend}</td><td className="px-4 py-3">{row.signal?.valuationLabel}</td><td className="px-4 py-3 max-w-[180px] truncate">{row.signal?.catalysts?.join(" · ") || "--"}</td><td className="px-4 py-3 max-w-[180px] truncate">{row.signal?.risks?.join(" · ") || "--"}</td></tr> })}</tbody></table></div>{!rows.length && <div className="p-8 text-center text-xs text-[var(--app-text-muted)]">No Hold rows match the current filters.</div>}</CardContent></Card>}
  </div>
}
