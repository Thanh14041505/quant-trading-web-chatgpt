import type { OHLCV } from "@/models/market"
import type { FeatureEngineResult } from "@/indicators/types"
import type { TradingSignal } from "@/quant/tplus"
import type { TplusSetupCandidate } from "@/quant/tplus"

export type EntryZoneStatus = "BELOW_ENTRY_ZONE" | "INSIDE_ENTRY_ZONE" | "ABOVE_ENTRY_ZONE" | "NO_ENTRY_ZONE"
export type HigherTimeframeBias = "UP" | "DOWN" | "RANGE" | "INSUFFICIENT_HISTORY"

export interface TplusExecutionDiagnostics {
  asOfDate: string
  referenceClose: number
  priceUnitNote: string
  rsUnitNote: string
  entryZoneStatus: EntryZoneStatus
  distanceToEntryLowPct?: number
  distanceToEntryMidPct?: number
  distanceToEntryHighPct?: number
  triggerPrice?: number
  triggerStatus: string
  mainBlockingReason: string
  nextActionRequired: string
  riskPctAtEntryLow?: number
  riskPctAtEntryMid?: number
  riskPctAtEntryHigh?: number
  rewardPctTp1AtEntryLow?: number
  rewardPctTp1AtEntryMid?: number
  rewardPctTp1AtEntryHigh?: number
  rewardPctTp2AtEntryMid?: number
  rrTp1AtEntryLow?: number
  rrTp1AtEntryMid?: number
  rrTp1AtEntryHigh?: number
  rrTp2AtEntryLow?: number
  rrTp2AtEntryMid?: number
  rrTp2AtEntryHigh?: number
  riskPctAtReferenceClose?: number
  rrTp1AtReferenceClose?: number
  validPlan: boolean
  validPlanRule: string
  tp1Model: string
  nearestResistance?: number
  nearestResistanceSource?: string
  structuralTp1Alternative?: number
  structuralRAtEntryMid?: number
  tp1ExceedsNearestResistance?: boolean
  resistanceDistanceFromEntryPct?: number
  trendStructureConflict: boolean
  rsiExtended: boolean
  rs60Extended: boolean
  lowRvol: boolean
  valueFieldCoverage20Count: number
  liquidityFlag: string
  liquidityBasis: "PROVIDER_VALUE_FIELD" | "CLOSE_TIMES_VOLUME_FALLBACK" | "MIXED_PROVIDER_VALUE_AND_CLOSE_VOLUME_FALLBACK"
  weeklyBias: HigherTimeframeBias
  monthlyBias: HigherTimeframeBias
  higherTimeframeRisk: "LOW" | "MEDIUM" | "HIGH"
  executionReadinessScore: number
  executionReadinessLabel: "LOW" | "MEDIUM" | "HIGH"
  actionableNow: boolean
  readinessNotes: string[]
}

type Input = {
  history: OHLCV[]
  features: FeatureEngineResult
  signal: TradingSignal
  candidate?: TplusSetupCandidate
}

const finite = (value: unknown): value is number => typeof value === "number" && Number.isFinite(value)
const pct = (value: number, base: number): number | undefined => base > 0 && Number.isFinite(value) ? (value / base - 1) * 100 : undefined
const rr = (target: number | undefined, entry: number, stop: number): number | undefined => target != null && entry > stop ? (target - entry) / (entry - stop) : undefined
const riskPct = (entry: number, stop: number): number | undefined => entry > stop && entry > 0 ? (entry - stop) / entry * 100 : undefined

function previousHigh(history: OHLCV[], lookback: number): number | undefined {
  if (history.length <= lookback) return undefined
  const prior = history.slice(history.length - lookback - 1, -1)
  if (!prior.length) return undefined
  const high = Math.max(...prior.map((bar) => bar.high))
  return Number.isFinite(high) ? high : undefined
}

function aggregateBars(history: OHLCV[], timeframe: "W" | "M"): OHLCV[] {
  const groups = new Map<string, OHLCV>()
  for (const bar of history) {
    const date = new Date(`${bar.date}T00:00:00Z`)
    if (!Number.isFinite(date.getTime())) continue
    let key: string
    if (timeframe === "M") {
      key = bar.date.slice(0, 7)
    } else {
      const day = date.getUTCDay()
      date.setUTCDate(date.getUTCDate() - ((day + 6) % 7))
      key = date.toISOString().slice(0, 10)
    }
    const existing = groups.get(key)
    if (!existing) {
      groups.set(key, { ...bar, date: key })
    } else {
      existing.high = Math.max(existing.high, bar.high)
      existing.low = Math.min(existing.low, bar.low)
      existing.close = bar.close
      existing.volume += bar.volume
      if (finite(existing.value) && finite(bar.value)) existing.value += bar.value
      else existing.value = undefined
    }
  }
  return [...groups.values()].sort((a, b) => a.date.localeCompare(b.date))
}

