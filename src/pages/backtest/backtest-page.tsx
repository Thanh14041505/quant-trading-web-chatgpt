import { useEffect, useMemo, useRef, useState } from "react"
import { AlertTriangle, Download, FlaskConical, LoaderCircle, Play, ShieldCheck, Square, Trash2 } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import { Badge } from "@/components/ui/badge"
import { PageHeader } from "@/components/common/page-header"
import { getMarketDataProvider, getSelectedProviderId } from "@/data/providers/provider-registry"
import { clientCache } from "@/data/cache/client-cache"
import { DEFAULT_CACHE_POLICIES } from "@/models/cache"
import { DEFAULT_BACKTEST_CONFIG } from "@/quant/backtest/backtest-engine"
import type { BacktestConfig, BacktestInput, BacktestProgress, BacktestResult, BacktestStrategy, BacktestWorkerResponse } from "@/quant/backtest"

const LAST_RESULT_KEY_PARTS = { symbol: "LATEST", timeframe: "EVENT", extra: "phase10" }
const formatVnd = (value: number | null | undefined) => value == null || !Number.isFinite(value) ? "—" : new Intl.NumberFormat("vi-VN", { style: "currency", currency: "VND", maximumFractionDigits: 0 }).format(value)
const formatNumber = (value: number | null | undefined, digits = 2) => value == null || !Number.isFinite(value) ? "—" : value.toLocaleString("en-US", { maximumFractionDigits: digits, minimumFractionDigits: digits })
const formatPct = (value: number | null | undefined) => value == null || !Number.isFinite(value) ? "—" : `${value >= 0 ? "+" : ""}${value.toFixed(2)}%`
const LAST_RESULT_CACHE_KEY = clientCache.buildKey({ providerId: "local-backtest", kind: "backtestResults", ...LAST_RESULT_KEY_PARTS })

async function forEachConcurrent<T>(
  items: T[],
  concurrency: number,
  task: (item: T, index: number) => Promise<void>,
  shouldStop: () => boolean,
) {
  let nextIndex = 0
  const workerCount = Math.min(items.length, Math.max(1, Math.floor(concurrency)))
  await Promise.all(Array.from({ length: workerCount }, async () => {
    while (!shouldStop()) {
      const index = nextIndex++
      if (index >= items.length) return
      await task(items[index], index)
    }
  }))
}

function mergeSymbolErrors(
  existing: Array<{ symbol: string; message: string }>,
  incoming: Array<{ symbol: string; message: string }>,
) {
  const incomingBySymbol = new Map(incoming.map((error) => [error.symbol.toUpperCase(), error]))
  const merged = existing.map((error) => {
    const providerError = incomingBySymbol.get(error.symbol.toUpperCase())
    return providerError ? { symbol: error.symbol, message: providerError.message } : error
  })
  const seenSymbols = new Set(merged.map((error) => error.symbol.toUpperCase()))
  for (const error of incoming) {
    const key = error.symbol.toUpperCase()
    if (!seenSymbols.has(key)) {
      merged.push(error)
      seenSymbols.add(key)
    }
  }
  return merged
}

type MetricCard = { label: string; value: string; hint?: string }

function numberInput(value: number, onChange: (value: number) => void, min = 0, step: number | "any" = "any") {
  return <Input type="number" value={Number.isFinite(value) ? value : ""} min={min} step={step} onChange={(event) => onChange(Number(event.target.value))} />
}

function LineChart({ points, mode = "equity" }: { points: Array<{ date: string; equity: number; drawdownPct: number }>; mode?: "equity" | "drawdown" }) {
  const width = 900
  const height = 250
  const padding = 18
  const values = points.map((point) => mode === "equity" ? point.equity : point.drawdownPct)
  if (!values.length) return <div className="flex h-56 items-center justify-center text-sm text-[var(--app-text-muted)]">No curve data</div>
  const min = mode === "equity" ? Math.min(...values, ...[values[0] * 0.98]) : Math.min(...values, -1)
  const max = mode === "equity" ? Math.max(...values, ...[values[0] * 1.02]) : 0
  const span = Math.max(1e-9, max - min)
  const path = values.map((value, index) => {
    const x = padding + (index / Math.max(1, values.length - 1)) * (width - padding * 2)
    const y = padding + ((max - value) / span) * (height - padding * 2)
    return `${index === 0 ? "M" : "L"}${x.toFixed(2)},${y.toFixed(2)}`
  }).join(" ")
  const label = (date: string) => date.slice(0, 7)
  return <div className="w-full">
    <svg viewBox={`0 0 ${width} ${height}`} role="img" aria-label={mode === "equity" ? "Equity curve" : "Drawdown curve"} className="h-56 w-full overflow-visible">
      {[0, 1, 2, 3].map((tick) => <line key={tick} x1={padding} x2={width - padding} y1={padding + tick * (height - padding * 2) / 3} y2={padding + tick * (height - padding * 2) / 3} stroke="currentColor" strokeOpacity="0.10" strokeDasharray="4 4" />)}
      <path d={path} fill="none" stroke={mode === "equity" ? "#3b82f6" : "#f97316"} strokeWidth="2.5" strokeLinejoin="round" strokeLinecap="round" />
    </svg>
    <div className="flex justify-between text-[10px] text-[var(--app-text-muted)]"><span>{label(points[0].date)}</span><span>{label(points[Math.floor(points.length / 2)].date)}</span><span>{label(points[points.length - 1].date)}</span></div>
  </div>
}

