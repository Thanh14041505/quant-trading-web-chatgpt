import type { OHLCV } from "@/models/market"
import { calculateMarketRegime } from "@/quant/regime"
import { calculateTplusSignal } from "@/quant/tplus"
import type {
  BacktestConfig,
  BacktestInput,
  BacktestMetrics,
  BacktestProgress,
  BacktestResult,
  BacktestSignalEvent,
  BacktestStrategy,
  BacktestTrade,
  EquityPoint,
  MonthlyReturn,
  PortfolioSimulationInput,
  RegimePerformance,
} from "./types"

export const DEFAULT_BACKTEST_CONFIG: BacktestConfig = {
  symbols: ["HAH"],
  startDate: `${new Date().getFullYear() - 1}-${String(new Date().getMonth() + 1).padStart(2, "0")}-${String(new Date().getDate()).padStart(2, "0")}`,
  endDate: new Date(Date.now() - 2 * 24 * 60 * 60 * 1000).toISOString().slice(0, 10),
  initialCapital: 100_000_000,
  commissionPct: 0.15,
  sellingTaxPct: 0.1,
  slippagePct: 0.1,
  lotSize: 100,
  riskPerTradePct: 1,
  maxPositionPct: 20,
  maxPortfolioExposurePct: 80,
  maxOpenPositions: 5,
  maxHoldingSessions: 15,
  minScoreToBuy: 75,
  minRiskReward: 1.5,
  entryModel: "NEXT_OPEN",
  exitModel: "SL_TP_PARTIAL",
}

interface MutableTrade {
  id: string
  symbol: string
  strategy: BacktestStrategy
  strategyVersion: string
  setup: BacktestTrade["setup"]
  regime: BacktestTrade["regime"]
  signalDate: string
  entryDate: string
  entryPrice: number
  initialShares: number
  remainingShares: number
  entryNotional: number
  entryCommission: number
  exitGrossVnd: number
  exitNetVnd: number
  exitNotional: number
  exitShares: number
  exitPriceValue: number
  commissionVnd: number
  taxVnd: number
  initialRiskVnd: number
  holdingSessions: number
  exitDate?: string
  exitReason?: BacktestTrade["exitReason"]
  tp1Hit: boolean
  tp2Hit: boolean
  slHit: boolean
  maePct: number
  mfePct: number
  opportunityScore: number
  reasons: string[]
  risks: string[]
}

interface OpenPosition {
  trade: MutableTrade
  stopLoss: number
  tp1: number
  tp2: number
}

function validateSeries(symbol: string, bars: OHLCV[]): OHLCV[] {
  if (!bars.length) throw new Error(`${symbol}: provider returned no historical candles`)
  const copy = [...bars]
  for (let i = 0; i < copy.length; i += 1) {
    const bar = copy[i]
    if (!/^\d{4}-\d{2}-\d{2}$/.test(bar.date) || Number.isNaN(Date.parse(bar.date))) {
      throw new Error(`${symbol}: invalid candle date at row ${i + 1}`)
    }
    if (i > 0 && bar.date <= copy[i - 1].date) {
      throw new Error(`${symbol}: candle dates must be unique and chronological (${bar.date})`)
    }
    const values = [bar.open, bar.high, bar.low, bar.close, bar.volume]
    if (values.some((value) => !Number.isFinite(value)) || (bar.value != null && !Number.isFinite(bar.value))) throw new Error(`${symbol}: non-finite OHLCV at ${bar.date}`)
    if (bar.open <= 0 || bar.high <= 0 || bar.low <= 0 || bar.close <= 0 || bar.volume < 0) {
      throw new Error(`${symbol}: non-positive price or negative volume at ${bar.date}`)
    }
    if (bar.high < bar.low || bar.high < bar.open || bar.high < bar.close || bar.low > bar.open || bar.low > bar.close) {
      throw new Error(`${symbol}: inconsistent OHLC values at ${bar.date}`)
    }
  }
  return copy
}