function ema(values: number[], period: number): number[] {
  if (!values.length) return []
  const alpha = 2 / (period + 1)
  const result = new Array<number>(values.length)
  result[0] = values[0]
  for (let index = 1; index < values.length; index += 1) {
    result[index] = values[index] * alpha + result[index - 1] * (1 - alpha)
  }
  return result
}

function higherTimeframeBias(history: OHLCV[], timeframe: "W" | "M"): HigherTimeframeBias {
  const bars = aggregateBars(history, timeframe)
  const period = timeframe === "W" ? 20 : 12
  if (bars.length < period) return "INSUFFICIENT_HISTORY"
  const averages = ema(bars.map((bar) => bar.close), period)
  const current = averages[averages.length - 1]
  const compareIndex = Math.max(0, averages.length - Math.min(5, averages.length - 1))
  const slope = current - averages[compareIndex]
  const close = bars[bars.length - 1].close
  if (close > current && slope > 0) return "UP"
  if (close < current && slope < 0) return "DOWN"
  return "RANGE"
}

function nearestStructuralResistance(features: FeatureEngineResult, history: OHLCV[], entryMid: number): { value?: number; source?: string; all: Array<{ value: number; source: string }> } {
  const candidates: Array<{ value: number; source: string }> = []
  for (const [lookback, source] of [[20, "PRIOR_HIGH_20D"], [50, "PRIOR_HIGH_50D"], [120, "PRIOR_HIGH_120D"]] as const) {
    const value = previousHigh(history, lookback)
    if (value != null && value > entryMid) candidates.push({ value, source })
  }
  const profile = features.volumeProfile
  if (finite(profile.vah) && profile.vah > entryMid) candidates.push({ value: profile.vah, source: "APPROX_VOLUME_PROFILE_VAH" })
  if (finite(profile.poc) && profile.poc > entryMid) candidates.push({ value: profile.poc, source: "APPROX_VOLUME_PROFILE_POC" })
  profile.hvn.filter((value) => finite(value) && value > entryMid).forEach((value) => candidates.push({ value, source: "APPROX_VOLUME_PROFILE_HVN" }))
  candidates.sort((a, b) => a.value - b.value)
  return { ...candidates[0], all: candidates }
}

function blockingReason(args: {
  action: string
  hasEntry: boolean
  validPlan: boolean
  distribution: boolean
  rsiExtended: boolean
  rs60Extended: boolean
  lowRvol: boolean
  riskPctAtMid?: number
  entryStatus: EntryZoneStatus
  entryHigh?: number
  structuralR?: number
  tp1ExceedsResistance: boolean
  setup: string
}) {
  if (!args.hasEntry || !args.validPlan) return { reason: "INVALID_OR_INCOMPLETE_TRADE_PLAN", next: "Review Entry, SL, TP1 and TP2; do not treat this row as trade-ready." }
  if (args.distribution) return { reason: "STRUCTURE_CONFLICT_DISTRIBUTION", next: "Wait for distribution to resolve; require price structure and continuation evidence to improve." }
  if (args.rsiExtended) return { reason: "RSI_EXTENDED", next: "Avoid chasing; wait for consolidation or a controlled pullback." }
  if (args.rs60Extended) return { reason: "RS60_EXTENDED_MOVE", next: "Review the 60-session move and wait for a new base or pullback." }
  if (args.entryHigh != null && args.close > args.entryHigh * 1.03) return { reason: "ENTRY_ZONE_MISSED", next: "Do not chase; wait for a newly calculated entry zone." }
  if (args.riskPctAtMid != null && args.riskPctAtMid > 7) return { reason: "WIDE_STOP_OVER_7_PERCENT", next: "Reassess position sizing and whether the setup fits a short T+ horizon." }
  if (args.entryStatus === "BELOW_ENTRY_ZONE") return { reason: "WAIT_FOR_ENTRY_ZONE", next: "Wait for price to reach the planned entry zone; do not buy before the zone." }
  if (args.entryStatus === "ABOVE_ENTRY_ZONE" && args.entryHigh != null) return { reason: "PRICE_ABOVE_ENTRY_ZONE", next: "Wait for a pullback or recalculate the entry zone; do not chase a missed plan." }
  if (args.lowRvol) return { reason: "LOW_RVOL", next: "Wait for participation/volume confirmation; do not assume momentum continuation." }
  if (args.tp1ExceedsResistance || (args.structuralR != null && args.structuralR < 1.6)) return { reason: "STRUCTURAL_REWARD_RISK_WEAK", next: "Compare the strategy target with the nearest resistance; require a better entry or a more realistic plan." }
  if (args.action === "BUY") return { reason: "CHECK_EXECUTION_TRIGGER", next: "Confirm trigger and price remain inside the valid entry zone before placing an order." }
  if (args.action === "WATCH" && args.setup === "BREAKOUT") return { reason: "WAIT_FOR_BREAKOUT_CONFIRMATION", next: "Wait for a confirmed breakout above the numeric trigger with sufficient volume; keep the original Action unchanged until the strategy gate is met." }
  if (args.action === "WATCH" && args.setup === "PULLBACK") return { reason: "WAIT_FOR_PULLBACK_CONFIRMATION", next: "Wait for price to return to the planned zone and confirm support; keep the original Action unchanged until the strategy gate is met." }
  if (args.action === "WATCH") return { reason: "STRATEGY_BUY_GATE_NOT_MET", next: "Review score, quality, confidence, market regime and setup trigger; keep WATCH until the original strategy Buy conditions are met." }
  if (args.action === "NO_TRADE") return { reason: "STRATEGY_NO_TRADE", next: "Do not open a position unless a fresh scan produces a valid plan." }
  return { reason: "WAIT_FOR_SETUP_CONFIRMATION", next: "Wait for the stated trigger and rescan when price/volume conditions materially change." }
}

