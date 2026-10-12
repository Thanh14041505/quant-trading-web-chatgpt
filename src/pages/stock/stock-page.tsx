import { useMemo, useState } from "react"
import { useQuery } from "@tanstack/react-query"
import { Link, useParams } from "react-router-dom"
import type { ReactNode } from "react"
import {
  Activity, ArrowUpRight, BarChart3, BookOpen, Building2, CalendarClock,
  CheckCircle2, CircleGauge, Database, ExternalLink, Gauge, Layers3, RefreshCw, ShieldAlert,
  Target, TrendingUp, Wallet,
} from "lucide-react"
import { Badge } from "@/components/ui/badge"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { PageHeader } from "@/components/common/page-header"
import { StatCard } from "@/components/common/stat-card"
import { StockPriceChart } from "@/components/charts/stock-price-chart"
import type { ChartPriceLevel } from "@/components/charts/stock-price-chart"
import { getMarketDataProvider, getSelectedProviderId } from "@/data/providers/provider-registry"
import { CachedMarketDataProvider } from "@/data/cache/cached-provider"
import type { CacheResolution } from "@/data/cache/cached-provider"
import type { FundamentalData } from "@/models/market"
import { calculateFeatures } from "@/quant/features"
import { calculateTplusSignal } from "@/quant/tplus"
import { calculateHoldSignal } from "@/quant/hold"
import { useMarketRegime } from "@/hooks/useMarketRegime"

interface MetricItem {
  label: string
  value: string
  detail?: string
  tone?: "positive" | "negative" | "warning" | "normal"
}

function finite(value: unknown): value is number {
  return typeof value === "number" && Number.isFinite(value)
}

function numberText(value: number | undefined | null, digits = 2) {
  return finite(value) ? value.toLocaleString("en-US", { minimumFractionDigits: digits, maximumFractionDigits: digits }) : "N/A"
}

function percentText(value: number | undefined | null, digits = 2, sign = false) {
  if (!finite(value)) return "N/A"
  const prefix = sign && value > 0 ? "+" : ""
  return `${prefix}${value.toLocaleString("en-US", { minimumFractionDigits: digits, maximumFractionDigits: digits })}%`
}

function compactText(value: number | undefined | null) {
  if (!finite(value)) return "N/A"
  return new Intl.NumberFormat("en-US", { notation: "compact", maximumFractionDigits: 2 }).format(value)
}

function metric(label: string, value: number | undefined | null, digits = 2, detail?: string): MetricItem {
  return { label, value: numberText(value, digits), detail }
}

function percentMetric(label: string, value: number | undefined | null, detail?: string): MetricItem {
  return { label, value: percentText(value), detail }
}

function codeLabel(value: string) {
  return value.replaceAll("_", " ").replaceAll(".", " · ")
}

function Panel({ title, description, icon, action, children, className = "" }: {
  title: string
  description?: string
  icon?: ReactNode
  action?: ReactNode
  children: ReactNode
  className?: string
}) {
  return <Card className={className}>
    <CardHeader className="flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
      <div>
        <CardTitle>{icon && <span className="mr-2 inline-flex align-middle text-[var(--app-text-muted)]">{icon}</span>}{title}</CardTitle>
        {description && <p className="mt-1 max-w-3xl text-xs leading-5 text-[var(--app-text-muted)]">{description}</p>}
      </div>
      {action}
    </CardHeader>
    <CardContent>{children}</CardContent>
  </Card>
}

function MetricGrid({ items, columns = "grid-cols-2 sm:grid-cols-3 xl:grid-cols-4" }: { items: MetricItem[]; columns?: string }) {
  return <div className={`grid gap-2 ${columns}`}>
    {items.map((item) => <div key={item.label} className="min-w-0 rounded-lg border border-[var(--app-border)] bg-[var(--app-panel)] p-3">
      <div className="text-[10px] font-medium uppercase tracking-wide text-[var(--app-text-muted)]">{item.label}</div>
      <div className={`mt-1 break-words text-sm font-semibold tabular-nums ${item.tone === "positive" ? "text-emerald-600 dark:text-emerald-400" : item.tone === "negative" ? "text-red-600 dark:text-red-400" : item.tone === "warning" ? "text-amber-600 dark:text-amber-400" : ""}`}>{item.value}</div>
      {item.detail && <div className="mt-1 text-[10px] leading-4 text-[var(--app-text-muted)]">{item.detail}</div>}
    </div>)}
  </div>
}

function CodeList({ items, empty, tone = "positive" }: { items: string[]; empty: string; tone?: "positive" | "warning" }) {
  const className = tone === "positive" ? "text-emerald-600 dark:text-emerald-400" : "text-amber-600 dark:text-amber-400"
  return <div className="space-y-2 text-xs">
    {items.length ? items.map((item) => <div key={item} className="flex items-start gap-2"><span className={className}>{tone === "positive" ? "✓" : "⚠"}</span><span>{codeLabel(item)}</span></div>) : <div className="text-[var(--app-text-muted)]">{empty}</div>}
  </div>
}

function sourceStatus(resolution?: CacheResolution) {
  if (resolution === "FRESH_CACHE") return { label: "Fresh client cache", variant: "success" as const }
  if (resolution === "STALE_CACHE_FALLBACK") return { label: "Stale cache fallback", variant: "warning" as const }
  if (resolution === "CACHE_ONLY") return { label: "Cache only", variant: "muted" as const }
  if (resolution === "NETWORK") return { label: "Fetched from provider", variant: "default" as const }
  return { label: "Waiting for data", variant: "muted" as const }
}

function fundMetric(label: string, value: number | undefined, suffix = "") {
  const display = finite(value) ? (Math.abs(value) >= 1_000_000 ? compactText(value) : numberText(value)) : "N/A"
  return { label, value: `${display}${finite(value) ? suffix : ""}` }
}