function validateConfig(config: BacktestConfig) {
  if (!config.symbols.length) throw new Error("Enter at least one symbol")
  if (config.startDate > config.endDate) throw new Error("Start date must be on or before end date")
  if (!Number.isFinite(config.initialCapital) || config.initialCapital <= 0) throw new Error("Initial capital must be greater than zero")
  if (config.lotSize < 1 || !Number.isInteger(config.lotSize)) throw new Error("Lot size must be a positive integer")
  if (config.riskPerTradePct <= 0 || config.riskPerTradePct > 10) throw new Error("Risk per trade must be greater than 0% and at most 10%")
  if (!Number.isFinite(config.minRiskReward) || config.minRiskReward <= 0 || config.minRiskReward > 10) throw new Error("Minimum risk/reward must be greater than 0 and at most 10")
  if (config.maxPositionPct <= 0 || config.maxPositionPct > 100) throw new Error("Max position must be between 0% and 100%")
  if (config.maxPortfolioExposurePct <= 0 || config.maxPortfolioExposurePct > 100) throw new Error("Max portfolio exposure must be between 0% and 100%")
  if (!Number.isInteger(config.maxOpenPositions) || config.maxOpenPositions < 1) throw new Error("Max open positions must be at least one")
  if (!Number.isInteger(config.maxHoldingSessions) || config.maxHoldingSessions < 1) throw new Error("Maximum holding sessions must be at least one")
  for (const [label, value] of [["Commission", config.commissionPct], ["Selling tax", config.sellingTaxPct], ["Slippage", config.slippagePct]] as const) {
    if (!Number.isFinite(value) || value < 0 || value > 10) throw new Error(`${label} must be between 0% and 10%`)
  }
}

function allowedSetupsForStrategy(strategy: BacktestStrategy) {
  if (strategy === "TPLUS_BREAKOUT_v1") return ["BREAKOUT"] as const
  if (strategy === "TPLUS_PULLBACK_v1") return ["PULLBACK"] as const
  if (strategy === "TPLUS_DIVERGENCE_v1") return ["RSI_DIVERGENCE_REVERSAL"] as const
  if (strategy === "TPLUS_MEAN_REVERSION_v1") return ["MEAN_REVERSION"] as const
  return undefined
}

function emitProgress(callback: ((progress: BacktestProgress) => void) | undefined, progress: BacktestProgress) {
  callback?.(progress)
}

export function buildBacktestSignals(
  input: BacktestInput,
  barsBySymbol: Record<string, OHLCV[]>,
  progress?: (progress: BacktestProgress) => void,
): { events: BacktestSignalEvent[]; symbolErrors: Array<{ symbol: string; message: string }>; warnings: string[] } {
  const events: BacktestSignalEvent[] = []
  const symbolErrors: Array<{ symbol: string; message: string }> = []
  const warnings: string[] = []
  const symbols = input.config.symbols.map((symbol) => symbol.trim().toUpperCase()).filter(Boolean)
  const stepsBySymbol = new Map(symbols.map((symbol) => [symbol, Math.max(1, (barsBySymbol[symbol]?.length ?? 0) - 60)]))
  const totalSteps = [...stepsBySymbol.values()].reduce((sum, steps) => sum + steps, 0)
  let processedSteps = 0

  for (const symbol of symbols) {
    const bars = barsBySymbol[symbol]
    if (!bars || bars.length < 61) {
      symbolErrors.push({ symbol, message: `Insufficient history: ${bars?.length ?? 0} bars; at least 61 are needed for 60-bar warm-up plus a T+1 execution candle` })
      processedSteps += stepsBySymbol.get(symbol) ?? 1
      emitProgress(progress, { stage: "SIGNALS", processed: processedSteps, total: totalSteps, message: `Skipped ${symbol}: insufficient history` })
      continue
    }
    try {
      for (let index = 59; index < bars.length - 1; index += 1) {
        const signalBar = bars[index]
        processedSteps += 1
        if (processedSteps % 5 === 0 || processedSteps >= totalSteps) {
          emitProgress(progress, { stage: "SIGNALS", processed: processedSteps, total: totalSteps, message: `Evaluating ${symbol} · ${signalBar.date}` })
        }
        const entryBar = bars[index + 1]
        if (signalBar.date < input.config.startDate || signalBar.date > input.config.endDate || entryBar.date > input.config.endDate) continue
        const prefix = bars.slice(0, index + 1)
        const benchmarkPrefix = input.benchmarkData.filter((bar) => bar.date <= signalBar.date)
        let regime: BacktestTrade["regime"] = "SIDEWAYS"
        if (benchmarkPrefix.length >= 60) {
          try {
            regime = calculateMarketRegime({ indexData: benchmarkPrefix }).regime
          } catch {
            warnings.push("Market regime unavailable for one or more signal dates; SIDEWAYS fallback used")
          }
        } else {
          warnings.push("Benchmark warm-up incomplete for one or more signal dates; SIDEWAYS fallback used")
        }
        const result = calculateTplusSignal({
          data: prefix,
          regime,
          featureContext: benchmarkPrefix.length ? { benchmark: benchmarkPrefix } : undefined,
          config: { minScoreToBuy: input.config.minScoreToBuy, minRiskReward: input.config.minRiskReward },
          allowedSetups: allowedSetupsForStrategy(input.strategy) ? [...allowedSetupsForStrategy(input.strategy)!] : undefined,
        })
        const signal = result.signal
        if (signal.action !== "BUY" || signal.setup === "NONE") continue
        if (signal.stopLoss == null || signal.tp1 == null || signal.tp2 == null || !signal.riskPlan) continue
        events.push({ symbol, signalDate: signalBar.date, entryDate: entryBar.date, setup: signal.setup, score: signal.score, regime, signal })
      }
    } catch (error) {
      symbolErrors.push({ symbol, message: error instanceof Error ? error.message : String(error) })
    }
    emitProgress(progress, { stage: "SIGNALS", processed: processedSteps, total: totalSteps, message: `Finished historical signals for ${symbol}` })
  }

  const uniqueWarnings = [...new Set(warnings)]
  return { events, symbolErrors, warnings: uniqueWarnings }
}