/** Diagnostics only: does not change the strategy score, TP/SL or Action. */
export function buildTplusExecutionDiagnostics(input: Input) {
  const { history, features, signal, candidate } = input
  const latest = history[history.length - 1]
  const snapshot = features.snapshot
  const entryLow = signal.entryZone?.low
  const entryHigh = signal.entryZone?.high
  const entryMid = entryLow != null && entryHigh != null ? (entryLow + entryHigh) / 2 : undefined
  const stop = signal.stopLoss
  const tp1 = signal.tp1
  const tp2 = signal.tp2
  const hasEntry = entryLow != null && entryHigh != null && entryMid != null
  const close = latest?.close ?? snapshot.close
  const entryZoneStatus: EntryZoneStatus = !hasEntry ? "NO_ENTRY_ZONE" : close < entryLow! ? "BELOW_ENTRY_ZONE" : close > entryHigh! ? "ABOVE_ENTRY_ZONE" : "INSIDE_ENTRY_ZONE"
  const distanceToEntryLowPct = hasEntry ? pct(close, entryLow!) : undefined
  const distanceToEntryMidPct = hasEntry ? pct(close, entryMid!) : undefined
  const distanceToEntryHighPct = hasEntry ? pct(close, entryHigh!) : undefined
  const riskPctAtEntryLow = hasEntry && stop != null ? riskPct(entryLow!, stop) : undefined
  const riskPctAtEntryMid = hasEntry && stop != null ? riskPct(entryMid!, stop) : undefined
  const riskPctAtEntryHigh = hasEntry && stop != null ? riskPct(entryHigh!, stop) : undefined
  const rewardPctTp1AtEntryLow = hasEntry && tp1 != null ? pct(tp1, entryLow!) : undefined
  const rewardPctTp1AtEntryMid = hasEntry && tp1 != null ? pct(tp1, entryMid!) : undefined
  const rewardPctTp1AtEntryHigh = hasEntry && tp1 != null ? pct(tp1, entryHigh!) : undefined
  const rewardPctTp2AtEntryMid = hasEntry && tp2 != null ? pct(tp2, entryMid!) : undefined
  const rrTp1AtEntryLow = hasEntry && stop != null ? rr(tp1, entryLow!, stop) : undefined
  const rrTp1AtEntryMid = hasEntry && stop != null ? rr(tp1, entryMid!, stop) : undefined
  const rrTp1AtEntryHigh = hasEntry && stop != null ? rr(tp1, entryHigh!, stop) : undefined
  const rrTp2AtEntryLow = hasEntry && stop != null ? rr(tp2, entryLow!, stop) : undefined
  const rrTp2AtEntryMid = hasEntry && stop != null ? rr(tp2, entryMid!, stop) : undefined
  const rrTp2AtEntryHigh = hasEntry && stop != null ? rr(tp2, entryHigh!, stop) : undefined
  const riskPctAtReferenceClose = stop != null ? riskPct(close, stop) : undefined
  const rrTp1AtReferenceClose = stop != null ? rr(tp1, close, stop) : undefined
  const validPlan = hasEntry && stop != null && tp1 != null && tp2 != null && stop < entryLow! && entryLow! <= entryHigh! && entryHigh! < tp1 && tp1 < tp2
  const resistance = hasEntry ? nearestStructuralResistance(features, history, entryMid!) : { value: undefined, source: undefined, all: [] }
  const structuralRAtEntryMid = hasEntry && stop != null && resistance.value != null ? rr(resistance.value, entryMid!, stop) : undefined
  const tp1ExceedsNearestResistance = resistance.value != null && tp1 != null && tp1 > resistance.value * 1.01
  const resistanceDistanceFromEntryPct = hasEntry && resistance.value != null ? pct(resistance.value, entryMid!) : undefined
  const setup = candidate?.setup ?? signal.setup ?? "NONE"
  const rsiExtended = snapshot.momentum.rsi14 > 75
  const rs60Extended = snapshot.relativeStrength.rs60 > 40
  const lowRvol = snapshot.volume.rvol20 < 0.8
  const last20 = history.slice(-20)
  const valueFieldCoverage20 = last20.filter((bar) => finite(bar.value)).length
  const liquidityBasis: TplusExecutionDiagnostics["liquidityBasis"] = valueFieldCoverage20 === 20
    ? "PROVIDER_VALUE_FIELD"
    : valueFieldCoverage20 === 0
      ? "CLOSE_TIMES_VOLUME_FALLBACK"
      : "MIXED_PROVIDER_VALUE_AND_CLOSE_VOLUME_FALLBACK"
  const distribution = snapshot.priceStructure.state === "DISTRIBUTION"
  const triggerPrice = setup === "BREAKOUT" ? previousHigh(history, 20) : setup === "PULLBACK" ? entryLow : entryHigh
  let triggerStatus = "WAIT_FOR_SETUP_CONFIRMATION"
  if (setup === "NONE" || !hasEntry) triggerStatus = "NO_VALID_SETUP"
  else if (setup === "BREAKOUT") triggerStatus = triggerPrice != null && close >= triggerPrice && snapshot.volume.rvol20 >= 1.25 && close > snapshot.trend.ema50 ? "BREAKOUT_CONFIRMED" : "WAIT_FOR_BREAKOUT_CONFIRMATION"
  else if (entryZoneStatus === "ABOVE_ENTRY_ZONE" && distanceToEntryHighPct != null && distanceToEntryHighPct > 3) triggerStatus = "ENTRY_ZONE_MISSED"
  else if (setup === "PULLBACK" && entryZoneStatus === "INSIDE_ENTRY_ZONE") triggerStatus = "PRICE_IN_ENTRY_ZONE_WAIT_FOR_CONFIRMATION"
  else if (setup === "PULLBACK" && entryZoneStatus === "BELOW_ENTRY_ZONE") triggerStatus = "WAIT_FOR_ENTRY_ZONE"
  else if (setup === "MOMENTUM_CONTINUATION" && lowRvol) triggerStatus = "LOW_RVOL_NO_CONTINUATION_CONFIRMATION"
  else if (setup === "MOMENTUM_CONTINUATION") triggerStatus = "WAIT_FOR_CONTINUATION_CONFIRMATION"
  else if (entryZoneStatus === "INSIDE_ENTRY_ZONE") triggerStatus = "PRICE_IN_ENTRY_ZONE_WAIT_FOR_CONFIRMATION"
  const next = blockingReason({
    action: signal.action,
    hasEntry,
    validPlan,
    distribution,
    rsiExtended,
    rs60Extended,
    lowRvol: lowRvol && ["MOMENTUM_CONTINUATION", "BREAKOUT", "PULLBACK"].includes(setup),
    riskPctAtMid,
    entryStatus: entryZoneStatus,
    entryHigh,
    structuralR: structuralRAtEntryMid,
    tp1ExceedsResistance,
    setup,
  })
  const weeklyBias = higherTimeframeBias(history, "W")
  const monthlyBias = higherTimeframeBias(history, "M")
  const higherTimeframeRisk = distribution || weeklyBias === "DOWN" || monthlyBias === "DOWN"
    ? "HIGH"
    : weeklyBias === "UP" && monthlyBias === "UP" ? "LOW" : "MEDIUM"
  const readinessNotes: string[] = []
  let executionReadinessScore = 100
  const penalize = (amount: number, note: string) => { executionReadinessScore -= amount; readinessNotes.push(note) }
  if (distribution) penalize(25, "Structure is DISTRIBUTION.")
  if (rsiExtended) penalize(15, "RSI14 is above 75.")
  if (rs60Extended) penalize(10, "Stock return over 60 sessions exceeds 40%.")
  if (lowRvol) penalize(15, "RVOL20 is below 0.8.")
  if (riskPctAtEntryMid != null && riskPctAtEntryMid > 7) penalize(20, "Stop risk from entry midpoint exceeds 7%.")
  if (distanceToEntryHighPct != null && distanceToEntryHighPct > 3) penalize(25, "Reference close is more than 3% above Entry High.")
  if (structuralRAtEntryMid != null && structuralRAtEntryMid < 1.6) penalize(15, "Nearest structural resistance offers less than 1.6R from entry midpoint.")
  if (tp1ExceedsNearestResistance) penalize(10, "Strategy TP1 lies above nearest identified resistance.")
  if (weeklyBias === "DOWN" || monthlyBias === "DOWN") penalize(15, "Weekly or monthly bias is DOWN.")
  if (entryZoneStatus === "INSIDE_ENTRY_ZONE") { executionReadinessScore += 5; readinessNotes.push("Reference close is inside the planned entry zone.") }
  if (snapshot.volume.rvol20 >= 1.2) { executionReadinessScore += 5; readinessNotes.push("RVOL20 is at least 1.2.") }
  executionReadinessScore = Math.max(0, Math.min(100, executionReadinessScore))
  const executionReadinessLabel = executionReadinessScore >= 75 ? "HIGH" : executionReadinessScore >= 50 ? "MEDIUM" : "LOW"
  const triggerReady = triggerStatus === "BREAKOUT_CONFIRMED"
  const actionableNow = signal.action === "BUY" && triggerReady && entryZoneStatus === "INSIDE_ENTRY_ZONE" && validPlan && !distribution && !rsiExtended && !(riskPctAtEntryMid != null && riskPctAtEntryMid > 7)
  return {
    asOfDate: latest?.date ?? signal.date,
    referenceClose: close,
    priceUnitNote: "Provider-native price units; the app does not rescale VND/thousand-VND. Verify source units before comparing values.",
    rsUnitNote: "RS20/60/120 are stock price returns over 20/60/120 trading bars (%); excess return vs VNINDEX is in percentage points.",
    entryZoneStatus,
    distanceToEntryLowPct,
    distanceToEntryMidPct,
    distanceToEntryHighPct,
    triggerPrice,
    triggerStatus,
    mainBlockingReason: next.reason,
    nextActionRequired: next.next,
    riskPctAtEntryLow,
    riskPctAtEntryMid,
    riskPctAtEntryHigh,
    rewardPctTp1AtEntryLow,
    rewardPctTp1AtEntryMid,
    rewardPctTp1AtEntryHigh,
    rewardPctTp2AtEntryMid,
    rrTp1AtEntryLow,
    rrTp1AtEntryMid,
    rrTp1AtEntryHigh,
    rrTp2AtEntryLow,
    rrTp2AtEntryMid,
    rrTp2AtEntryHigh,
    riskPctAtReferenceClose,
    rrTp1AtReferenceClose,
    validPlan,
    validPlanRule: "SL < Entry Low <= Entry High < TP1 < TP2; this is structural ordering only, not a guarantee of execution.",
    tp1Model: "Existing strategy TP1 is a fixed 1.75R target in the current TPLUS_MULTI_SETUP_v1 implementation. This diagnostic does not alter TP1/TP2 or scoring.",
    nearestResistance: resistance.value,
    nearestResistanceSource: resistance.source,
    structuralTp1Alternative: resistance.value,
    structuralRAtEntryMid,
    tp1ExceedsNearestResistance,
    resistanceDistanceFromEntryPct,
    trendStructureConflict: snapshot.trend.aboveEma50 && (distribution || weeklyBias === "DOWN" || monthlyBias === "DOWN"),
    rsiExtended,
    rs60Extended,
    lowRvol,
    valueFieldCoverage20Count: valueFieldCoverage20,
    liquidityFlag: valueFieldCoverage20 === 20
      ? "PROVIDER_VALUE_FIELD_AVAILABLE_UNIT_UNVERIFIED"
      : valueFieldCoverage20 === 0
        ? "CLOSE_TIMES_VOLUME_FALLBACK_UNIT_UNVERIFIED"
        : "MIXED_PROVIDER_VALUE_AND_CLOSE_VOLUME_FALLBACK_UNITS_UNVERIFIED",
    liquidityBasis,
    weeklyBias,
    monthlyBias,
    higherTimeframeRisk,
    executionReadinessScore,
    executionReadinessLabel,
    actionableNow,
    readinessNotes: [...new Set(readinessNotes)],
  } satisfies TplusExecutionDiagnostics
}