function sectorMetrics(sector: string | undefined, fundamentals?: FundamentalData): MetricItem[] {
  const f = fundamentals
  if (sector === "Banks") return [
    fundMetric("Net interest margin (NIM)", f?.nim, "%"), fundMetric("Non-performing loans (NPL)", f?.npl, "%"),
    fundMetric("Provisioning coverage", f?.provisioning, "%"), fundMetric("CASA", f?.casa, "%"),
  ]
  if (sector === "Securities") return [
    fundMetric("Brokerage share growth", f?.brokerageShareGrowth, "%"), fundMetric("Margin lending growth", f?.marginLendingGrowth, "%"),
    fundMetric("Proprietary trading growth", f?.proprietaryTradingGrowth, "%"), fundMetric("ROE", f?.roe, "%"),
  ]
  if (sector === "Real Estate") return [
    fundMetric("Debt / equity", f?.debtToEquity), fundMetric("Inventory", f?.inventory), fundMetric("Net debt", f?.netDebt),
    fundMetric("Project pipeline indicator", f?.projectPipeline), { label: "Legal status", value: f?.legalStatus ?? "N/A", tone: f?.legalStatus === "At Risk" ? "negative" : f?.legalStatus === "Watch" ? "warning" : "normal" },
  ]
  if (sector === "Manufacturing") return [
    fundMetric("Gross margin", f?.grossMargin, "%"), fundMetric("Operating margin", f?.operatingMargin, "%"),
    fundMetric("Inventory", f?.inventory), fundMetric("Debt / equity", f?.debtToEquity), fundMetric("Free cash flow", f?.freeCashFlow),
  ]
  if (sector === "Shipping & Ports") return [
    fundMetric("ROE", f?.roe, "%"), fundMetric("ROIC", f?.roic, "%"), fundMetric("Debt / equity", f?.debtToEquity),
    fundMetric("EV / EBITDA", f?.evEbitda), fundMetric("Inventory", f?.inventory),
  ]
  if (sector === "Technology") return [
    fundMetric("Gross margin", f?.grossMargin, "%"), fundMetric("Operating margin", f?.operatingMargin, "%"),
    fundMetric("Revenue growth", f?.revenueGrowth, "%"), fundMetric("EPS growth", f?.epsGrowth, "%"), fundMetric("ROIC", f?.roic, "%"),
  ]
  return [fundMetric("Debt / equity", f?.debtToEquity), fundMetric("Interest coverage", f?.interestCoverage), fundMetric("Free cash flow", f?.freeCashFlow)]
}

function fundamentalsMetrics(fundamentals?: FundamentalData) {
  const f = fundamentals
  const quality: MetricItem[] = [
    fundMetric("ROE", f?.roe, "%"), fundMetric("ROA", f?.roa, "%"), fundMetric("ROIC", f?.roic, "%"),
    fundMetric("Gross margin", f?.grossMargin, "%"), fundMetric("Operating margin", f?.operatingMargin, "%"),
    fundMetric("Net margin", f?.netMargin, "%"), fundMetric("Interest coverage", f?.interestCoverage, "x"),
  ]
  const growth: MetricItem[] = [
    fundMetric("Revenue growth", f?.revenueGrowth, "%"), fundMetric("EPS growth", f?.epsGrowth, "%"),
    fundMetric("Revenue CAGR", f?.revenueCagr, "%"), fundMetric("Profit CAGR", f?.profitCagr, "%"),
  ]
  const valuation: MetricItem[] = [
    fundMetric("P/E", f?.pe, "x"), fundMetric("P/B", f?.pb, "x"), fundMetric("EV / EBITDA", f?.evEbitda, "x"),
    fundMetric("PEG", f?.peg, "x"), fundMetric("Dividend yield", f?.dividendYield, "%"),
    fundMetric("Historical P/E", f?.historicalPe, "x"), fundMetric("Historical P/B", f?.historicalPb, "x"),
    fundMetric("Sector median P/E", f?.sectorMedianPe, "x"), fundMetric("Sector median P/B", f?.sectorMedianPb, "x"),
  ]
  const balance: MetricItem[] = [
    fundMetric("Debt / equity", f?.debtToEquity), fundMetric("Operating cash flow", f?.operatingCashFlow),
    fundMetric("Free cash flow", f?.freeCashFlow), fundMetric("Net debt", f?.netDebt), fundMetric("Inventory", f?.inventory),
  ]
  return { quality, growth, valuation, balance }
}

function fundamentalsNotes(fundamentals?: FundamentalData) {
  return {
    catalysts: fundamentals?.catalysts ?? [],
    risks: fundamentals?.risks ?? [],
  }
}

function valueLabel(value: boolean) {
  return value ? "YES" : "NO"
}

function createChartLevels(features: ReturnType<typeof calculateFeatures> | null, tplus: ReturnType<typeof calculateTplusSignal> | null): ChartPriceLevel[] {
  const levels: ChartPriceLevel[] = []
  if (features) {
    levels.push({ label: "Support · 20D low", value: features.snapshot.priceStructure.low20, color: "#14b8a6", dash: true })
    levels.push({ label: "Resistance · 20D high", value: features.snapshot.priceStructure.high20, color: "#a78bfa", dash: true })
    levels.push({ label: "Volume POC", value: features.volumeProfile.poc, color: "#64748b", dash: true })
  }
  if (tplus) {
    const signal = tplus.signal
    if (signal.entryZone) levels.push({ label: "Entry midpoint", value: (signal.entryZone.low + signal.entryZone.high) / 2, color: "#3b82f6" })
    levels.push({ label: "Stop loss", value: signal.stopLoss, color: "#ef4444" })
    levels.push({ label: "TP1", value: signal.tp1, color: "#10b981" })
    levels.push({ label: "TP2", value: signal.tp2, color: "#059669", dash: true })
  }
  return levels.filter((level) => finite(level.value))
}