function toCompletedTrade(trade: MutableTrade): BacktestTrade {
  const pnl = trade.exitNetVnd - (trade.entryNotional + trade.entryCommission)
  const riskMultiple = trade.initialRiskVnd > 0 ? pnl / trade.initialRiskVnd : 0
  return {
    id: trade.id,
    symbol: trade.symbol,
    strategy: trade.strategy,
    strategyVersion: trade.strategyVersion,
    setup: trade.setup,
    regime: trade.regime,
    signalDate: trade.signalDate,
    entryDate: trade.entryDate,
    exitDate: trade.exitDate ?? trade.entryDate,
    entryPrice: trade.entryPrice,
    averageExitPrice: trade.exitShares > 0 ? trade.exitPriceValue / trade.exitShares : trade.entryPrice,
    initialShares: trade.initialShares,
    exitShares: trade.exitShares,
    pnlVnd: pnl,
    returnPct: trade.entryNotional > 0 ? (pnl / trade.entryNotional) * 100 : 0,
    riskMultiple,
    commissionVnd: trade.commissionVnd,
    taxVnd: trade.taxVnd,
    holdingSessions: trade.holdingSessions,
    exitReason: trade.exitReason ?? "END_OF_TEST",
    tp1Hit: trade.tp1Hit,
    tp2Hit: trade.tp2Hit,
    slHit: trade.slHit,
    maePct: trade.maePct,
    mfePct: trade.mfePct,
    opportunityScore: trade.opportunityScore,
    reasons: trade.reasons,
    risks: trade.risks,
  }
}

