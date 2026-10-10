import { describe, expect, it } from "vitest"
import { ClientCache } from "@/data/cache/client-cache"

describe("client cache", () => {
  it("returns fresh values from memory cache", async () => {
    const cache = new ClientCache()
    await cache.set({ kind: "marketData", providerId: "mock", ttlMs: 60_000, payload: [{ symbol: "HAH" }], keyParts: { symbol: "HAH", timeframe: "1D" } })
    const key = cache.buildKey({ kind: "marketData", providerId: "mock", symbol: "HAH", timeframe: "1D" })
    const result = await cache.get<Array<{ symbol: string }>>(key, "marketData")
    expect(result.status).toBe("HIT_FRESH")
  })

  it("exposes stale values rather than losing them at expiry", async () => {
    const cache = new ClientCache()
    await cache.set({ kind: "marketData", providerId: "mock", ttlMs: 0, payload: ["stale"], keyParts: { symbol: "HAH", timeframe: "1D" } })
    const key = cache.buildKey({ kind: "marketData", providerId: "mock", symbol: "HAH", timeframe: "1D" })
    const result = await cache.get<string[]>(key, "marketData")
    expect(result.status).toBe("HIT_STALE")
    expect(result.envelope?.payload).toEqual(["stale"])
  })

  it("can invalidate and clear entries", async () => {
    const cache = new ClientCache()
    const parts = { kind: "marketData" as const, providerId: "mock", symbol: "HAH", timeframe: "1D" }
    await cache.set({ kind: parts.kind, providerId: parts.providerId, ttlMs: 60_000, payload: [1], keyParts: { symbol: parts.symbol, timeframe: parts.timeframe } })
    await cache.invalidate(parts)
    expect((await cache.get<number[]>(cache.buildKey(parts), "marketData")).status).toBe("MISS")
  })
})