function MaeMfeChart({ trades }: { trades: BacktestResult["trades"] }) {
  const width = 900
  const height = 250
  const padding = 28
  if (!trades.length) return <div className="flex h-56 items-center justify-center text-sm text-[var(--app-text-muted)]">No completed trades to plot</div>
  const xValues = trades.map((trade) => trade.mfePct)
  const yValues = trades.map((trade) => trade.maePct)
  const minX = Math.min(-1, ...xValues)
  const maxX = Math.max(1, ...xValues)
  const minY = Math.min(-1, ...yValues)
  const maxY = Math.max(0, ...yValues)
  const xSpan = Math.max(1e-9, maxX - minX)
  const ySpan = Math.max(1e-9, maxY - minY)
  const x = (value: number) => padding + (value - minX) / xSpan * (width - padding * 2)
  const y = (value: number) => height - padding - (value - minY) / ySpan * (height - padding * 2)
  return <div className="w-full">
    <svg viewBox={`0 0 ${width} ${height}`} role="img" aria-label="Maximum adverse excursion versus maximum favorable excursion by trade" className="h-56 w-full">
      {[0, 1, 2, 3].map((tick) => <g key={tick}><line x1={padding} x2={width - padding} y1={padding + tick * (height - padding * 2) / 3} y2={padding + tick * (height - padding * 2) / 3} stroke="currentColor" strokeOpacity="0.10" strokeDasharray="4 4" /><line x1={padding + tick * (width - padding * 2) / 3} x2={padding + tick * (width - padding * 2) / 3} y1={padding} y2={height - padding} stroke="currentColor" strokeOpacity="0.08" strokeDasharray="4 4" /></g>)}
      {trades.map((trade) => <circle key={trade.id} cx={x(trade.mfePct)} cy={y(trade.maePct)} r="4" fill={trade.pnlVnd >= 0 ? "#10b981" : "#f43f5e"} fillOpacity="0.78"><title>{`${trade.symbol} · MFE ${trade.mfePct.toFixed(2)}% · MAE ${trade.maePct.toFixed(2)}% · P/L ${trade.pnlVnd.toFixed(0)} VND`}</title></circle>)}
      <text x={width / 2} y={height - 4} textAnchor="middle" fill="currentColor" opacity="0.7" fontSize="11">MFE % (maximum favorable excursion)</text>
      <text x="10" y={height / 2} textAnchor="middle" transform={`rotate(-90 10 ${height / 2})`} fill="currentColor" opacity="0.7" fontSize="11">MAE %</text>
    </svg>
    <div className="flex gap-4 text-[10px] text-[var(--app-text-muted)]"><span><span className="mr-1 inline-block size-2 rounded-full bg-emerald-500" />Profitable trade</span><span><span className="mr-1 inline-block size-2 rounded-full bg-rose-500" />Losing trade</span></div>
  </div>
}

function Metric({ label, value, hint }: MetricCard) {
  return <div className="rounded-lg border border-[var(--app-border)] bg-[var(--app-panel)] p-3.5">
    <div className="text-[10px] font-semibold uppercase tracking-wide text-[var(--app-text-muted)]">{label}</div>
    <div className="mt-2 break-words text-lg font-semibold tabular-nums">{value}</div>
    {hint && <div className="mt-1 text-[10px] text-[var(--app-text-muted)]">{hint}</div>}
  </div>
}

function BarList({ rows, valueKey, labelKey = "label", formatter }: { rows: Array<Record<string, string | number>>; valueKey: string; labelKey?: string; formatter?: (value: number) => string }) {
  const values = rows.map((row) => Number(row[valueKey] ?? 0))
  const max = Math.max(1, ...values.map((value) => Math.abs(value)))
  if (!rows.length) return <div className="py-6 text-center text-xs text-[var(--app-text-muted)]">No data yet</div>
  return <div className="space-y-3">
    {rows.map((row, index) => {
      const value = Number(row[valueKey] ?? 0)
      const positive = value >= 0
      return <div key={`${String(row[labelKey])}-${index}`} className="space-y-1">
        <div className="flex items-center justify-between gap-3 text-xs"><span className="truncate text-[var(--app-text-muted)]">{String(row[labelKey])}</span><span className="tabular-nums">{formatter ? formatter(value) : value}</span></div>
        <div className="h-2 overflow-hidden rounded-full bg-[var(--app-panel-muted)]"><div className={`h-full rounded-full ${positive ? "bg-emerald-500" : "bg-rose-500"}`} style={{ width: `${Math.max(2, Math.abs(value) / max * 100)}%` }} /></div>
      </div>
    })}
  </div>
}