export function simulatePortfolio(
  input: PortfolioSimulationInput,
  progress?: (progress: BacktestProgress) => void,
): { trades: BacktestTrade[]; equityCurve: EquityPoint[]; dataSummary: BacktestResult["dataSummary"] } {
  const { config } = input
  validateConfig(config)
  const symbols = config.symbols.map((symbol) => symbol.trim().toUpperCase()).filter(Boolean)
  const errors = [...(input.dataSummary?.symbolErrors ?? [])]
  const barsBySymbol: Record<string, OHLCV[]> = {}
  const lastCloseBySymbol = new Map<string, number>()
  const barBySymbolDate = new Map<string, Map<string, OHLCV>>()
  const validSymbols: string[] = []

  for (const symbol of symbols) {
    try {
      const bars = input.barsBySymbol[symbol]?.filter((bar) => bar.date <= config.endDate) ?? []
      if (!bars.length) throw new Error("No bars available up to the selected end date")
      const validated = validateSeries(symbol, bars)
      barsBySymbol[symbol] = validated
      validSymbols.push(symbol)
      barBySymbolDate.set(symbol, new Map(validated.map((bar) => [bar.date, bar])))
    } catch (error) {
      const alreadyReported = errors.some((item) => item.symbol.toUpperCase() === symbol.toUpperCase())
      if (!alreadyReported) errors.push({ symbol, message: error instanceof Error ? error.message : String(error) })
    }
  }
  if (!validSymbols.length) throw new Error(errors.map((error) => `${error.symbol}: ${error.message}`).join("; ") || "No symbols have usable OHLCV data")

  const allDates = [...new Set(validSymbols.flatMap((symbol) => barsBySymbol[symbol].map((bar) => bar.date).filter((date) => date >= config.startDate && date <= config.endDate)))].sort()
  if (!allDates.length) throw new Error("No market sessions fall inside the selected date range")
  const pendingByDate = new Map<string, BacktestSignalEvent[]>()
  for (const event of input.signalEvents) {
    if (!validSymbols.includes(event.symbol) || event.entryDate < config.startDate || event.entryDate > config.endDate) continue
    const list = pendingByDate.get(event.entryDate) ?? []
    list.push(event)
    pendingByDate.set(event.entryDate, list)
  }

  let cash = config.initialCapital
  const positions = new Map<string, OpenPosition>()
  const trades: BacktestTrade[] = []
  const equityCurve: EquityPoint[] = []
  let totalTurnover = 0
  let sessionsInMarket = 0
  let exposurePctSum = 0
  let currentSessionIndex = 0
  const lastSessionDate = allDates[allDates.length - 1]
  const commissionRate = config.commissionPct / 100
  const taxRate = config.sellingTaxPct / 100
  const slippageRate = config.slippagePct / 100

  const computeExposure = (date: string, useOpen = false) => {
    let exposure = 0
    for (const [symbol, position] of positions) {
      const bar = barBySymbolDate.get(symbol)?.get(date)
      const price = bar ? (useOpen ? bar.open : bar.close) : lastCloseBySymbol.get(symbol) ?? position.trade.entryPrice
      exposure += position.trade.remainingShares * price
    }
    return exposure
  }
  const computeEquity = (date: string) => cash + computeExposure(date, false)

  const finalize = (position: OpenPosition, date: string, reason: BacktestTrade["exitReason"]) => {
    position.trade.exitDate = date
    position.trade.exitReason = reason
    trades.push(toCompletedTrade(position.trade))
    positions.delete(position.trade.symbol)
  }

  const sell = (position: OpenPosition, requestedShares: number, rawPrice: number, date: string, reason: BacktestTrade["exitReason"]) => {
    const quantity = Math.min(position.trade.remainingShares, Math.max(0, Math.floor(requestedShares)))
    if (quantity <= 0) return
    const fillPrice = Math.max(0.0001, rawPrice * (1 - slippageRate))
    const gross = quantity * fillPrice
    const commission = gross * commissionRate
    const tax = gross * taxRate
    const net = gross - commission - tax
    cash += net
    totalTurnover += gross
    position.trade.exitGrossVnd += gross
    position.trade.exitNetVnd += net
    position.trade.exitNotional += gross
    position.trade.exitShares += quantity
    position.trade.exitPriceValue += quantity * fillPrice
    position.trade.commissionVnd += commission
    position.trade.taxVnd += tax
    position.trade.remainingShares -= quantity
    if (position.trade.remainingShares <= 0) finalize(position, date, reason)
  }

  const managePosition = (symbol: string, position: OpenPosition, bar: OHLCV) => {
    const trade = position.trade
    trade.holdingSessions += 1
    trade.maePct = Math.min(trade.maePct, ((bar.low / trade.entryPrice) - 1) * 100)
    trade.mfePct = Math.max(trade.mfePct, ((bar.high / trade.entryPrice) - 1) * 100)
    const remainingBefore = trade.remainingShares

    // Conservative intrabar rule: if stop and target are both touched, assume stop first.
    if (bar.open <= position.stopLoss) {
      trade.slHit = true
      sell(position, remainingBefore, bar.open, bar.date, "SL")
      return
    }
    if (bar.low <= position.stopLoss) {
      trade.slHit = true
      sell(position, remainingBefore, position.stopLoss, bar.date, "SL")
      return
    }

    if (config.exitModel !== "TIME_STOP") {
      if (bar.high >= position.tp1) trade.tp1Hit = true
      if (config.exitModel === "SL_TP_PARTIAL" && !trade.tp2Hit && bar.high >= position.tp1 && positions.has(symbol)) {
        const lotsToClose = Math.floor((trade.remainingShares / 2) / config.lotSize) * config.lotSize
        const partialShares = lotsToClose > 0 ? lotsToClose : trade.remainingShares
        sell(position, partialShares, position.tp1, bar.date, "TP1")
        if (!positions.has(symbol)) return
      }
      if (bar.high >= position.tp2 && positions.has(symbol)) {
        trade.tp2Hit = true
        sell(position, trade.remainingShares, position.tp2, bar.date, "TP2")
        if (!positions.has(symbol)) return
      }
    }

    if (positions.has(symbol) && trade.holdingSessions >= config.maxHoldingSessions) {
      sell(position, trade.remainingShares, bar.close, bar.date, "TIME_STOP")
    }
  }

  for (const date of allDates) {
    currentSessionIndex += 1
    const currentBars = new Map<string, OHLCV>()
    for (const symbol of validSymbols) {
      const bar = barBySymbolDate.get(symbol)?.get(date)
      if (bar) {
        currentBars.set(symbol, bar)
        lastCloseBySymbol.set(symbol, bar.close)
      }
    }
    const closedSymbolsToday = new Set<string>()
    const currentlyOpen = [...positions.entries()]
    for (const [symbol, position] of currentlyOpen) {
      const bar = currentBars.get(symbol)
      if (!bar) continue
      managePosition(symbol, position, bar)
      if (!positions.has(symbol)) closedSymbolsToday.add(symbol)
    }

    const todaysSignals = [...(pendingByDate.get(date) ?? [])].sort((a, b) => b.score - a.score)
    const enteredToday: string[] = []
    for (const event of todaysSignals) {
      if (positions.has(event.symbol) || closedSymbolsToday.has(event.symbol)) continue
      if (positions.size >= config.maxOpenPositions) break
      const bar = currentBars.get(event.symbol)
      if (!bar) continue
      const signal = event.signal
      const stopLoss = signal.stopLoss
      const tp1 = signal.tp1
      const tp2 = signal.tp2
      const entryLow = signal.entryZone?.low
      const entryHigh = signal.entryZone?.high
      if (stopLoss == null || tp1 == null || tp2 == null || entryLow == null || entryHigh == null) continue
      if (![stopLoss, tp1, tp2, entryLow, entryHigh].every(Number.isFinite) || entryLow > entryHigh) continue
      if (config.entryModel === "NEXT_OPEN_IF_IN_ZONE") {
        const chaseTolerance = 0.005
        if (bar.open < entryLow * (1 - chaseTolerance) || bar.open > entryHigh * (1 + chaseTolerance)) continue
      }
      const entryPrice = bar.open * (1 + slippageRate)
      const riskPerShare = entryPrice - stopLoss
      const actualRiskReward = riskPerShare > 0 ? (tp1 - entryPrice) / riskPerShare : 0
      if (!(riskPerShare > 0) || tp1 <= entryPrice || tp2 <= entryPrice || tp2 < tp1 || actualRiskReward < config.minRiskReward) continue
      const equityAtOpen = Math.max(0, cash + computeExposure(date, true))
      const exposureNow = computeExposure(date, true)
      const riskBudget = equityAtOpen * (config.riskPerTradePct / 100)
      const maxPositionValue = equityAtOpen * (config.maxPositionPct / 100)
      const maxExposureValue = Math.max(0, equityAtOpen * (config.maxPortfolioExposurePct / 100) - exposureNow)
      const affordableValue = cash / (1 + commissionRate)
      const allowedValue = Math.min(riskBudget / (riskPerShare / entryPrice), maxPositionValue, maxExposureValue, affordableValue)
      const shares = Math.floor(allowedValue / entryPrice / config.lotSize) * config.lotSize
      if (shares < config.lotSize) continue
      const entryNotional = shares * entryPrice
      const entryCommission = entryNotional * commissionRate
      if (entryNotional + entryCommission > cash) continue
      cash -= entryNotional + entryCommission
      totalTurnover += entryNotional
      const trade: MutableTrade = {
        id: `${event.symbol}-${event.signalDate}-${event.entryDate}-${input.strategy}`,
        symbol: event.symbol,
        strategy: input.strategy,
        strategyVersion: input.strategy,
        setup: event.setup,
        regime: event.regime,
        signalDate: event.signalDate,
        entryDate: event.entryDate,
        entryPrice,
        initialShares: shares,
        remainingShares: shares,
        entryNotional,
        entryCommission,
        exitGrossVnd: 0,
        exitNetVnd: 0,
        exitNotional: 0,
        exitShares: 0,
        exitPriceValue: 0,
        commissionVnd: entryCommission,
        taxVnd: 0,
        initialRiskVnd: riskPerShare * shares,
        holdingSessions: 0,
        tp1Hit: false,
        tp2Hit: false,
        slHit: false,
        maePct: 0,
        mfePct: 0,
        opportunityScore: signal.opportunityScore,
        reasons: signal.reasons,
        risks: signal.risks,
      }
      positions.set(event.symbol, { trade, stopLoss, tp1, tp2 })
      enteredToday.push(event.symbol)
    }

    for (const symbol of enteredToday) {
      const position = positions.get(symbol)
      const bar = currentBars.get(symbol)
      if (position && bar) {
        managePosition(symbol, position, bar)
        if (!positions.has(symbol)) closedSymbolsToday.add(symbol)
      }
    }

    // Liquidate open positions on the final in-range session to keep result equity realized.
    if (date === lastSessionDate) {
      for (const [symbol, position] of [...positions.entries()]) {
        const bar = currentBars.get(symbol)
        const lastBar = bar ?? barBySymbolDate.get(symbol)?.get(lastSessionDate) ?? barsBySymbol[symbol].filter((row) => row.date <= date).at(-1)
        if (lastBar && positions.has(symbol)) sell(position, position.trade.remainingShares, lastBar.close, lastBar.date, "END_OF_TEST")
      }
    }

    const equity = computeEquity(date)
    const exposureVnd = computeExposure(date, false)
    const exposurePct = equity > 0 ? (exposureVnd / equity) * 100 : 0
    if (exposureVnd > 0) sessionsInMarket += 1
    exposurePctSum += exposurePct
    equityCurve.push({ date, equity, cash, exposureVnd, exposurePct, drawdownPct: 0 })
    emitProgress(progress, {
      stage: "SIMULATION",
      processed: currentSessionIndex,
      total: allDates.length,
      message: `Simulated ${date}`,
    })
  }

  let peak = config.initialCapital
  for (const point of equityCurve) {
    peak = Math.max(peak, point.equity)
    point.drawdownPct = peak > 0 ? ((point.equity / peak) - 1) * 100 : 0
  }

  const startAvailable = validSymbols.flatMap((symbol) => barsBySymbol[symbol].map((bar) => bar.date)).sort()[0] ?? null
  const endAvailable = validSymbols.flatMap((symbol) => barsBySymbol[symbol].map((bar) => bar.date)).sort().at(-1) ?? null
  const symbolErrors = [...new Map(errors.map((error) => [`${error.symbol}:${error.message}`, error])).values()]
  const warningSet = new Set(input.dataSummary?.warnings ?? [])
  if (input.benchmarkData.length < 60) warningSet.add("Benchmark history below 60 sessions; SIDEWAYS regime fallback may be used")
  if (input.isDemoData) warningSet.add("Synthetic mock data: results are for software validation only and are not evidence of a tradable edge")
  warningSet.add("Historical universe completeness and survivorship bias cannot be verified from the current provider contract")
  warningSet.add("V1 does not model corporate actions, price limits, settlement restrictions, or intraday partial fills")
  if (validSymbols.some((symbol) => barsBySymbol[symbol].length < 200)) warningSet.add("Some symbols have fewer than 200 bars; long-horizon indicators may be under-warmed")
  const dataSummary: BacktestResult["dataSummary"] = {
    symbolsRequested: symbols,
    symbolsProcessed: validSymbols,
    symbolErrors,
    benchmarkSymbol: "VNINDEX",
    benchmarkBars: input.benchmarkData.length,
    startDateAvailable: startAvailable,
    endDateAvailable: endAvailable,
    barsBySymbol: Object.fromEntries(validSymbols.map((symbol) => [symbol, barsBySymbol[symbol].length])),
    warnings: [...warningSet],
  }
  return { trades: trades.sort((a, b) => a.entryDate.localeCompare(b.entryDate)), equityCurve, dataSummary }
}

