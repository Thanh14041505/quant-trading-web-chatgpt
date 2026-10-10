import { buildCacheKey } from "@/data/cache/cache-key"
import { clearIndexedDb, countIndexedDb, deleteFromIndexedDb, isIndexedDbAvailable, readFromIndexedDb, writeToIndexedDb, CACHE_DB_NAME, CACHE_DB_VERSION } from "@/data/cache/indexed-db"
import { MemoryCache } from "@/data/cache/memory-cache"
import type { CacheEnvelope, CacheKeyParts, CacheLookup, CacheStats } from "@/models/cache"

export interface CacheWriteOptions<T> {
  kind: CacheEnvelope<T>["kind"]
  providerId: string
  ttlMs: number
  payload: T
  keyParts?: Omit<CacheKeyParts, "providerId" | "kind">
  metadata?: CacheEnvelope<T>["metadata"]
}

export class ClientCache {
  private readonly memory = new MemoryCache()

  async get<T>(key: string, kind: CacheEnvelope<T>["kind"]): Promise<CacheLookup<T>> {
    const memoryHit = this.memory.get<T>(key)
    if (memoryHit) return this.inspect(memoryHit)

    if (isIndexedDbAvailable()) {
      try {
        const persisted = await readFromIndexedDb<T>(key, kind)
        if (persisted) {
          this.memory.set(persisted)
          const refreshed = { ...persisted, lastAccessedAt: new Date().toISOString() }
          this.memory.set(refreshed)
          void writeToIndexedDb(refreshed).catch(() => undefined)
          return this.inspect(refreshed)
        }
      } catch {
        // Memory cache remains the safe fallback.
      }
    }

    return { status: "MISS" }
  }

  async set<T>(options: CacheWriteOptions<T>): Promise<CacheEnvelope<T>> {
    const now = Date.now()
    const key = buildCacheKey({
      providerId: options.providerId,
      kind: options.kind,
      ...(options.keyParts ?? {}),
    })
    const envelope: CacheEnvelope<T> = {
      key,
      version: 1,
      kind: options.kind,
      providerId: options.providerId,
      createdAt: new Date(now).toISOString(),
      expiresAt: new Date(now + options.ttlMs).toISOString(),
      lastAccessedAt: new Date(now).toISOString(),
      payload: options.payload,
      metadata: options.metadata,
    }

    this.memory.set(envelope)
    if (isIndexedDbAvailable()) {
      await writeToIndexedDb(envelope).catch(() => undefined)
    }
    return envelope
  }

  async invalidate(parts: CacheKeyParts) {
    return this.remove(this.buildKey(parts), parts.kind)
  }

  async remove(key: string, kind: CacheEnvelope<unknown>["kind"]) {
    this.memory.delete(key)
    if (isIndexedDbAvailable()) {
      await deleteFromIndexedDb(key, kind).catch(() => undefined)
    }
  }

  async clearAll() {
    this.memory.clear()
    if (isIndexedDbAvailable()) {
      await clearIndexedDb().catch(() => undefined)
    }
  }

  async stats(): Promise<CacheStats> {
    let indexedDbEntries = 0
    if (isIndexedDbAvailable()) {
      indexedDbEntries = await countIndexedDb().catch(() => 0)
    }
    return {
      memoryEntries: this.memory.size(),
      indexedDbEntries,
      available: isIndexedDbAvailable(),
      dbName: CACHE_DB_NAME,
      dbVersion: CACHE_DB_VERSION,
    }
  }

  buildKey(parts: CacheKeyParts) {
    return buildCacheKey(parts)
  }

  private inspect<T>(envelope: CacheEnvelope<T>): CacheLookup<T> {
    const now = Date.now()
    const expiresAt = Date.parse(envelope.expiresAt)
    const createdAt = Date.parse(envelope.createdAt)
    return {
      status: Number.isFinite(expiresAt) && expiresAt > now ? "HIT_FRESH" : "HIT_STALE",
      envelope,
      ageMs: Number.isFinite(createdAt) ? Math.max(0, now - createdAt) : undefined,
      ttlRemainingMs: Number.isFinite(expiresAt) ? expiresAt - now : undefined,
    }
  }
}

export const clientCache = new ClientCache()
