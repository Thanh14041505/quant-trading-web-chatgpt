import { useMemo, useState } from "react"
import type { OHLCV } from "@/models/market"
import { aggregateOhlcv, calculateEma, selectChartRange } from "./chart-series"
import type { ChartInterval, ChartRange } from "./chart-series"

type Overlay = "ema20" | "ema50" | "volume"

export interface ChartPriceLevel {
  label: string
  value?: number
  color: string
  dash?: boolean
}

interface StockPriceChartProps {
  prices: OHLCV[]
  levels?: ChartPriceLevel[]
  isLoading?: boolean
  error?: string
}

const WIDTH = 1200
const HEIGHT = 440
const LEFT = 72
const RIGHT = 82
const TOP = 20
const PRICE_BOTTOM = 278
const VOLUME_TOP = 304
const VOLUME_BOTTOM = 378
const LABEL_Y = 417

function formatPrice(value: number) {
  return value.toLocaleString("en-US", { maximumFractionDigits: 2, minimumFractionDigits: 2 })
}

function formatVolume(value: number) {
  return new Intl.NumberFormat("en-US", { notation: "compact", maximumFractionDigits: 1 }).format(value)
}

function formatDate(date: string, interval: ChartInterval) {
  const parsed = new Date(`${date}T12:00:00`)
  return parsed.toLocaleDateString("en-GB", interval === "1M" ? { month: "short", year: "2-digit" } : { day: "2-digit", month: "short" })
}

function toggleClass(active: boolean) {
  return `rounded-md border px-2.5 py-1.5 text-[11px] font-semibold transition ${active ? "border-blue-500/40 bg-blue-500/10 text-blue-600 dark:text-blue-300" : "border-[var(--app-border)] text-[var(--app-text-muted)] hover:bg-[var(--app-panel-muted)]"}`
}