function mean(values: number[]) {
  return values.length ? values.reduce((sum, value) => sum + value, 0) / values.length : null
}

function profitFactor(trades: BacktestTrade[]) {
  const gains = trades.filter((trade) => trade.pnlVnd > 0).reduce((sum, trade) => sum + trade.pnlVnd, 0)
  const losses = Math.abs(trades.filter((trade) => trade.pnlVnd < 0).reduce((sum, trade) => sum + trade.pnlVnd, 0))
  return losses > 0 ? gains / losses : gains > 0 ? null : 0
}

export function calculateBacktestMetrics(
  trades: BacktestTrade[],
  equityCurve: EquityPoint[],
  config: BacktestConfig,
  totalTurnover: number,
  sessionsInMarket: number,
  exposurePctSum: number,
): BacktestMetrics {
  const finalEquity = equityCurve.at(-1)?.equity ?? config.initialCapital
  const totalReturnPct = ((finalEquity / config.initialCapital) - 1) * 100
  const firstDate = equityCurve[0]?.date
  const lastDate = equityCurve.at(-1)?.date
  const elapsedDays = firstDate && lastDate ? (Date.parse(`${lastDate}T00:00:00Z`) - Date.parse(`${firstDate}T00:00:00Z`)) / 86_400_000 : 0
  const cagrPct = elapsedDays > 0 && finalEquity > 0 ? (Math.pow(finalEquity / config.initialCapital, 365.25 / elapsedDays) - 1) * 100 : null
  const dailyReturns = equityCurve.map((point, index) => {
    const previous = index === 0 ? config.initialCapital : equityCurve[index - 1].equity
    return previous > 0 ? point.equity / previous - 1 : 0
  }).filter(Number.isFinite)
  const averageDailyReturn = mean(dailyReturns) ?? 0
  const variance = dailyReturns.length > 1 ? dailyReturns.reduce((sum, value) => sum + Math.pow(value - averageDailyReturn, 2), 0) / (dailyReturns.length - 1) : 0
  const dailyStd = Math.sqrt(variance)
  const downsideVariance = dailyReturns.length ? dailyReturns.reduce((sum, value) => sum + Math.pow(Math.min(0, value), 2), 0) / dailyReturns.length : 0
  const downsideStd = Math.sqrt(downsideVariance)
  const sharpeRatio = dailyStd > 0 ? (averageDailyReturn / dailyStd) * Math.sqrt(252) : null
  const sortinoRatio = downsideStd > 0 ? (averageDailyReturn / downsideStd) * Math.sqrt(252) : null
  const winners = trades.filter((trade) => trade.pnlVnd > 0)
  const losers = trades.filter((trade) => trade.pnlVnd < 0)
  const grossProfitVnd = winners.reduce((sum, trade) => sum + trade.pnlVnd, 0)
  const grossLossVnd = Math.abs(losers.reduce((sum, trade) => sum + trade.pnlVnd, 0))
  const maxDrawdownPct = equityCurve.reduce((max, point) => Math.min(max, point.drawdownPct), 0)
  const averageEquity = mean(equityCurve.map((point) => point.equity)) ?? config.initialCapital
  return {
    totalReturnPct,
    cagrPct,
    maxDrawdownPct,
    sharpeRatio,
    sortinoRatio,
    winRatePct: trades.length ? (winners.length / trades.length) * 100 : 0,
    averageWinPct: mean(winners.map((trade) => trade.returnPct)),
    averageLossPct: mean(losers.map((trade) => trade.returnPct)),
    averageWinVnd: mean(winners.map((trade) => trade.pnlVnd)),
    averageLossVnd: mean(losers.map((trade) => trade.pnlVnd)),
    expectancyVnd: mean(trades.map((trade) => trade.pnlVnd)),
    expectancyR: mean(trades.map((trade) => trade.riskMultiple)),
    profitFactor: profitFactor(trades),
    trades: trades.length,
    averageHoldingSessions: mean(trades.map((trade) => trade.holdingSessions)),
    exposurePct: equityCurve.length ? exposurePctSum / equityCurve.length : 0,
    timeInMarketPct: equityCurve.length ? (sessionsInMarket / equityCurve.length) * 100 : 0,
    turnoverPct: averageEquity > 0 ? (totalTurnover / averageEquity) * 100 : 0,
    tp1HitRatePct: trades.length ? (trades.filter((trade) => trade.tp1Hit).length / trades.length) * 100 : 0,
    tp2HitRatePct: trades.length ? (trades.filter((trade) => trade.tp2Hit).length / trades.length) * 100 : 0,
    slHitRatePct: trades.length ? (trades.filter((trade) => trade.slHit).length / trades.length) * 100 : 0,
    averageMaePct: mean(trades.map((trade) => trade.maePct)),
    averageMfePct: mean(trades.map((trade) => trade.mfePct)),
    grossProfitVnd,
    grossLossVnd,
    finalEquity,
  }
}