export function StockPage() {
  const { symbol: routeSymbol = "HAH" } = useParams()
  const symbol = routeSymbol.trim().toUpperCase().replace(/[^A-Z0-9.-]/g, "") || "HAH"
  const providerId = getSelectedProviderId()
  const provider = useMemo(() => getMarketDataProvider(providerId), [providerId])
  const [refreshVersion, setRefreshVersion] = useState(0)
  const { regime } = useMarketRegime()

  const companyQuery = useQuery({
    queryKey: ["stock-company", providerId, symbol],
    queryFn: () => getMarketDataProvider(providerId).getCompanyInfo(symbol),
    staleTime: Infinity,
    retry: 0,
  })
  const fundamentalsQuery = useQuery({
    queryKey: ["stock-fundamentals", providerId, symbol],
    queryFn: () => getMarketDataProvider(providerId).getFundamentals(symbol),
    staleTime: Infinity,
    retry: 0,
  })
  const pricesQuery = useQuery({
    queryKey: ["stock-prices", providerId, symbol, refreshVersion],
    queryFn: async () => {
      const dataProvider = getMarketDataProvider(providerId)
      const rows = await dataProvider.getHistoricalPrices({ symbol, timeframe: "1D", cacheMode: refreshVersion > 0 ? "force-refresh" : "default" })
      const resolution = dataProvider instanceof CachedMarketDataProvider ? dataProvider.getLastCacheResolution() : "NETWORK"
      return { rows: [...rows].sort((left, right) => left.date.localeCompare(right.date)), resolution, loadedAt: new Date().toISOString() }
    },
    staleTime: Infinity,
    retry: 0,
  })
  const benchmarkQuery = useQuery({
    queryKey: ["stock-benchmark", providerId, refreshVersion],
    queryFn: async () => {
      const dataProvider = getMarketDataProvider(providerId)
      const rows = await dataProvider.getMarketIndex("VNINDEX", { timeframe: "1D", cacheMode: refreshVersion > 0 ? "force-refresh" : "default" })
      return [...rows].sort((left, right) => left.date.localeCompare(right.date))
    },
    staleTime: Infinity,
    retry: 0,
  })

  const company = companyQuery.data
  const fundamentals = fundamentalsQuery.data
  const prices = pricesQuery.data?.rows ?? []
  const benchmark = benchmarkQuery.data ?? []
  const last = prices.at(-1)
  const previous = prices.at(-2)
  const dayChangePct = last && previous && previous.close !== 0 ? ((last.close / previous.close) - 1) * 100 : Number.NaN

  const featureResult = useMemo(() => {
    if (!prices.length) return null
    try { return calculateFeatures(prices, { benchmark }) } catch { return null }
  }, [benchmark, prices])
  const tplus = useMemo(() => {
    if (!featureResult || prices.length < 60 || !regime) return null
    try { return calculateTplusSignal({ data: prices, features: featureResult, regime, featureContext: { benchmark } }) } catch { return null }
  }, [benchmark, featureResult, prices, regime])
  const hold = useMemo(() => {
    if (!featureResult || !company || !fundamentals || prices.length < 60) return null
    try { return calculateHoldSignal({ data: prices, features: featureResult, company, fundamentals }) } catch { return null }
  }, [company, featureResult, fundamentals, prices])
  const chartLevels = useMemo(() => createChartLevels(featureResult, tplus), [featureResult, tplus])
  const fundamentalGroups = useMemo(() => fundamentalsMetrics(fundamentals), [fundamentals])
  const sectorGroup = useMemo(() => sectorMetrics(company?.sector, fundamentals), [company?.sector, fundamentals])
  const notes = fundamentalsNotes(fundamentals)
  const status = sourceStatus(pricesQuery.data?.resolution)
  const providerNote = pricesQuery.data?.resolution === "STALE_CACHE_FALLBACK"
    ? "Live request failed; cached historical data is being used."
    : pricesQuery.data?.resolution === "FRESH_CACHE" || pricesQuery.data?.resolution === "CACHE_ONLY"
      ? "Historical candles were resolved from browser-side cache."
      : "Historical candles were returned by the configured provider."

  const snapshot = featureResult?.snapshot
  const highEnoughHistory = prices.length >= 200
  const closeVsEma50 = snapshot ? snapshot.close >= snapshot.trend.ema50 : false
  const closeVsEma200 = snapshot ? snapshot.close >= snapshot.trend.ema200 : false
  const sector = company?.sector ?? "Other"
  const refreshPriceData = () => setRefreshVersion((version) => version + 1)
  const isRefreshing = pricesQuery.isFetching || benchmarkQuery.isFetching
  const priceError = pricesQuery.error instanceof Error ? pricesQuery.error.message : pricesQuery.error ? String(pricesQuery.error) : undefined
  const companyError = companyQuery.error instanceof Error ? companyQuery.error.message : companyQuery.error ? String(companyQuery.error) : undefined
  const fundamentalsError = fundamentalsQuery.error instanceof Error ? fundamentalsQuery.error.message : fundamentalsQuery.error ? String(fundamentalsQuery.error) : undefined

  return <div className="space-y-6">
    <PageHeader
      eyebrow={`${company?.exchange ?? "EXCHANGE N/A"} · ${sector}`}
      title={`${symbol}${company?.name ? ` · ${company.name}` : ""}`}
      description="Stock research terminal · price action, transparent quant signals, long-term thesis, fundamentals and data provenance."
      actions={<div className="flex flex-wrap items-center gap-2">
        <button type="button" onClick={refreshPriceData} disabled={isRefreshing} className="inline-flex items-center gap-2 rounded-lg border border-[var(--app-border)] bg-[var(--app-panel)] px-3 py-2 text-xs font-semibold hover:bg-[var(--app-panel-muted)] disabled:opacity-50"><RefreshCw className={`size-3.5 ${isRefreshing ? "animate-spin" : ""}`} />{isRefreshing ? "Refreshing…" : "Refresh prices"}</button>
        <Link to="/tplus" className="inline-flex items-center gap-2 rounded-lg bg-blue-600 px-3 py-2 text-xs font-semibold text-white hover:bg-blue-500"><Target className="size-3.5" />T+ Scanner<ExternalLink className="size-3" /></Link>
      </div>}
    />

    {providerId === "mock" && <div className="flex items-start gap-3 rounded-lg border border-amber-500/30 bg-amber-500/5 p-3 text-xs"><ShieldAlert className="mt-0.5 size-4 shrink-0 text-amber-600" /><div><div className="font-semibold text-amber-700 dark:text-amber-300">DEMO DATA · NOT LIVE MARKET DATA</div><div className="mt-1 leading-5 text-[var(--app-text-muted)]">Mock Provider generates synthetic prices and sample fundamentals for development. Do not use these outputs as real trading recommendations.</div></div></div>}

    <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-5">
      <StatCard label="Last Close" value={last ? numberText(last.close) : "N/A"} change={finite(dayChangePct) ? `${dayChangePct > 0 ? "+" : ""}${dayChangePct.toFixed(2)}% 1D` : "No prior bar"} icon={<Activity className="size-4" />} />
      <StatCard label="20D Stock Return" value={percentText(snapshot?.relativeStrength.rs20, 2, true)} change="Close vs close 20 sessions ago" icon={<TrendingUp className="size-4" />} />
      <StatCard label="Excess vs VNINDEX" value={percentText(snapshot?.relativeStrength.returnVsBenchmark20, 2, true)} change="20-session return difference" icon={<ArrowUpRight className="size-4" />} />
      <StatCard label="RVOL20" value={numberText(snapshot?.volume.rvol20)} change="Volume / 20-session average" icon={<BarChart3 className="size-4" />} />
      <StatCard label="RSI14" value={numberText(snapshot?.momentum.rsi14, 1)} change={finite(snapshot?.momentum.rsi14) ? snapshot!.momentum.rsi14 >= 70 ? "Extended" : snapshot!.momentum.rsi14 <= 30 ? "Oversold" : "Neutral zone" : "Insufficient history"} icon={<CircleGauge className="size-4" />} />
    </div>

    <Panel title="Price action & trade levels" description="Candles are aggregated from daily OHLCV for weekly/monthly views. EMA overlays are calculated on the displayed interval; quant signals remain based on daily bars." icon={<Activity className="size-4" />} action={<div className="flex flex-wrap items-center gap-2"><Badge variant={status.variant}>{status.label}</Badge><Badge variant="muted">{prices.length.toLocaleString()} daily bars</Badge></div>}>
      <StockPriceChart prices={prices} levels={chartLevels} isLoading={pricesQuery.isLoading} error={priceError} />
    </Panel>

    <Panel title="Data provenance & coverage" description="Shows where this page's price data came from. Query update time is browser-side load time, not a provider-confirmed exchange timestamp." icon={<Database className="size-4" />}>
      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <div className="rounded-lg border border-[var(--app-border)] p-3"><div className="text-[10px] uppercase text-[var(--app-text-muted)]">Provider</div><div className="mt-1 font-semibold">{provider.name}</div><div className="mt-1 text-[10px] text-[var(--app-text-muted)]">ID: {providerId}</div></div>
        <div className="rounded-lg border border-[var(--app-border)] p-3"><div className="text-[10px] uppercase text-[var(--app-text-muted)]">Latest candle</div><div className="mt-1 font-semibold">{last?.date ?? "N/A"}</div><div className="mt-1 text-[10px] text-[var(--app-text-muted)]">Daily price series</div></div>
        <div className="rounded-lg border border-[var(--app-border)] p-3"><div className="text-[10px] uppercase text-[var(--app-text-muted)]">Loaded into browser</div><div className="mt-1 font-semibold">{pricesQuery.data?.loadedAt ? new Date(pricesQuery.data.loadedAt).toLocaleString() : "N/A"}</div><div className="mt-1 text-[10px] text-[var(--app-text-muted)]">Client query resolution</div></div>
        <div className="rounded-lg border border-[var(--app-border)] p-3"><div className="text-[10px] uppercase text-[var(--app-text-muted)]">History coverage</div><div className="mt-1 font-semibold">{prices.length >= 200 ? "Long history" : prices.length >= 60 ? "Usable for T+" : "Limited history"}</div><div className="mt-1 text-[10px] text-[var(--app-text-muted)]">{prices.length} sessions loaded</div></div>
      </div>
      <div className="mt-3 rounded-lg bg-[var(--app-panel-muted)] p-3 text-xs leading-5 text-[var(--app-text-muted)]">{providerNote} {benchmark.length ? `VNINDEX benchmark bars available: ${benchmark.length}.` : "VNINDEX benchmark data is unavailable; excess-return and correlation features may show N/A."} Fundamental amounts use provider-supplied numeric units with compact notation; confirm scale with the provider's schema before comparing values.</div>
      {(priceError || companyError || fundamentalsError || benchmarkQuery.isError) && <div className="mt-3 space-y-2 rounded-lg border border-amber-500/30 bg-amber-500/5 p-3 text-xs text-amber-700 dark:text-amber-300">
        {priceError && <div>Price data: {priceError}</div>}{companyError && <div>Company profile: {companyError}</div>}{fundamentalsError && <div>Fundamentals: {fundamentalsError}</div>}{benchmarkQuery.isError && <div>Benchmark: VNINDEX data could not be loaded.</div>}
      </div>}
    </Panel>

    <Panel title="Market regime & sector context" description="The market regime is calculated from VNINDEX features plus breadth/participation inputs when those inputs are available. Demo breadth is identified by the regime hook; missing breadth must not be read as a real zero." icon={<Gauge className="size-4" />} action={regime && <Badge variant={regime.regime === "BULL" ? "success" : regime.regime === "PANIC" || regime.regime === "BEAR" ? "danger" : "warning"}>{regime.regime}</Badge>}>
      {!regime ? <div className="rounded-lg border border-dashed border-[var(--app-border)] p-4 text-xs text-[var(--app-text-muted)]">Market regime is waiting for VNINDEX historical data.</div> : <div className="space-y-4">
        <MetricGrid columns="grid-cols-2 sm:grid-cols-3 xl:grid-cols-5" items={[
          metric("Regime score", regime.score, 0), { label: "Model confidence", value: regime.confidence },
          metric("VNINDEX close", regime.metrics.close), percentMetric("VNINDEX return · 1D", regime.metrics.return1dPct),
          percentMetric("VNINDEX return · 20D", regime.metrics.return20dPct),
          { label: "Above EMA20", value: regime.breadth ? percentText(regime.breadth.aboveEma20Pct) : "N/A", detail: regime.breadth ? `${regime.breadth.totalStocks} stocks in breadth sample` : "Breadth feed not available" },
          { label: "Above EMA50", value: regime.breadth ? percentText(regime.breadth.aboveEma50Pct) : "N/A" },
          { label: "Advance / decline", value: regime.breadth ? `${regime.breadth.advanceCount} / ${regime.breadth.declineCount}` : "N/A" },
          percentMetric("ATR14 / index", regime.metrics.atr14Pct), metric("ADX14", regime.metrics.adx14, 1),
        ]} />
        <div className="grid gap-3 lg:grid-cols-3">
          <div className="rounded-lg border border-[var(--app-border)] p-4"><div className="mb-3 text-xs font-semibold">Regime components</div><div className="space-y-3">{Object.entries(regime.components).filter(([key]) => key !== "total").map(([key, value]) => <div key={key}><div className="mb-1 flex items-center justify-between text-[10px]"><span className="text-[var(--app-text-muted)]">{codeLabel(key)}</span><span className="font-semibold">{numberText(value, 0)}</span></div><div className="h-1.5 overflow-hidden rounded-full bg-[var(--app-panel-muted)]"><div className="h-full rounded-full bg-indigo-500" style={{ width: `${Math.max(0, Math.min(100, value))}%` }} /></div></div>)}</div></div>
          <div className="rounded-lg border border-[var(--app-border)] p-4"><div className="mb-3 flex items-center gap-2 text-xs font-semibold"><TrendingUp className="size-3.5 text-emerald-500" />Strongest sampled sectors</div><CodeList items={regime.strongestSectors.slice(0, 5).map((item) => `${item.sector}: ${percentText(item.return20)}`)} empty="Sector returns are not available." /></div>
          <div className="rounded-lg border border-[var(--app-border)] p-4"><div className="mb-3 flex items-center gap-2 text-xs font-semibold"><TrendingUp className="size-3.5 rotate-180 text-amber-500" />Weakest sampled sectors</div><CodeList items={regime.weakestSectors.slice(0, 5).map((item) => `${item.sector}: ${percentText(item.return20)}`)} empty="Sector returns are not available." tone="warning" /></div>
        </div>
        <div className="grid gap-3 md:grid-cols-2"><div className="rounded-lg border border-[var(--app-border)] p-4"><div className="mb-3 text-xs font-semibold">Regime reasons</div><CodeList items={regime.reasons} empty="No regime reason codes." /></div><div className="rounded-lg border border-[var(--app-border)] p-4"><div className="mb-3 text-xs font-semibold">Market warnings</div><CodeList items={regime.warnings} empty="No warnings emitted; not a guarantee of low risk." tone="warning" /></div></div>
      </div>}
    </Panel>

    <div className="grid gap-4 xl:grid-cols-2">
      <Panel title="Trend, volatility & price structure" icon={<Layers3 className="size-4" />} description="Daily features and rolling levels; N/A means the provider history does not support the calculation yet.">
        <MetricGrid items={[
          metric("EMA20", snapshot?.trend.ema20), metric("EMA50", snapshot?.trend.ema50), metric("EMA200", snapshot?.trend.ema200),
          { label: "Close vs EMA50", value: snapshot ? (closeVsEma50 ? "ABOVE" : "BELOW") : "N/A", tone: snapshot ? closeVsEma50 ? "positive" : "negative" : "normal" },
          { label: "Close vs EMA200", value: snapshot ? (closeVsEma200 ? "ABOVE" : "BELOW") : "N/A", tone: snapshot ? closeVsEma200 ? "positive" : "negative" : "normal" },
          metric("ADX14", snapshot?.trend.adx14, 1), metric("DI+ / DI-", snapshot ? snapshot.trend.diPlus14 - snapshot.trend.diMinus14 : undefined, 2, "Value shows DI spread"),
          metric("ATR14", snapshot?.trend.atr14), percentMetric("ATR14 / Close", snapshot && snapshot.close ? snapshot.trend.atr14 / snapshot.close * 100 : undefined),
          { label: "Structure state", value: snapshot?.priceStructure.state ?? "N/A" }, metric("20D high", snapshot?.priceStructure.high20), metric("20D low", snapshot?.priceStructure.low20),
          percentMetric("Range position · 20D", finite(snapshot?.priceStructure.rangePosition20) ? snapshot!.priceStructure.rangePosition20 * 100 : undefined),
          percentMetric("Distance from 20D high", snapshot?.priceStructure.distanceFromHigh20),
          { label: "HH / HL / LH / LL", value: snapshot ? [snapshot.priceStructure.hh ? "HH" : "", snapshot.priceStructure.hl ? "HL" : "", snapshot.priceStructure.lh ? "LH" : "", snapshot.priceStructure.ll ? "LL" : ""].filter(Boolean).join(" / ") || "None detected" : "N/A" },
        ]} />
      </Panel>

      <Panel title="Momentum & oscillators" icon={<Gauge className="size-4" />}>
        <MetricGrid items={[
          metric("RSI7", snapshot?.momentum.rsi7, 1), metric("RSI14", snapshot?.momentum.rsi14, 1), metric("RSI21", snapshot?.momentum.rsi21, 1),
          metric("MACD", snapshot?.momentum.macd, 3), metric("MACD signal", snapshot?.momentum.macdSignal, 3), metric("MACD histogram", snapshot?.momentum.macdHistogram, 3),
          percentMetric("ROC5", snapshot?.momentum.roc5), percentMetric("ROC20", snapshot?.momentum.roc20), metric("MFI14", snapshot?.momentum.mfi14, 1),
          metric("Stochastic %K", snapshot?.momentum.stochasticK14, 1), metric("Stochastic %D", snapshot?.momentum.stochasticD3, 1),
        ]} />
      </Panel>

      <Panel title="Volume, money flow & VSA" icon={<BarChart3 className="size-4" />}>
        <MetricGrid items={[
          metric("RVOL20", snapshot?.volume.rvol20), metric("RVOL60", snapshot?.volume.rvol60), metric("CMF20", snapshot?.volume.cmf20, 3),
          metric("OBV slope · 20D", snapshot?.volume.obvSlope20), metric("CLV", snapshot?.volume.clv, 3),
          metric("Up volume · 20D", snapshot?.volume.upVolume20, 0), metric("Down volume · 20D", snapshot?.volume.downVolume20, 0),
          { label: "VSA heuristic", value: snapshot?.volume.vsa ?? "N/A", detail: "Heuristic pattern, not a canonical Wyckoff classification" },
        ]} />
      </Panel>

      <Panel title="Relative strength & correlation" icon={<TrendingUp className="size-4" />} description="RS20/60/120 are this stock's own total returns. Excess return is shown separately against aligned VNINDEX sessions.">
        <MetricGrid items={[
          percentMetric("Stock return · 20D", snapshot?.relativeStrength.rs20), percentMetric("Stock return · 60D", snapshot?.relativeStrength.rs60), percentMetric("Stock return · 120D", snapshot?.relativeStrength.rs120),
          percentMetric("Excess vs VNINDEX · 20D", snapshot?.relativeStrength.returnVsBenchmark20), percentMetric("Excess vs VNINDEX · 60D", snapshot?.relativeStrength.returnVsBenchmark60), percentMetric("Excess vs VNINDEX · 120D", snapshot?.relativeStrength.returnVsBenchmark120),
          percentMetric("Sector relative · 20D", snapshot?.relativeStrength.sectorRelative20), metric("Correlation · 20D", snapshot?.correlation.corr20, 3),
          metric("Correlation · 60D", snapshot?.correlation.corr60, 3), metric("Correlation · 120D", snapshot?.correlation.corr120, 3),
          metric("Beta · 20D", snapshot?.correlation.beta20, 3), metric("Beta · 60D", snapshot?.correlation.beta60, 3), metric("Beta · 120D", snapshot?.correlation.beta120, 3),
        ]} />
      </Panel>

      <Panel title="Ichimoku & divergence" icon={<Activity className="size-4" />}>
        <MetricGrid items={[
          metric("Tenkan 9", snapshot?.ichimoku.tenkan9), metric("Kijun 26", snapshot?.ichimoku.kijun26),
          { label: "Cloud position", value: snapshot?.ichimoku.cloudPosition ?? "N/A" }, { label: "Future cloud", value: snapshot?.ichimoku.futureCloudDirection ?? "N/A" },
          metric("Cloud thickness", snapshot?.ichimoku.cloudThickness), percentMetric("Distance to cloud", snapshot?.ichimoku.distanceToCloud), metric("TK spread", snapshot?.ichimoku.tkSpread),
          { label: "RSI bullish divergence", value: snapshot ? valueLabel(snapshot.divergence.rsiBullish) : "N/A", tone: snapshot?.divergence.rsiBullish ? "positive" : "normal" },
          { label: "RSI bearish divergence", value: snapshot ? valueLabel(snapshot.divergence.rsiBearish) : "N/A", tone: snapshot?.divergence.rsiBearish ? "negative" : "normal" },
          { label: "MACD bullish divergence", value: snapshot ? valueLabel(snapshot.divergence.macdBullish) : "N/A", tone: snapshot?.divergence.macdBullish ? "positive" : "normal" },
          { label: "MACD bearish divergence", value: snapshot ? valueLabel(snapshot.divergence.macdBearish) : "N/A", tone: snapshot?.divergence.macdBearish ? "negative" : "normal" },
        ]} />
      </Panel>

      <Panel title="Volume Profile · approximate" icon={<BarChart3 className="size-4" />} description="Estimated from daily OHLCV. This is not equivalent to an intraday/tick-level volume profile.">
        <MetricGrid items={[
          metric("Point of control (POC)", featureResult?.volumeProfile.poc), metric("Value area high (VAH)", featureResult?.volumeProfile.vah), metric("Value area low (VAL)", featureResult?.volumeProfile.val),
          { label: "High-volume nodes", value: featureResult ? String(featureResult.volumeProfile.hvn.length) : "N/A" },
          { label: "Low-volume nodes", value: featureResult ? String(featureResult.volumeProfile.lvn.length) : "N/A" },
          { label: "Method", value: featureResult?.volumeProfile.approximate ? "Approximate" : "N/A", tone: "warning" },
        ]} />
        {featureResult?.volumeProfile.bins.length ? <div className="mt-3 space-y-2">
          <div className="text-[10px] font-semibold uppercase tracking-wide text-[var(--app-text-muted)]">Largest volume bins</div>
          {[...featureResult.volumeProfile.bins].sort((a, b) => b.volume - a.volume).slice(0, 4).map((bin) => <div key={`${bin.low}-${bin.high}`} className="grid grid-cols-[110px_1fr_56px] items-center gap-2 text-[10px]"><span>{numberText(bin.low)}–{numberText(bin.high)}</span><div className="h-2 overflow-hidden rounded-full bg-[var(--app-panel-muted)]"><div className="h-full rounded-full bg-blue-500/70" style={{ width: `${Math.max(2, bin.share * 100)}%` }} /></div><span className="text-right text-[var(--app-text-muted)]">{percentText(bin.share * 100, 1)}</span></div>)}
        </div> : <div className="mt-3 text-xs text-[var(--app-text-muted)]">Volume Profile requires valid historical bars.</div>}
      </Panel>
    </div>

    <Panel title="T+ Engine · 3–15 sessions" icon={<Target className="size-4" />} description="Daily signal: regime → setup validation → score → entry/stop/targets → risk/reward. Not a guaranteed forecast." action={tplus && <Badge variant={tplus.signal.action === "BUY" ? "success" : tplus.signal.action === "NO_TRADE" ? "danger" : "warning"}>{tplus.signal.action}</Badge>}>
      {!tplus ? <div className="rounded-lg border border-dashed border-[var(--app-border)] p-4 text-xs text-[var(--app-text-muted)]">{prices.length < 60 ? `Need at least 60 daily bars; received ${prices.length}.` : !regime ? "Waiting for VNINDEX market-regime context." : "T+ signal is unavailable for this data set."}</div> : <div className="space-y-4">
        <MetricGrid columns="grid-cols-2 sm:grid-cols-3 xl:grid-cols-5" items={[
          { label: "Setup", value: tplus.signal.setup }, { label: "Opportunity score", value: String(tplus.signal.opportunityScore) },
          { label: "Trade quality", value: tplus.signal.tradeQuality }, { label: "Confidence", value: tplus.signal.confidence },
          { label: "Market regime", value: tplus.signal.marketRegime, detail: tplus.signal.strategyVersion },
        ]} />
        <div className="grid gap-3 lg:grid-cols-2">
          <div className="rounded-lg border border-[var(--app-border)] p-4"><div className="mb-3 text-xs font-semibold">Trade plan</div><MetricGrid columns="grid-cols-2 sm:grid-cols-3" items={[
            { label: "Entry zone", value: tplus.signal.entryZone ? `${numberText(tplus.signal.entryZone.low)}–${numberText(tplus.signal.entryZone.high)}` : "N/A" },
            { label: "Stop loss", value: numberText(tplus.signal.stopLoss) }, { label: "TP1", value: numberText(tplus.signal.tp1) },
            { label: "TP2", value: numberText(tplus.signal.tp2) }, metric("R:R to TP1", tplus.signal.riskReward), metric("R:R to TP2", tplus.signal.riskRewardTp2),
          ]} /><div className="mt-3 rounded-md bg-[var(--app-panel-muted)] p-3 text-xs leading-5"><span className="font-semibold">Trigger:</span> {tplus.signal.trigger ?? "No trigger defined"}</div></div>
          <div className="rounded-lg border border-[var(--app-border)] p-4"><div className="mb-3 text-xs font-semibold">Opportunity score decomposition</div><div className="space-y-3">{Object.entries(tplus.signal.scoreBreakdown).filter(([key]) => key !== "total").map(([key, value]) => <div key={key}><div className="mb-1 flex items-center justify-between gap-3 text-[10px]"><span className="text-[var(--app-text-muted)]">{codeLabel(key)}</span><span className="font-semibold tabular-nums">{numberText(value, 0)}</span></div><div className="h-1.5 overflow-hidden rounded-full bg-[var(--app-panel-muted)]"><div className="h-full rounded-full bg-blue-500" style={{ width: `${Math.max(0, Math.min(100, Number(value)))}%` }} /></div></div>)}</div></div>
        </div>
        <div className="grid gap-3 md:grid-cols-2"><div className="rounded-lg border border-[var(--app-border)] p-4"><div className="mb-3 text-xs font-semibold">Why this signal?</div><CodeList items={tplus.signal.reasons} empty="No positive reason codes." /></div><div className="rounded-lg border border-[var(--app-border)] p-4"><div className="mb-3 text-xs font-semibold">Risks / invalidation</div><CodeList items={tplus.signal.risks} empty="No risk codes emitted; this does not mean risk-free." tone="warning" /></div></div>
      </div>}
    </Panel>

    <Panel title="Hold Engine · 3+ months" icon={<BookOpen className="size-4" />} description="Quality, growth, balance sheet/cash flow, valuation, long-term trend and catalyst/risk. Missing fundamentals are shown as data gaps, not interpreted as verified facts." action={hold && <Badge variant={hold.signal.action === "BUY" ? "success" : hold.signal.action === "NO_TRADE" ? "danger" : "warning"}>{hold.signal.action}</Badge>}>
      {!hold ? <div className="rounded-lg border border-dashed border-[var(--app-border)] p-4 text-xs text-[var(--app-text-muted)]">{prices.length < 60 ? `Need at least 60 daily bars; received ${prices.length}.` : !company ? "Company profile unavailable." : !fundamentals ? "Fundamentals are not available from the selected provider." : "Hold signal is unavailable for this data set."}</div> : <div className="space-y-4">
        <MetricGrid columns="grid-cols-2 sm:grid-cols-3 xl:grid-cols-5" items={[
          { label: "Score", value: String(hold.signal.score) }, { label: "Quality", value: hold.signal.quality },
          { label: "Confidence", value: hold.signal.confidence }, { label: "Data completeness", value: `${hold.signal.dataCompleteness}%` },
          { label: "Valuation", value: hold.signal.valuationLabel }, { label: "Long-term trend", value: hold.signal.longTermTrend },
          { label: "Horizon", value: `${hold.signal.horizonMonths}+ months` }, { label: "Sector", value: hold.signal.sector },
          { label: "Strategy", value: hold.signal.strategyVersion },
        ]} />
        <div className="grid gap-3 lg:grid-cols-2">
          <div className="rounded-lg border border-[var(--app-border)] p-4"><div className="mb-3 text-xs font-semibold">Hold score decomposition</div><div className="space-y-3">{hold.signal.components.map((component) => <div key={component.key}><div className="mb-1 flex items-center justify-between gap-3 text-[10px]"><span className="text-[var(--app-text-muted)]">{codeLabel(component.key)} · {component.available ? `${Math.round(component.weight * 100)}% weight` : "not available"}</span><span className="font-semibold tabular-nums">{component.available ? numberText(component.score, 0) : "N/A"}</span></div><div className="h-1.5 overflow-hidden rounded-full bg-[var(--app-panel-muted)]"><div className={`h-full rounded-full ${component.available ? "bg-cyan-500" : "bg-slate-400"}`} style={{ width: `${component.available ? Math.max(0, Math.min(100, component.score)) : 0}%` }} /></div><div className="mt-1 text-[10px] text-[var(--app-text-muted)]">{component.available ? "Included in available evidence" : component.risks.map(codeLabel).join(", ") || "Missing evidence"}</div></div>)}</div></div>
          <div className="rounded-lg border border-[var(--app-border)] p-4"><div className="mb-3 text-xs font-semibold">Long-term thesis</div><div className="grid gap-2 sm:grid-cols-2"><div className="rounded-lg bg-[var(--app-panel-muted)] p-3"><div className="text-[10px] uppercase text-[var(--app-text-muted)]">Catalysts</div><div className="mt-2 space-y-1 text-xs">{(hold.signal.catalysts.length ? hold.signal.catalysts : ["No catalyst data supplied"]).map((item) => <div key={item}>+ {codeLabel(item)}</div>)}</div></div><div className="rounded-lg bg-[var(--app-panel-muted)] p-3"><div className="text-[10px] uppercase text-[var(--app-text-muted)]">Risk factors</div><div className="mt-2 space-y-1 text-xs">{(hold.signal.risks.length ? hold.signal.risks : ["No engine risk emitted; not risk-free"]).map((item) => <div key={item}>! {codeLabel(item)}</div>)}</div></div></div><div className="mt-3 text-[10px] text-[var(--app-text-muted)]">The confidence value is model confidence, not a calibrated win probability.</div></div>
        </div>
        <div className="grid gap-3 md:grid-cols-2"><div className="rounded-lg border border-[var(--app-border)] p-4"><div className="mb-3 text-xs font-semibold">Positive evidence</div><CodeList items={hold.signal.reasons} empty="No positive reason codes." /></div><div className="rounded-lg border border-[var(--app-border)] p-4"><div className="mb-3 text-xs font-semibold">Risks / data gaps</div><CodeList items={hold.signal.risks} empty="No risk codes emitted; this does not mean risk-free." tone="warning" /></div></div>
      </div>}
    </Panel>

    <Panel title="Fundamentals & valuation" description="Values below come from the selected provider. N/A means not supplied; it is not a zero value." icon={<Building2 className="size-4" />} action={fundamentals ? <Badge variant="success">Provider data available</Badge> : <Badge variant="warning">Data incomplete</Badge>}>
      <div className="space-y-5">
        <div><div className="mb-2 text-xs font-semibold">Business quality</div><MetricGrid items={fundamentalGroups.quality} /></div>
        <div><div className="mb-2 text-xs font-semibold">Growth</div><MetricGrid items={fundamentalGroups.growth} /></div>
        <div><div className="mb-2 text-xs font-semibold">Valuation</div><MetricGrid items={fundamentalGroups.valuation} /></div>
        <div><div className="mb-2 text-xs font-semibold">Balance sheet & cash flow</div><MetricGrid items={fundamentalGroups.balance} /></div>
        <div><div className="mb-2 text-xs font-semibold">Sector-specific metrics · {sector}</div><MetricGrid items={sectorGroup} /></div>
        <div className="rounded-lg border border-[var(--app-border)] bg-[var(--app-panel-muted)] p-3 text-[10px] leading-4 text-[var(--app-text-muted)]">
          <div>Source: {fundamentals?.source ?? provider.name} · Latest report period: {fundamentals?.latestPeriod ?? "N/A"}</div>
          <div>Sector valuation benchmark: {fundamentals?.sectorBenchmarkScope === "CURRENT_HOLD_SCAN_UNIVERSE" ? `current Hold scan universe (${fundamentals.sectorPeerCount ?? 0} peers)` : "not available from provider"}</div>
          <div>Available report periods — ratios: {fundamentals?.reportedPeriods?.ratios?.join(", ") || "N/A"}; income: {fundamentals?.reportedPeriods?.incomeStatement?.join(", ") || "N/A"}; balance sheet: {fundamentals?.reportedPeriods?.balanceSheet?.join(", ") || "N/A"}; cash flow: {fundamentals?.reportedPeriods?.cashFlow?.join(", ") || "N/A"}.</div>
          <div className="mt-1">Large financial values use compact notation only (K/M/B/T); currency and raw scale depend on provider schema. Missing fields remain N/A; derived values are only calculated when source rows and denominators are available.</div>
          {fundamentals?.notes?.length ? <ul className="mt-2 list-disc space-y-1 pl-4">{fundamentals.notes.map((note, index) => <li key={index}>{note}</li>)}</ul> : null}
        </div>
      </div>
    </Panel>

    <div className="grid gap-4 xl:grid-cols-3">
      <Panel title="Company profile" icon={<Building2 className="size-4" />}>
        <MetricGrid columns="grid-cols-2" items={[
          { label: "Symbol", value: company?.symbol ?? symbol }, { label: "Exchange", value: company?.exchange ?? "N/A" },
          { label: "Sector group", value: company?.sector ?? "N/A" }, { label: "Industry", value: company?.industry ?? "N/A" },
          { label: "ICB code / level", value: company?.industryCode ? `${company.industryCode} / ${company.industryLevel ?? "N/A"}` : "N/A" },
          { label: "Listing date", value: company?.listingDate?.slice(0, 10) ?? "N/A" },
          { label: "Issued shares", value: company?.issuedShares != null ? compactText(company.issuedShares) : "N/A" },
          { label: "Fundamental record", value: fundamentals ? fundamentals.symbol : "N/A" },
        ]} />
      </Panel>
      <Panel title="Catalysts from provider" icon={<TrendingUp className="size-4" />}>
        <CodeList items={notes.catalysts} empty="No catalyst data provided." />
      </Panel>
      <Panel title="Risks from provider" icon={<ShieldAlert className="size-4" />}>
        <CodeList items={notes.risks} empty="No provider risk notes supplied." tone="warning" />
      </Panel>
    </div>

    <Panel title="Research notes & interpretation" icon={<BookOpen className="size-4" />}>
      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <div className="rounded-lg border border-[var(--app-border)] p-3"><div className="flex items-center gap-2 text-xs font-semibold"><CalendarClock className="size-3.5" />Signal date</div><div className="mt-2 text-sm">{snapshot?.date ?? "N/A"}</div><div className="mt-1 text-[10px] text-[var(--app-text-muted)]">Signals are calculated from latest loaded daily bar.</div></div>
        <div className="rounded-lg border border-[var(--app-border)] p-3"><div className="flex items-center gap-2 text-xs font-semibold"><Wallet className="size-3.5" />Position planning</div><div className="mt-2 text-sm">Risk budget not applied here</div><div className="mt-1 text-[10px] text-[var(--app-text-muted)]">Position sizing and portfolio exposure are not part of this phase.</div></div>
        <div className="rounded-lg border border-[var(--app-border)] p-3"><div className="flex items-center gap-2 text-xs font-semibold"><CheckCircle2 className="size-3.5" />History readiness</div><div className="mt-2 text-sm">{highEnoughHistory ? "200+ sessions" : `${prices.length} sessions`}</div><div className="mt-1 text-[10px] text-[var(--app-text-muted)]">Some long-period indicators require at least 200 bars.</div></div>
        <div className="rounded-lg border border-[var(--app-border)] p-3"><div className="flex items-center gap-2 text-xs font-semibold"><Database className="size-3.5" />Data limitations</div><div className="mt-2 text-sm">{providerId === "mock" ? "Synthetic sample" : fundamentals ? "Provider-dependent" : "Fundamentals missing"}</div><div className="mt-1 text-[10px] text-[var(--app-text-muted)]">Review missing fields and source units before acting on a signal.</div></div>
      </div>
    </Panel>

    <div className="flex flex-wrap items-center justify-between gap-3 border-t border-[var(--app-border)] pt-4 text-[10px] text-[var(--app-text-muted)]">
      <div className="flex items-center gap-2"><Database className="size-3.5" />{provider.name} · {status.label} · Latest daily date: {last?.date ?? "N/A"}</div>
      <div className="flex items-center gap-3"><Link to="/settings" className="underline underline-offset-2">Provider settings</Link><Link to="/hold" className="underline underline-offset-2">Hold scanner</Link></div>
    </div>
  </div>
}
