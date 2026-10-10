import type { OHLCV } from "@/models/market"
import { safeDiv } from "./utils"
import type { VolumeProfileResult } from "./types"

export function calculateVolumeProfile(data: OHLCV[], binCount = 24, valueArea = 0.70): VolumeProfileResult {
  const low = Math.min(...data.map((bar) => bar.low))
  const high = Math.max(...data.map((bar) => bar.high))
  if (!Number.isFinite(low) || !Number.isFinite(high) || high <= low || !data.length) {
    return { poc: Number.NaN, vah: Number.NaN, val: Number.NaN, hvn: [], lvn: [], bins: [], approximate: true }
  }
  const step = (high - low) / binCount
  const bins = Array.from({ length: binCount }, (_, i) => ({ low: low + i * step, high: i === binCount - 1 ? high : low + (i + 1) * step, volume: 0, share: 0 }))
  for (const bar of data) {
    const typical = (bar.high + bar.low + bar.close) / 3
    const idx = Math.min(binCount - 1, Math.max(0, Math.floor((typical - low) / step)))
    bins[idx].volume += bar.volume
  }
  const total = bins.reduce((sum, bin) => sum + bin.volume, 0)
  for (const bin of bins) bin.share = safeDiv(bin.volume, total, 0)
  const pocIndex = bins.reduce((best, bin, index) => bin.volume > bins[best].volume ? index : best, 0)
  let left = pocIndex
  let right = pocIndex
  let areaVolume = bins[pocIndex].volume
  while (areaVolume / Math.max(total, 1) < valueArea && (left > 0 || right < bins.length - 1)) {
    const leftVolume = left > 0 ? bins[left - 1].volume : -1
    const rightVolume = right < bins.length - 1 ? bins[right + 1].volume : -1
    if (rightVolume >= leftVolume && right < bins.length - 1) {
      right += 1
      areaVolume += bins[right].volume
    } else if (left > 0) {
      left -= 1
      areaVolume += bins[left].volume
    } else break
  }
  const hvn = bins.filter((bin, i) => (i === 0 || bin.volume >= bins[i - 1].volume) && (i === bins.length - 1 || bin.volume >= bins[i + 1].volume)).map((bin) => (bin.low + bin.high) / 2)
  const lvn = bins.filter((bin, i) => i > 0 && i < bins.length - 1 && bin.volume <= bins[i - 1].volume && bin.volume <= bins[i + 1].volume).map((bin) => (bin.low + bin.high) / 2)
  return {
    poc: (bins[pocIndex].low + bins[pocIndex].high) / 2,
    vah: bins[right].high,
    val: bins[left].low,
    hvn,
    lvn,
    bins,
    approximate: true,
  }
}