export function StockPriceChart({ prices, levels = [], isLoading = false, error }: StockPriceChartProps) {
  const [interval, setInterval] = useState<ChartInterval>("1D")
  const [range, setRange] = useState<ChartRange>("6M")
  const [overlays, setOverlays] = useState<Set<Overlay>>(new Set(["ema20", "ema50", "volume"]))
  const [hoverIndex, setHoverIndex] = useState<number | null>(null)

  const aggregate = useMemo(() => aggregateOhlcv(prices, interval), [interval, prices])
  const ema20 = useMemo(() => calculateEma(aggregate.map((bar) => bar.close), 20), [aggregate])
  const ema50 = useMemo(() => calculateEma(aggregate.map((bar) => bar.close), 50), [aggregate])
  const selection = useMemo(() => selectChartRange(aggregate, range, interval), [aggregate, interval, range])
  const bars = selection.data
  const offset = selection.startIndex
  const visibleEma20 = ema20.slice(offset)
  const visibleEma50 = ema50.slice(offset)

  const geometry = useMemo(() => {
    if (!bars.length) return null
    const shownValues = bars.flatMap((bar, index) => [bar.high, bar.low, ...(Number.isFinite(visibleEma20[index]) ? [visibleEma20[index]] : []), ...(Number.isFinite(visibleEma50[index]) ? [visibleEma50[index]] : [])])
    let minPrice = Math.min(...shownValues)
    let maxPrice = Math.max(...shownValues)
    const padding = Math.max((maxPrice - minPrice) * 0.06, Math.abs(maxPrice) * 0.005, 0.01)
    minPrice -= padding
    maxPrice += padding
    const plotWidth = WIDTH - LEFT - RIGHT
    const plotHeight = PRICE_BOTTOM - TOP
    const step = plotWidth / bars.length
    const maxVolume = Math.max(1, ...bars.map((bar) => bar.volume))
    const x = (index: number) => LEFT + step * index + step / 2
    const y = (value: number) => TOP + ((maxPrice - value) / (maxPrice - minPrice)) * plotHeight
    const vy = (value: number) => VOLUME_BOTTOM - (value / maxVolume) * (VOLUME_BOTTOM - VOLUME_TOP)
    const linePoints = (values: number[]) => values.map((value, index) => Number.isFinite(value) ? `${x(index).toFixed(2)},${y(value).toFixed(2)}` : "").filter(Boolean).join(" ")
    const priceTicks = Array.from({ length: 5 }, (_, index) => maxPrice - ((maxPrice - minPrice) * index) / 4)
    const tickCount = Math.min(6, bars.length)
    const dateTicks = Array.from({ length: tickCount }, (_, index) => {
      const sourceIndex = tickCount <= 1 ? 0 : Math.round((index * (bars.length - 1)) / (tickCount - 1))
      return { index: sourceIndex, date: bars[sourceIndex]?.date ?? "" }
    })
    return { minPrice, maxPrice, maxVolume, plotWidth, plotHeight, step, x, y, vy, linePoints, priceTicks, dateTicks }
  }, [bars, visibleEma20, visibleEma50])

  const activeBar = hoverIndex != null ? bars[hoverIndex] : bars.at(-1)
  const toggleOverlay = (overlay: Overlay) => setOverlays((current) => {
    const next = new Set(current)
    if (next.has(overlay)) next.delete(overlay)
    else next.add(overlay)
    return next
  })

  if (isLoading && !prices.length) {
    return <div className="terminal-grid flex h-[360px] items-center justify-center rounded-lg border border-[var(--app-border)] text-sm text-[var(--app-text-muted)]">Loading historical price data…</div>
  }
  if (error && !prices.length) {
    return <div className="flex h-[360px] flex-col items-center justify-center gap-2 rounded-lg border border-dashed border-[var(--app-border)] px-6 text-center"><div className="text-sm font-semibold">Price chart unavailable</div><div className="max-w-lg text-xs text-[var(--app-text-muted)]">{error}</div></div>
  }
  if (!geometry || !bars.length) {
    return <div className="flex h-[360px] items-center justify-center rounded-lg border border-dashed border-[var(--app-border)] text-sm text-[var(--app-text-muted)]">No historical bars available for this symbol.</div>
  }

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex flex-wrap items-center gap-1.5" aria-label="Chart interval">
          {(["1D", "1W", "1M"] as const).map((item) => <button key={item} type="button" className={toggleClass(interval === item)} aria-pressed={interval === item} onClick={() => { setInterval(item); setHoverIndex(null) }}>{item}</button>)}
          <span className="mx-1 h-5 w-px bg-[var(--app-border)]" />
          {(["3M", "6M", "1Y", "ALL"] as const).map((item) => <button key={item} type="button" className={toggleClass(range === item)} aria-pressed={range === item} onClick={() => setRange(item)}>{item}</button>)}
        </div>
        <div className="flex flex-wrap items-center gap-1.5">
          <button type="button" className={toggleClass(overlays.has("ema20"))} aria-pressed={overlays.has("ema20")} onClick={() => toggleOverlay("ema20")}><span className="mr-1 inline-block h-0.5 w-3 align-middle bg-amber-500" />EMA20</button>
          <button type="button" className={toggleClass(overlays.has("ema50"))} aria-pressed={overlays.has("ema50")} onClick={() => toggleOverlay("ema50")}><span className="mr-1 inline-block h-0.5 w-3 align-middle bg-cyan-500" />EMA50</button>
          <button type="button" className={toggleClass(overlays.has("volume"))} aria-pressed={overlays.has("volume")} onClick={() => toggleOverlay("volume")}>Volume</button>
        </div>
      </div>

      <div className="grid grid-cols-2 gap-2 rounded-lg bg-[var(--app-panel-muted)] p-3 text-xs sm:grid-cols-5">
        <div><div className="text-[10px] uppercase text-[var(--app-text-muted)]">Date</div><div className="mt-1 font-semibold">{activeBar?.date ?? "--"}</div></div>
        <div><div className="text-[10px] uppercase text-[var(--app-text-muted)]">Open</div><div className="mt-1 font-semibold">{activeBar ? formatPrice(activeBar.open) : "--"}</div></div>
        <div><div className="text-[10px] uppercase text-[var(--app-text-muted)]">High / Low</div><div className="mt-1 font-semibold">{activeBar ? `${formatPrice(activeBar.high)} / ${formatPrice(activeBar.low)}` : "--"}</div></div>
        <div><div className="text-[10px] uppercase text-[var(--app-text-muted)]">Close</div><div className={`mt-1 font-semibold ${activeBar && activeBar.close >= activeBar.open ? "text-emerald-600 dark:text-emerald-400" : "text-red-600 dark:text-red-400"}`}>{activeBar ? formatPrice(activeBar.close) : "--"}</div></div>
        <div><div className="text-[10px] uppercase text-[var(--app-text-muted)]">Volume</div><div className="mt-1 font-semibold">{activeBar ? formatVolume(activeBar.volume) : "--"}</div></div>
      </div>

      <div className="terminal-grid overflow-hidden rounded-lg border border-[var(--app-border)]">
        <svg viewBox={`0 0 ${WIDTH} ${HEIGHT}`} className="block h-auto max-h-[480px] w-full" role="img" aria-label={`OHLCV price chart with volume and moving averages, ${interval} interval`} onMouseLeave={() => setHoverIndex(null)}>
          {geometry.priceTicks.map((tick) => {
            const y = geometry.y(tick)
            return <g key={tick}><line x1={LEFT} x2={WIDTH - RIGHT} y1={y} y2={y} stroke="var(--app-border)" strokeDasharray="3 5" strokeWidth="1" /><text x={WIDTH - RIGHT + 10} y={y + 4} fontSize="12" fill="var(--app-text-muted)">{formatPrice(tick)}</text></g>
          })}
          <line x1={LEFT} x2={WIDTH - RIGHT} y1={VOLUME_TOP - 12} y2={VOLUME_TOP - 12} stroke="var(--app-border)" />
          <text x={LEFT} y={VOLUME_TOP - 18} fontSize="11" fill="var(--app-text-muted)">VOLUME</text>
          {levels.filter((level) => Number.isFinite(level.value) && level.value! >= geometry.minPrice && level.value! <= geometry.maxPrice).map((level) => {
            const y = geometry.y(level.value!)
            return <g key={`${level.label}-${level.value}`}>
              <line x1={LEFT} x2={WIDTH - RIGHT} y1={y} y2={y} stroke={level.color} strokeWidth="1.4" strokeDasharray={level.dash ? "6 4" : "2 4"} opacity="0.88" />
              <text x={LEFT + 5} y={y - 4} fontSize="10" fill={level.color} paintOrder="stroke" stroke="var(--app-panel)" strokeWidth="3">{level.label}</text>
            </g>
          })}

          {bars.map((bar, index) => {
            const x = geometry.x(index)
            const up = bar.close >= bar.open
            const bodyTop = geometry.y(Math.max(bar.open, bar.close))
            const bodyBottom = geometry.y(Math.min(bar.open, bar.close))
            const bodyWidth = Math.max(2.2, Math.min(11, geometry.step * 0.65))
            const volumeTop = geometry.vy(bar.volume)
            const hovered = hoverIndex === index
            return <g key={`${bar.date}-${index}`} onMouseEnter={() => setHoverIndex(index)} className="cursor-crosshair">
              {hovered && <line x1={x} x2={x} y1={TOP} y2={VOLUME_BOTTOM} stroke="var(--app-text-muted)" strokeDasharray="3 3" opacity="0.8" />}
              <line x1={x} x2={x} y1={geometry.y(bar.high)} y2={geometry.y(bar.low)} stroke={up ? "#10b981" : "#ef4444"} strokeWidth="1.4" />
              <rect x={x - bodyWidth / 2} y={bodyTop} width={bodyWidth} height={Math.max(1.6, bodyBottom - bodyTop)} rx="0.7" fill={up ? "#10b981" : "#ef4444"} opacity={hovered ? 1 : 0.88} />
              {overlays.has("volume") && <rect x={x - bodyWidth / 2} y={volumeTop} width={bodyWidth} height={Math.max(1, VOLUME_BOTTOM - volumeTop)} fill={up ? "#10b981" : "#ef4444"} opacity="0.48" />}
            </g>
          })}

          {overlays.has("ema20") && <polyline points={geometry.linePoints(visibleEma20.map((value) => Number.isFinite(value) ? value : Number.NaN))} fill="none" stroke="#f59e0b" strokeWidth="2" strokeLinejoin="round" strokeLinecap="round" />}
          {overlays.has("ema50") && <polyline points={geometry.linePoints(visibleEma50.map((value) => Number.isFinite(value) ? value : Number.NaN))} fill="none" stroke="#06b6d4" strokeWidth="2" strokeLinejoin="round" strokeLinecap="round" />}

          {geometry.dateTicks.map((tick) => <g key={`${tick.index}-${tick.date}`}><line x1={geometry.x(tick.index)} x2={geometry.x(tick.index)} y1={VOLUME_BOTTOM + 3} y2={VOLUME_BOTTOM + 7} stroke="var(--app-border)" /><text x={geometry.x(tick.index)} y={LABEL_Y} textAnchor="middle" fontSize="12" fill="var(--app-text-muted)">{formatDate(tick.date, interval)}</text></g>)}
        </svg>
      </div>
      <div className="flex flex-wrap items-center justify-between gap-2 text-[10px] text-[var(--app-text-muted)]">
        <div className="flex flex-wrap gap-3"><span>{bars.length} bars shown</span><span>Volume Profile is shown separately as a daily-OHLCV approximation</span></div>
        <div>Green = close ≥ open · Red = close &lt; open</div>
      </div>
    </div>
  )
}
