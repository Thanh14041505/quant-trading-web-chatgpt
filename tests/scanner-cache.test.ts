import { describe, expect, it } from "vitest"
import { scannerCacheKey } from "@/quant/scanner"

describe("scanner cache keys", () => {
  it("is stable regardless of symbol order", () => {
    const a = scannerCacheKey("mock", { engine: "TPLUS", symbols: ["GMD", "HAH"], universeSource: "CUSTOM" })
    const b = scannerCacheKey("mock", { engine: "TPLUS", symbols: ["HAH", "GMD"], universeSource: "CUSTOM" })
    expect(a).toBe(b)
  })
})
