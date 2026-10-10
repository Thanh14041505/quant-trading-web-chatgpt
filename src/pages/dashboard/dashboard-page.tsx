import { Activity, AlertTriangle, BarChart3, Gauge, Layers3, RefreshCw, ShieldAlert, TrendingDown, TrendingUp, Zap } from "lucide-react"
import { Link } from "react-router-dom"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { PageHeader } from "@/components/common/page-header"
import { StatCard } from "@/components/common/stat-card"
import { useMarketRegime } from "@/hooks/useMarketRegime"
import type { MarketRegime } from "@/quant/regime"

const setupFixtures = [
  { symbol: "HAH", setup: "Breakout", score: 86, action: "BUY", rr: "2.4" },
  { symbol: "GMD", setup: "Pullback", score: 81, action: "WATCH", rr: "2.1" },
  { symbol: "DXP", setup: "Momentum", score: 78, action: "WATCH", rr: "1.8" },
]

function regimeVariant(regime?: MarketRegime) {
  if (regime === "BULL" || regime === "BULL_PULLBACK") return "success" as const
  if (regime === "BEAR" || regime === "PANIC") return "danger" as const
  if (regime === "DISTRIBUTION") return "warning" as const
  return "muted" as const
}

function formatPct(value?: number) {
  return value == null || !Number.isFinite(value) ? "--" : `${value >= 0 ? "+" : ""}${value.toFixed(2)}%`
}

function scoreLabel(value?: number) {
  return value == null || !Number.isFinite(value) ? "--" : value.toFixed(0)
}