export function deriveMonthlyReturns(equityCurve: EquityPoint[], initialCapital: number): MonthlyReturn[] {
  if (!equityCurve.length) return []
  const output: MonthlyReturn[] = []
  let month = equityCurve[0].date.slice(0, 7)
  let monthStartEquity = initialCapital
  let monthEndEquity = initialCapital
  let priorEquity = initialCapital
  for (const point of equityCurve) {
    const pointMonth = point.date.slice(0, 7)
    if (pointMonth !== month) {
      output.push({ month, returnPct: monthStartEquity > 0 ? ((monthEndEquity / monthStartEquity) - 1) * 100 : 0, endEquity: monthEndEquity })
      month = pointMonth
      monthStartEquity = priorEquity
    }
    monthEndEquity = point.equity
    priorEquity = point.equity
  }
  output.push({ month, returnPct: monthStartEquity > 0 ? ((monthEndEquity / monthStartEquity) - 1) * 100 : 0, endEquity: monthEndEquity })
  return output
}

function deriveRegimePerformance(trades: BacktestTrade[]): RegimePerformance[] {
  const regimes = [...new Set(trades.map((trade) => trade.regime))]
  return regimes.map((regime) => {
    const scoped = trades.filter((trade) => trade.regime === regime)
    return {
      regime,
      trades: scoped.length,
      winRatePct: scoped.length ? scoped.filter((trade) => trade.pnlVnd > 0).length / scoped.length * 100 : 0,
      totalPnlVnd: scoped.reduce((sum, trade) => sum + trade.pnlVnd, 0),
      averageReturnPct: mean(scoped.map((trade) => trade.returnPct)) ?? 0,
      profitFactor: profitFactor(scoped),
    }
  })
}

