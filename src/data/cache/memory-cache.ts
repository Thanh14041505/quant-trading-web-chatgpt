import type { CacheEnvelope } from "@/models/cache"

export class MemoryCache {
  private readonly entries = new Map<string, CacheEnvelope<unknown>>()

  get<T>(key: string): CacheEnvelope<T> | undefined {
    return this.entries.get(key) as CacheEnvelope<T> | undefined
  }

  set<T>(envelope: CacheEnvelope<T>) {
    this.entries.set(envelope.key, envelope as CacheEnvelope<unknown>)
  }

  delete(key: string) {
    this.entries.delete(key)
  }

  clear() {
    this.entries.clear()
  }

  size() {
    return this.entries.size
  }
}
