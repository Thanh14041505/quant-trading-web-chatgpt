import type { CacheKeyParts } from "@/models/cache"

function cleanPart(value?: string) {
  return value?.trim() || "*"
}

export function buildCacheKey(parts: CacheKeyParts): string {
  return [
    parts.kind,
    cleanPart(parts.providerId),
    cleanPart(parts.symbol).toUpperCase(),
    cleanPart(parts.timeframe),
    cleanPart(parts.startDate),
    cleanPart(parts.endDate),
    cleanPart(parts.extra),
  ].join(":")
}