function exportTradesCsv(result: BacktestResult) {
  const headers = ["symbol", "strategy", "setup", "regime", "signalDate", "entryDate", "exitDate", "entryPrice", "averageExitPrice", "initialShares", "exitShares", "pnlVnd", "returnPct", "riskMultiple", "commissionVnd", "taxVnd", "holdingSessions", "exitReason", "tp1Hit", "tp2Hit", "slHit", "maePct", "mfePct"]
  const escape = (value: unknown) => `"${String(value ?? "").replaceAll('"', '""')}"`
  const lines = [headers.join(","), ...result.trades.map((trade) => headers.map((header) => escape((trade as unknown as Record<string, unknown>)[header])).join(","))]
  const blob = new Blob([`\uFEFF${lines.join("\r\n")}`], { type: "text/csv;charset=utf-8;" })
  const url = URL.createObjectURL(blob)
  const anchor = document.createElement("a")
  anchor.href = url
  anchor.download = `backtest-${result.strategy}-${result.config.startDate}-${result.config.endDate}.csv`
  anchor.click()
  URL.revokeObjectURL(url)
}

export function BacktestPage() {
  const [config, setConfig] = useState<BacktestConfig>(DEFAULT_BACKTEST_CONFIG)
  const [symbolsText, setSymbolsText] = useState(DEFAULT_BACKTEST_CONFIG.symbols.join(", "))
  const [strategy, setStrategy] = useState<BacktestStrategy>("TPLUS_MULTI_SETUP_v1")
  const [running, setRunning] = useState(false)
  const [progress, setProgress] = useState<BacktestProgress | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [result, setResult] = useState<BacktestResult | null>(null)
  const workerRef = useRef<Worker | null>(null)
  const cancelledRef = useRef(false)
  const requestRef = useRef("")
  const runTokenRef = useRef(0)

  useEffect(() => {
    let active = true
    void clientCache.get<BacktestResult>(LAST_RESULT_CACHE_KEY, "backtestResults").then((lookup) => {
      if (active && lookup.envelope?.payload) setResult(lookup.envelope.payload)
    }).catch(() => undefined)
    return () => { active = false; workerRef.current?.terminate(); workerRef.current = null }
  }, [])

  const updateConfig = <K extends keyof BacktestConfig>(key: K, value: BacktestConfig[K]) => setConfig((current) => ({ ...current, [key]: value }))
  const resetWorker = () => {
    workerRef.current?.terminate()
    workerRef.current = null
  }

  const cancelRun = () => {
    cancelledRef.current = true
    runTokenRef.current += 1
    resetWorker()
    setRunning(false)
    setProgress(null)
  }

  const run = async () => {
    setError(null)
    const symbols = [...new Set(symbolsText.split(/[\s,;]+/).map((symbol) => symbol.trim().toUpperCase()).filter(Boolean))]
    const runConfig: BacktestConfig = { ...config, symbols }
    if (!symbols.length) { setError("Enter one or more stock symbols."); return }
    if (runConfig.startDate > runConfig.endDate) { setError("Start date must be on or before end date."); return }
    if (runConfig.initialCapital <= 0) { setError("Initial capital must be greater than zero."); return }
    cancelledRef.current = false
    const runToken = runTokenRef.current + 1
    runTokenRef.current = runToken
    setRunning(true)
    setProgress({ stage: "LOADING", processed: 0, total: symbols.length + 1, message: "Loading historical OHLCV and VNINDEX benchmark…" })
    setResult(null)
    const providerId = getSelectedProviderId()
    const provider = getMarketDataProvider(providerId)
    try {
      const barsBySymbol: BacktestInput["barsBySymbol"] = {}
      const loadErrors: Array<{ symbol: string; message: string }> = []
      let processed = 0
      await forEachConcurrent(symbols, 4, async (symbol) => {
        try {
          // Intentionally omit startDate so available pre-period bars can warm up indicators.
          barsBySymbol[symbol] = await provider.getHistoricalPrices({ symbol, endDate: runConfig.endDate, timeframe: "1D", cacheMode: "default" })
        } catch (loadError) {
          loadErrors.push({ symbol, message: loadError instanceof Error ? loadError.message : String(loadError) })
        } finally {
          processed += 1
          if (!cancelledRef.current) setProgress({ stage: "LOADING", processed, total: symbols.length + 1, message: `Loaded ${processed}/${symbols.length} stock series` })
        }
      }, () => cancelledRef.current || runTokenRef.current !== runToken)
      if (cancelledRef.current || runTokenRef.current !== runToken) return
      let benchmarkData: BacktestInput["benchmarkData"] = []
      try {
        benchmarkData = await provider.getMarketIndex("VNINDEX", { endDate: runConfig.endDate, timeframe: "1D", cacheMode: "default" })
      } catch (benchmarkError) {
        loadErrors.push({ symbol: "VNINDEX", message: benchmarkError instanceof Error ? benchmarkError.message : String(benchmarkError) })
      }
      if (cancelledRef.current || runTokenRef.current !== runToken) return
      const usableSymbols = Object.keys(barsBySymbol).filter((symbol) => barsBySymbol[symbol]?.length)
      if (!usableSymbols.length) throw new Error(loadErrors.map((item) => `${item.symbol}: ${item.message}`).join("; ") || "No stock history could be loaded")
      const input: BacktestInput = {
        config: runConfig,
        strategy,
        barsBySymbol,
        benchmarkData,
        providerId,
        isDemoData: providerId === "mock",
      }
      const requestId = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`
      requestRef.current = requestId
      const worker = new Worker(new URL("../../quant/backtest/backtest.worker.ts", import.meta.url), { type: "module" })
      workerRef.current = worker
      worker.onmessage = (event: MessageEvent<BacktestWorkerResponse>) => {
        const message = event.data
        if (message.requestId !== requestRef.current || cancelledRef.current || runTokenRef.current !== runToken) return
        if (message.type === "PROGRESS") {
          setProgress(message.progress)
          return
        }
        if (message.type === "ERROR") {
          setError(message.message)
          setRunning(false)
          setProgress(null)
          resetWorker()
          return
        }
        const completedResult: BacktestResult = {
          ...message.result,
          dataSummary: {
            ...message.result.dataSummary,
            symbolErrors: mergeSymbolErrors(message.result.dataSummary.symbolErrors, loadErrors),
          },
        }
        setResult(completedResult)
        setRunning(false)
        setProgress(null)
        resetWorker()
        void clientCache.set({
          kind: "backtestResults",
          providerId: "local-backtest",
          ttlMs: DEFAULT_CACHE_POLICIES.backtestResults.ttlMs,
          payload: completedResult,
          keyParts: { ...LAST_RESULT_KEY_PARTS },
          metadata: { strategy: completedResult.strategy, trades: completedResult.metrics.trades, createdAt: completedResult.createdAt },
        }).catch(() => undefined)
      }
      worker.onerror = (event) => {
        if (cancelledRef.current || runTokenRef.current !== runToken) return
        setError(event.message || "Backtest worker failed")
        setRunning(false)
        setProgress(null)
        resetWorker()
      }
      worker.postMessage({ type: "RUN", requestId, input })
    } catch (runError) {
      if (cancelledRef.current || runTokenRef.current !== runToken) return
      setError(runError instanceof Error ? runError.message : String(runError))
      setRunning(false)
      setProgress(null)
      resetWorker()
    }
  }

  const metrics = result?.metrics
  const metricCards = useMemo<MetricCard[]>(() => metrics ? [
    { label: "Total Return", value: formatPct(metrics.totalReturnPct), hint: formatVnd(metrics.finalEquity) + " final equity" },
    { label: "CAGR", value: formatPct(metrics.cagrPct), hint: "Annualized from test span" },
    { label: "Max Drawdown", value: formatPct(metrics.maxDrawdownPct), hint: "Peak-to-trough equity" },
    { label: "Sharpe", value: formatNumber(metrics.sharpeRatio), hint: "Annualized · 252 sessions" },
    { label: "Sortino", value: formatNumber(metrics.sortinoRatio), hint: "Downside deviation" },
    { label: "Win Rate", value: formatPct(metrics.winRatePct), hint: `${metrics.trades} closed trades` },
    { label: "Profit Factor", value: formatNumber(metrics.profitFactor), hint: "Gross profit / gross loss" },
    { label: "Expectancy", value: formatVnd(metrics.expectancyVnd), hint: `${formatNumber(metrics.expectancyR)} R per trade` },
    { label: "Average Win", value: formatPct(metrics.averageWinPct), hint: formatVnd(metrics.averageWinVnd) },
    { label: "Average Loss", value: formatPct(metrics.averageLossPct), hint: formatVnd(metrics.averageLossVnd) },
    { label: "Avg Hold", value: metrics.averageHoldingSessions == null ? "—" : `${metrics.averageHoldingSessions.toFixed(1)} sessions` },
    { label: "Trades", value: String(metrics.trades), hint: `${formatPct(metrics.timeInMarketPct)} time in market` },
    { label: "Exposure", value: formatPct(metrics.exposurePct), hint: "Average gross exposure / equity" },
    { label: "Turnover", value: formatPct(metrics.turnoverPct), hint: "Traded notional / average equity" },
    { label: "TP1 Hit Rate", value: formatPct(metrics.tp1HitRatePct) },
    { label: "TP2 Hit Rate", value: formatPct(metrics.tp2HitRatePct) },
    { label: "SL Hit Rate", value: formatPct(metrics.slHitRatePct) },
    { label: "MAE / MFE", value: `${formatPct(metrics.averageMaePct)} / ${formatPct(metrics.averageMfePct)}`, hint: "Average trade excursion" },
  ] : [], [metrics])

  const progressPct = progress && progress.total > 0 ? Math.min(100, Math.round(progress.processed / progress.total * 100)) : 0
  const monthlyRows = result?.monthlyReturns.map((row) => ({ label: row.month, returnPct: row.returnPct })) ?? []
  const returnRows = result?.returnDistribution.map((row) => ({ label: row.bucket, trades: row.trades })) ?? []

  return <div className="space-y-6">
    <PageHeader eyebrow="Research lab · Phase 10" title="Backtest" description="Event-driven historical simulation with realistic transaction costs, risk-based sizing, integrity guardrails and browser Web Worker execution." actions={<div className="flex flex-wrap gap-2">{result && <Button variant="outline" onClick={() => exportTradesCsv(result)}><Download className="size-3.5" /> Export trades CSV</Button>}{running ? <Button variant="destructive" onClick={cancelRun}><Square className="size-3.5" /> Cancel</Button> : <Button onClick={() => void run()}><Play className="size-3.5" /> Run Backtest</Button>}</div>} />

    <div className="grid items-start gap-4 xl:grid-cols-[360px_minmax(0,1fr)]">
      <Card>
        <CardHeader><CardTitle>Backtest configuration</CardTitle><p className="mt-1 text-xs text-[var(--app-text-muted)]">Price-only strategy signals. All costs are editable assumptions.</p></CardHeader>
        <CardContent className="space-y-4">
          <div><label className="mb-1.5 block text-xs font-medium">Strategy</label><select value={strategy} onChange={(event) => setStrategy(event.target.value as BacktestStrategy)} className="h-9 w-full rounded-md border border-[var(--app-border)] bg-[var(--app-panel-muted)] px-3 text-sm"><option value="TPLUS_MULTI_SETUP_v1">T+ Multi Setup v1</option><option value="TPLUS_BREAKOUT_v1">T+ Breakout v1</option><option value="TPLUS_PULLBACK_v1">T+ Pullback v1</option><option value="TPLUS_DIVERGENCE_v1">T+ RSI Divergence v1</option><option value="TPLUS_MEAN_REVERSION_v1">T+ Mean Reversion v1</option></select></div>
          <div><label className="mb-1.5 block text-xs font-medium">Symbols (comma / space separated)</label><Input value={symbolsText} onChange={(event) => setSymbolsText(event.target.value)} placeholder="HAH, GMD, DXP" /><p className="mt-1 text-[10px] text-[var(--app-text-muted)]">Portfolio capital is shared across all symbols. Per-symbol data errors are isolated.</p></div>
          <div className="grid grid-cols-2 gap-3"><div><label className="mb-1.5 block text-xs font-medium">Start date</label><Input type="date" value={config.startDate} onChange={(event) => updateConfig("startDate", event.target.value)} /></div><div><label className="mb-1.5 block text-xs font-medium">End date</label><Input type="date" value={config.endDate} onChange={(event) => updateConfig("endDate", event.target.value)} /></div></div>
          <div><label className="mb-1.5 block text-xs font-medium">Initial capital (VND)</label>{numberInput(config.initialCapital, (value) => updateConfig("initialCapital", value), 1, 1_000_000)}</div>
          <div className="grid grid-cols-2 gap-3"><div><label className="mb-1.5 block text-xs font-medium">Commission (%)</label>{numberInput(config.commissionPct, (value) => updateConfig("commissionPct", value), 0, 0.01)}</div><div><label className="mb-1.5 block text-xs font-medium">Sell tax (%)</label>{numberInput(config.sellingTaxPct, (value) => updateConfig("sellingTaxPct", value), 0, 0.01)}</div><div><label className="mb-1.5 block text-xs font-medium">Slippage (%)</label>{numberInput(config.slippagePct, (value) => updateConfig("slippagePct", value), 0, 0.01)}</div><div><label className="mb-1.5 block text-xs font-medium">Lot size</label>{numberInput(config.lotSize, (value) => updateConfig("lotSize", Math.round(value)), 1, 100)}</div></div>
          <div className="border-t border-[var(--app-border)] pt-3"><div className="mb-3 text-xs font-semibold">Execution & exits</div><div className="space-y-3"><div><label className="mb-1.5 block text-xs font-medium">Entry model</label><select value={config.entryModel} onChange={(event) => updateConfig("entryModel", event.target.value as BacktestConfig["entryModel"])} className="h-9 w-full rounded-md border border-[var(--app-border)] bg-[var(--app-panel-muted)] px-3 text-sm"><option value="NEXT_OPEN">Next session open</option><option value="NEXT_OPEN_IF_IN_ZONE">Next open only inside entry zone</option></select></div><div><label className="mb-1.5 block text-xs font-medium">Exit model</label><select value={config.exitModel} onChange={(event) => updateConfig("exitModel", event.target.value as BacktestConfig["exitModel"])} className="h-9 w-full rounded-md border border-[var(--app-border)] bg-[var(--app-panel-muted)] px-3 text-sm"><option value="SL_TP_PARTIAL">SL + partial TP1 / TP2</option><option value="SL_TP2_ONLY">SL + TP2 (no partial TP1)</option><option value="TIME_STOP">SL + time stop (ignore targets)</option></select></div><div className="grid grid-cols-2 gap-3"><div><label className="mb-1.5 block text-xs font-medium">Minimum score</label>{numberInput(config.minScoreToBuy, (value) => updateConfig("minScoreToBuy", value), 0, 1)}</div><div><label className="mb-1.5 block text-xs font-medium">Minimum R:R at fill</label>{numberInput(config.minRiskReward, (value) => updateConfig("minRiskReward", value), 0.1, 0.1)}</div></div></div></div>
          <div className="border-t border-[var(--app-border)] pt-3"><div className="mb-3 text-xs font-semibold">Portfolio risk controls</div><div className="grid grid-cols-2 gap-3"><div><label className="mb-1.5 block text-xs font-medium">Risk / trade (%)</label>{numberInput(config.riskPerTradePct, (value) => updateConfig("riskPerTradePct", value), 0.01, 0.25)}</div><div><label className="mb-1.5 block text-xs font-medium">Max position (%)</label>{numberInput(config.maxPositionPct, (value) => updateConfig("maxPositionPct", value), 1, 1)}</div><div><label className="mb-1.5 block text-xs font-medium">Max exposure (%)</label>{numberInput(config.maxPortfolioExposurePct, (value) => updateConfig("maxPortfolioExposurePct", value), 1, 1)}</div><div><label className="mb-1.5 block text-xs font-medium">Max open positions</label>{numberInput(config.maxOpenPositions, (value) => updateConfig("maxOpenPositions", Math.round(value)), 1, 1)}</div><div className="col-span-2"><label className="mb-1.5 block text-xs font-medium">Maximum holding sessions</label>{numberInput(config.maxHoldingSessions, (value) => updateConfig("maxHoldingSessions", Math.round(value)), 1, 1)}</div></div></div>
          <div className="rounded-lg border border-blue-500/20 bg-blue-500/5 p-3 text-xs leading-5 text-[var(--app-text-muted)]"><div className="mb-1 flex items-center gap-2 font-semibold text-blue-500"><ShieldCheck className="size-4" /> Integrity controls enabled</div>Signal at close T → earliest fill at open T+1. Current fundamentals are not used in historical trades. If one candle touches SL and TP, SL is assumed first. Costs are applied to fills.</div>
          <div className="rounded-lg border border-amber-500/20 bg-amber-500/5 p-3 text-xs leading-5 text-[var(--app-text-muted)]"><div className="mb-1 flex items-center gap-2 font-semibold text-amber-600"><AlertTriangle className="size-4" /> Hold backtest not enabled</div>Point-in-time fundamentals with publication dates are not available from the current provider contract. Using today's fundamentals on older dates would introduce fundamental look-ahead bias.</div>
        </CardContent>
      </Card>

      <div className="space-y-4">
        {(running || error) && <Card><CardContent className="p-4">{running && <div className="space-y-2"><div className="flex items-center gap-2 text-sm font-medium"><LoaderCircle className="size-4 animate-spin" /> {progress?.message ?? "Preparing backtest…"}</div><div className="h-2 overflow-hidden rounded-full bg-[var(--app-panel-muted)]"><div className="h-full rounded-full bg-blue-500 transition-all" style={{ width: `${progressPct}%` }} /></div><div className="flex justify-between text-[10px] text-[var(--app-text-muted)]"><span>{progress?.stage ?? "LOADING"}</span><span>{progressPct}%</span></div></div>}{error && <div className="mt-2 rounded-md border border-rose-500/20 bg-rose-500/5 p-3 text-sm text-rose-500">{error}</div>}</CardContent></Card>}
        {result ? <>
          <Card><CardHeader className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between"><div><CardTitle>Performance summary</CardTitle><p className="mt-1 text-xs text-[var(--app-text-muted)]">{result.strategy} · {result.config.startDate} to {result.config.endDate} · {result.dataSummary.symbolsProcessed.join(", ")}</p></div><div className="flex flex-wrap gap-2"><Badge variant="muted"><FlaskConical className="mr-1 size-3" /> {result.isDemoData ? "DEMO DATA" : result.providerId}</Badge><Badge variant="muted">{result.createdAt.slice(0, 16).replace("T", " ")}</Badge></div></CardHeader><CardContent><div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3 2xl:grid-cols-4">{metricCards.map((metric) => <Metric key={metric.label} {...metric} />)}</div></CardContent></Card>
          {result.isDemoData && <div className="rounded-lg border border-amber-500/30 bg-amber-500/5 p-3 text-xs leading-5 text-[var(--app-text-muted)]"><strong className="text-amber-600">Synthetic mock data:</strong> use this run to validate app mechanics only. It does not establish a real trading edge or predict live performance.</div>}
          {(result.dataSummary.warnings.length > 0 || result.dataSummary.symbolErrors.length > 0) && <Card><CardHeader><CardTitle>Data integrity & warnings</CardTitle></CardHeader><CardContent className="space-y-2 text-xs">{result.dataSummary.warnings.map((warning) => <div key={warning} className="flex gap-2 text-[var(--app-text-muted)]"><AlertTriangle className="mt-0.5 size-3.5 shrink-0 text-amber-500" />{warning}</div>)}{result.dataSummary.symbolErrors.map((row, index) => <div key={`${row.symbol}-${index}`} className="text-rose-500">{row.symbol}: {row.message}</div>)}<div className="mt-2 text-[var(--app-text-muted)]">History: {result.dataSummary.startDateAvailable ?? "—"} → {result.dataSummary.endDateAvailable ?? "—"} · {Object.entries(result.dataSummary.barsBySymbol).map(([symbol, count]) => `${symbol} ${count} bars`).join(" · ")} · Benchmark bars: {result.dataSummary.benchmarkBars}</div></CardContent></Card>}
          <div className="grid gap-4 xl:grid-cols-2"><Card><CardHeader><CardTitle>Equity curve</CardTitle><p className="mt-1 text-xs text-[var(--app-text-muted)]">End-of-session equity after marking open positions to close; final session is liquidated.</p></CardHeader><CardContent><LineChart points={result.equityCurve} /></CardContent></Card><Card><CardHeader><CardTitle>Drawdown</CardTitle><p className="mt-1 text-xs text-[var(--app-text-muted)]">Peak-to-trough equity decline.</p></CardHeader><CardContent><LineChart points={result.equityCurve} mode="drawdown" /></CardContent></Card></div>
          <div className="grid gap-4 xl:grid-cols-2"><Card><CardHeader><CardTitle>Monthly returns</CardTitle></CardHeader><CardContent><BarList rows={monthlyRows} valueKey="returnPct" labelKey="label" formatter={formatPct} /></CardContent></Card><Card><CardHeader><CardTitle>Trade return distribution</CardTitle></CardHeader><CardContent><BarList rows={returnRows} valueKey="trades" labelKey="label" /></CardContent></Card></div>
          <div className="grid gap-4 xl:grid-cols-2"><Card><CardHeader><CardTitle>Performance by market regime</CardTitle></CardHeader><CardContent><div className="overflow-x-auto"><table className="w-full min-w-[460px] text-left text-xs"><thead><tr className="border-b border-[var(--app-border)] text-[var(--app-text-muted)]"><th className="py-2 pr-3">Regime</th><th className="py-2 pr-3">Trades</th><th className="py-2 pr-3">Win rate</th><th className="py-2 pr-3">Avg return</th><th className="py-2">P/L</th></tr></thead><tbody>{result.regimePerformance.map((row) => <tr key={row.regime} className="border-b border-[var(--app-border)]/60"><td className="py-2 pr-3 font-medium">{row.regime}</td><td className="py-2 pr-3">{row.trades}</td><td className="py-2 pr-3">{formatPct(row.winRatePct)}</td><td className="py-2 pr-3">{formatPct(row.averageReturnPct)}</td><td className={`py-2 ${row.totalPnlVnd >= 0 ? "text-emerald-500" : "text-rose-500"}`}>{formatVnd(row.totalPnlVnd)}</td></tr>)}</tbody></table></div></CardContent></Card><Card><CardHeader><CardTitle>Exit reasons</CardTitle></CardHeader><CardContent><BarList rows={result.exitDistribution.map((row) => ({ label: row.reason, trades: row.trades }))} valueKey="trades" /></CardContent></Card></div>
          <div className="grid gap-4 xl:grid-cols-2"><Card><CardHeader><CardTitle>MAE / MFE by trade</CardTitle><p className="mt-1 text-xs text-[var(--app-text-muted)]">Each point is one completed trade. MAE is maximum adverse excursion; MFE is maximum favorable excursion.</p></CardHeader><CardContent><MaeMfeChart trades={result.trades} /></CardContent></Card><Card><CardHeader><CardTitle>Data & simulation summary</CardTitle></CardHeader><CardContent><div className="space-y-3 text-xs"><div className="flex justify-between gap-4"><span className="text-[var(--app-text-muted)]">Strategy version</span><span className="text-right font-medium">{result.strategy}</span></div><div className="flex justify-between gap-4"><span className="text-[var(--app-text-muted)]">Entry / exit</span><span className="text-right">{result.config.entryModel} / {result.config.exitModel}</span></div><div className="flex justify-between gap-4"><span className="text-[var(--app-text-muted)]">Round-trip cost assumptions</span><span className="text-right">Comm {result.config.commissionPct}% · Tax {result.config.sellingTaxPct}% · Slip {result.config.slippagePct}%</span></div><div className="flex justify-between gap-4"><span className="text-[var(--app-text-muted)]">Risk sizing</span><span className="text-right">{result.config.riskPerTradePct}% risk · {result.config.minRiskReward} min R:R · {result.config.maxPositionPct}% max position</span></div><div className="flex justify-between gap-4"><span className="text-[var(--app-text-muted)]">Portfolio controls</span><span className="text-right">{result.config.maxPortfolioExposurePct}% max exposure · {result.config.maxOpenPositions} positions · {result.config.lotSize} lot</span></div><div className="flex justify-between gap-4"><span className="text-[var(--app-text-muted)]">Bars by symbol</span><span className="text-right">{Object.entries(result.dataSummary.barsBySymbol).map(([symbol, count]) => `${symbol}: ${count}`).join(" · ") || "—"}</span></div></div></CardContent></Card></div>
          <Card><CardHeader className="flex flex-row items-center justify-between"><div><CardTitle>Trade ledger</CardTitle><p className="mt-1 text-xs text-[var(--app-text-muted)]">Completed trades only. MAE/MFE are measured against the slipped entry fill.</p></div><Button variant="outline" size="sm" onClick={() => exportTradesCsv(result)}><Download className="size-3.5" /> CSV</Button></CardHeader><CardContent><div className="overflow-x-auto"><table className="w-full min-w-[1080px] text-left text-xs"><thead><tr className="border-b border-[var(--app-border)] text-[var(--app-text-muted)]">{["Symbol / Setup", "Signal → Entry", "Exit", "Entry", "Avg Exit", "Shares", "P/L", "Return", "R", "MAE / MFE", "Outcome"].map((heading) => <th key={heading} className="px-2 py-2 font-medium">{heading}</th>)}</tr></thead><tbody>{result.trades.slice().reverse().slice(0, 100).map((trade) => <tr key={trade.id} className="border-b border-[var(--app-border)]/60"><td className="px-2 py-2"><div className="font-semibold">{trade.symbol}</div><div className="mt-0.5 text-[10px] text-[var(--app-text-muted)]">{trade.setup}</div></td><td className="px-2 py-2"><div>{trade.signalDate}</div><div className="text-[10px] text-[var(--app-text-muted)]">→ {trade.entryDate}</div></td><td className="px-2 py-2"><div>{trade.exitDate}</div><div className="text-[10px] text-[var(--app-text-muted)]">{trade.exitReason}</div></td><td className="px-2 py-2">{formatNumber(trade.entryPrice, 3)}</td><td className="px-2 py-2">{formatNumber(trade.averageExitPrice, 3)}</td><td className="px-2 py-2">{trade.initialShares.toLocaleString("en-US")}</td><td className={`px-2 py-2 font-medium ${trade.pnlVnd >= 0 ? "text-emerald-500" : "text-rose-500"}`}>{formatVnd(trade.pnlVnd)}</td><td className={`px-2 py-2 ${trade.returnPct >= 0 ? "text-emerald-500" : "text-rose-500"}`}>{formatPct(trade.returnPct)}</td><td className="px-2 py-2">{formatNumber(trade.riskMultiple)}R</td><td className="px-2 py-2">{formatPct(trade.maePct)} / {formatPct(trade.mfePct)}</td><td className="px-2 py-2"><div>{trade.tp1Hit ? "TP1 " : ""}{trade.tp2Hit ? "TP2 " : ""}{trade.slHit ? "SL" : ""}</div><div className="text-[10px] text-[var(--app-text-muted)]">{trade.holdingSessions} sessions</div></td></tr>)}</tbody></table>{result.trades.length === 0 && <div className="py-8 text-center text-sm text-[var(--app-text-muted)]">No qualifying trades in this period. Try a different strategy/date range, or inspect history and data warnings.</div>}{result.trades.length > 100 && <p className="mt-3 text-xs text-[var(--app-text-muted)]">Showing the most recent 100 of {result.trades.length} trades. Export CSV for the complete ledger.</p>}</div></CardContent></Card>
          <div className="flex justify-end"><Button variant="outline" onClick={() => { setResult(null); setError(null) }}><Trash2 className="size-3.5" /> Clear result view</Button></div>
        </> : !running && <Card><CardContent className="flex min-h-72 items-center justify-center p-6 text-center"><div className="max-w-sm"><div className="mx-auto flex size-12 items-center justify-center rounded-xl bg-blue-500/10 text-blue-500"><FlaskConical className="size-6" /></div><h2 className="mt-4 text-base font-semibold">Run a historical simulation</h2><p className="mt-2 text-sm leading-6 text-[var(--app-text-muted)]">The app loads daily OHLCV, builds signals with historical-only data in a Web Worker, simulates fills and displays performance metrics, equity, drawdown and the trade ledger.</p><Button className="mt-4" onClick={() => void run()}><Play className="size-3.5" /> Run Backtest</Button></div></CardContent></Card>}
      </div>
    </div>
  </div>
}