function deriveReturnDistribution(trades: BacktestTrade[]) {
  const buckets = [
    { bucket: "≤ -5%", min: Number.NEGATIVE_INFINITY, max: -5 },
    { bucket: "-5% to -2%", min: -5, max: -2 },
    { bucket: "-2% to 0%", min: -2, max: 0 },
    { bucket: "0% to 2%", min: 0, max: 2 },
    { bucket: "2% to 5%", min: 2, max: 5 },
    { bucket: "5% to 10%", min: 5, max: 10 },
    { bucket: "> 10%", min: 10, max: Number.POSITIVE_INFINITY },
  ]
  return buckets.map(({ bucket, min, max }) => ({ bucket, trades: trades.filter((trade) => trade.returnPct > min && trade.returnPct <= max).length }))
}

export function runBacktest(
  input: BacktestInput,
  progress?: (progress: BacktestProgress) => void,
): BacktestResult {
  validateConfig(input.config)
  const barsBySymbol: Record<string, OHLCV[]> = {}
  const initialErrors: Array<{ symbol: string; message: string }> = []
  for (const symbolInput of input.config.symbols) {
    const symbol = symbolInput.trim().toUpperCase()
    try {
      const bars = (input.barsBySymbol[symbol] ?? []).filter((bar) => bar.date <= input.config.endDate)
      barsBySymbol[symbol] = validateSeries(symbol, bars)
    } catch (error) {
      initialErrors.push({ symbol, message: error instanceof Error ? error.message : String(error) })
    }
  }
  if (!Object.keys(barsBySymbol).length) throw new Error(initialErrors.map((error) => `${error.symbol}: ${error.message}`).join("; ") || "No requested symbols have valid data")

  let benchmarkData = input.benchmarkData.filter((bar) => bar.date <= input.config.endDate)
  let benchmarkWarning: string | undefined
  if (benchmarkData.length) {
    try {
      benchmarkData = validateSeries("VNINDEX", benchmarkData)
    } catch (error) {
      benchmarkWarning = `Benchmark data rejected: ${error instanceof Error ? error.message : String(error)}; SIDEWAYS fallback may be used`
      benchmarkData = []
    }
  } else {
    benchmarkWarning = "No VNINDEX benchmark bars available through the selected end date; SIDEWAYS regime fallback may be used"
  }
  const signalBuild = buildBacktestSignals({
    ...input,
    config: { ...input.config, symbols: Object.keys(barsBySymbol) },
    barsBySymbol,
    benchmarkData,
  }, barsBySymbol, progress)
  const simulation = simulatePortfolio({
    ...input,
    benchmarkData,
    barsBySymbol,
    signalEvents: signalBuild.events,
    dataSummary: {
      symbolsRequested: input.config.symbols.map((symbol) => symbol.toUpperCase()),
      symbolsProcessed: Object.keys(barsBySymbol),
      symbolErrors: [...initialErrors, ...signalBuild.symbolErrors],
      benchmarkSymbol: "VNINDEX",
      benchmarkBars: input.benchmarkData.length,
      startDateAvailable: null,
      endDateAvailable: null,
      barsBySymbol: Object.fromEntries(Object.entries(barsBySymbol).map(([symbol, bars]) => [symbol, bars.length])),
      warnings: [...signalBuild.warnings, ...(benchmarkWarning ? [benchmarkWarning] : [])],
    },
  }, progress)

  const trades = simulation.trades
  const curve = simulation.equityCurve
  let turnover = 0
  for (const trade of trades) {
    turnover += trade.initialShares * trade.entryPrice + trade.exitShares * trade.averageExitPrice
  }
  const sessionsInMarket = curve.filter((point) => point.exposureVnd > 0).length
  const exposurePctSum = curve.reduce((sum, point) => sum + point.exposurePct, 0)
  const metrics = calculateBacktestMetrics(trades, curve, input.config, turnover, sessionsInMarket, exposurePctSum)
  emitProgress(progress, { stage: "COMPLETE", processed: curve.length, total: curve.length, message: "Backtest complete" })
  return {
    id: `bt-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
    createdAt: new Date().toISOString(),
    providerId: input.providerId,
    isDemoData: input.isDemoData,
    strategy: input.strategy,
    config: input.config,
    dataSummary: simulation.dataSummary,
    metrics,
    equityCurve: curve,
    trades,
    monthlyReturns: deriveMonthlyReturns(curve, input.config.initialCapital),
    regimePerformance: deriveRegimePerformance(trades),
    exitDistribution: ["SL", "TP1", "TP2", "TIME_STOP", "END_OF_TEST"].map((reason) => ({ reason, trades: trades.filter((trade) => trade.exitReason === reason).length })),
    returnDistribution: deriveReturnDistribution(trades),
  }
}