export function DashboardPage() {
  const { regime, isLoading, isError, error, breadthIsSample, refresh } = useMarketRegime()
  const market = regime?.metrics
  const breadth = regime?.breadth
  return <div className="space-y-6">
    <PageHeader
      eyebrow="Market overview"
      title="Quant Dashboard"
      description="Regime, breadth, sector context and the strongest current setups — all running client-side."
      actions={<div className="flex gap-2"><Button variant="outline" size="sm" onClick={() => void refresh()} disabled={isLoading}><RefreshCw className={`size-3.5 ${isLoading ? "animate-spin" : ""}`} /> Refresh snapshot</Button><Link to="/tplus"><Button size="sm">Open T+ scanner</Button></Link></div>}
    />

    <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
      <StatCard label="VNINDEX" value={market?.close.toFixed(2) ?? "--"} change={formatPct(market?.return1dPct)} icon={<Activity className="size-4" />} />
      <StatCard label="Market Regime" value={regime?.regime ?? "LOADING"} change={regime ? `Score ${scoreLabel(regime.score)} · ${regime.confidence}` : ""} icon={<Gauge className="size-4" />} />
      <StatCard label="Stocks > EMA50" value={breadth ? `${breadth.aboveEma50Pct.toFixed(0)}%` : "--"} change={breadth ? `${breadth.advanceCount} adv · ${breadth.declineCount} dec` : "Universe unavailable"} icon={<BarChart3 className="size-4" />} />
      <StatCard label="Volatility" value={market ? `${market.atr14Pct.toFixed(2)}%` : "--"} change={market?.volatilityExpansion ? "Expansion" : "Contained"} icon={<Zap className="size-4" />} />
    </div>

    <div className="grid gap-4 lg:grid-cols-[1.55fr_1fr]">
      <Card className="overflow-hidden">
        <CardHeader className="flex-row items-center justify-between">
          <div><CardTitle>Market regime</CardTitle><p className="mt-1 text-xs text-[var(--app-text-muted)]">Composite view of trend, breadth, momentum, volatility and participation.</p></div>
          <Badge variant={regimeVariant(regime?.regime)}>{regime?.regime ?? "LOADING"}</Badge>
        </CardHeader>
        <CardContent>
          {isError && <div className="mb-4 rounded-lg border border-red-500/20 bg-red-500/5 p-4 text-xs text-red-500">Unable to load market index: {error instanceof Error ? error.message : "Unknown error"}</div>}
          <div className="rounded-xl border border-[var(--app-border)] bg-[var(--app-panel-muted)] p-5 terminal-grid">
            <div className="grid gap-5 sm:grid-cols-5">
              {[
                ["Trend", regime?.components.trend],
                ["Breadth", regime?.components.breadth],
                ["Momentum", regime?.components.momentum],
                ["Volatility", regime?.components.volatility],
                ["Participation", regime?.components.participation],
              ].map(([label, score]) => <div key={label as string}><div className="text-[10px] uppercase tracking-[0.18em] text-[var(--app-text-muted)]">{label}</div><div className="mt-1 text-xl font-semibold">{scoreLabel(score as number)}</div><div className="mt-2 h-1.5 overflow-hidden rounded-full bg-slate-500/10"><div className="h-full rounded-full bg-blue-500" style={{ width: `${Math.max(0, Math.min(100, Number(score ?? 0)))}%` }} /></div></div>)}
            </div>
          </div>

          <div className="mt-5 grid gap-3 sm:grid-cols-3">
            <div className="rounded-lg border border-[var(--app-border)] p-4"><div className="flex items-center justify-between"><span className="text-xs text-[var(--app-text-muted)]">Index trend</span>{market?.trendAligned ? <TrendingUp className="size-4 text-emerald-500" /> : <TrendingDown className="size-4 text-amber-500" />}</div><div className="mt-2 font-semibold">{market?.trendAligned ? "Aligned" : "Mixed"}</div><div className="mt-1 text-xs text-[var(--app-text-muted)]">EMA20 / EMA50 / EMA200</div></div>
            <div className="rounded-lg border border-[var(--app-border)] p-4"><div className="flex items-center justify-between"><span className="text-xs text-[var(--app-text-muted)]">Advance / Decline</span><Layers3 className="size-4 text-blue-500" /></div><div className="mt-2 font-semibold">{breadth ? `${breadth.advanceCount} / ${breadth.declineCount}` : "--"}</div><div className="mt-1 text-xs text-[var(--app-text-muted)]">A/D ratio {breadth ? breadth.advanceDeclineRatio.toFixed(2) : "--"}</div></div>
            <div className="rounded-lg border border-[var(--app-border)] p-4"><div className="flex items-center justify-between"><span className="text-xs text-[var(--app-text-muted)]">Risk flags</span><ShieldAlert className="size-4 text-amber-500" /></div><div className="mt-2 font-semibold">{regime?.warnings.length ?? "--"}</div><div className="mt-1 text-xs text-[var(--app-text-muted)]">{regime?.warnings.slice(0, 2).join(" · ") || "No major warning"}</div></div>
          </div>

          <div className="mt-5 flex flex-wrap gap-2">
            {(regime?.reasons ?? []).map((reason) => <Badge key={reason} variant="success">✓ {reason}</Badge>)}
            {(regime?.warnings ?? []).map((warning) => <Badge key={warning} variant="warning"><AlertTriangle className="mr-1 size-3" />{warning}</Badge>)}
          </div>
          {breadthIsSample && <div className="mt-4 rounded-lg border border-amber-500/20 bg-amber-500/5 p-3 text-[11px] leading-5 text-[var(--app-text-muted)]">Breadth and sector data are currently derived from the Mock Provider sample universe. The real provider path will require a market-universe dataset before these metrics are treated as market-wide.</div>}
          {isLoading && <div className="mt-4 text-xs text-[var(--app-text-muted)]">Calculating market regime…</div>}
        </CardContent>
      </Card>

      <Card>
        <CardHeader><CardTitle>Sector rotation</CardTitle><p className="mt-1 text-xs text-[var(--app-text-muted)]">Relative 20-session performance supplied to the regime engine.</p></CardHeader>
        <CardContent className="space-y-3">
          {regime?.strongestSectors.length ? regime.strongestSectors.map((sector) => <div key={`strong-${sector.sector}`} className="flex items-center justify-between gap-4 rounded-lg border border-[var(--app-border)] px-3 py-2.5"><div className="flex items-center gap-2"><TrendingUp className="size-3.5 text-emerald-500" /><span className="text-sm">{sector.sector}</span></div><span className="font-semibold text-emerald-500">{formatPct(sector.return20)}</span></div>) : <div className="text-xs text-[var(--app-text-muted)]">No sector universe available.</div>}
          {regime?.weakestSectors.length ? <div className="pt-2 text-[10px] uppercase tracking-[0.18em] text-[var(--app-text-muted)]">Weakest</div> : null}
          {regime?.weakestSectors.map((sector) => <div key={`weak-${sector.sector}`} className="flex items-center justify-between gap-4 rounded-lg border border-[var(--app-border)] px-3 py-2.5"><div className="flex items-center gap-2"><TrendingDown className="size-3.5 text-red-500" /><span className="text-sm">{sector.sector}</span></div><span className="font-semibold text-red-500">{formatPct(sector.return20)}</span></div>)}
        </CardContent>
      </Card>
    </div>

    <Card>
      <CardHeader className="flex-row items-center justify-between"><div><CardTitle>Current setup monitor</CardTitle><p className="mt-1 text-xs text-[var(--app-text-muted)]">Temporary fixtures until Phase 6 wires setup detection and risk.</p></div><Badge variant="muted">Regime context: {regime?.regime ?? "--"}</Badge></CardHeader>
      <CardContent className="grid gap-3 md:grid-cols-3">
        {setupFixtures.map((setup) => <Link key={setup.symbol} to={`/stock/${setup.symbol}`} className="rounded-lg border border-[var(--app-border)] p-4 transition hover:border-blue-500/30 hover:bg-blue-500/5"><div className="flex items-center justify-between"><div className="font-semibold">{setup.symbol}</div><Badge variant={setup.action === "BUY" ? "success" : "warning"}>{setup.action}</Badge></div><div className="mt-3 flex items-end justify-between"><div><div className="text-xs text-[var(--app-text-muted)]">{setup.setup}</div><div className="mt-1 text-lg font-semibold">{setup.score}</div></div><div className="text-right"><div className="text-[10px] uppercase tracking-wide text-[var(--app-text-muted)]">R:R</div><div className="font-semibold">{setup.rr}</div></div></div></Link>)}
      </CardContent>
    </Card>
  </div>
}
