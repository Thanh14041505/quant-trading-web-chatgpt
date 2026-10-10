import type { CacheEnvelope } from "@/models/cache"

export const CACHE_DB_NAME = "vn-quant-trading-cache"
export const CACHE_DB_VERSION = 1

export const CACHE_STORES = [
  "marketData",
  "marketIndex",
  "companyInfo",
  "fundamentals",
  "scannerResults",
  "backtestResults",
] as const

type CacheStoreName = (typeof CACHE_STORES)[number]

function canUseIndexedDb() {
  return typeof indexedDB !== "undefined"
}

export function isIndexedDbAvailable() {
  return canUseIndexedDb()
}

let databasePromise: Promise<IDBDatabase> | undefined

function getStoreName(kind: CacheEnvelope<unknown>["kind"]): CacheStoreName {
  return kind as CacheStoreName
}

async function getDatabase(): Promise<IDBDatabase> {
  if (!canUseIndexedDb()) {
    throw new Error("IndexedDB is unavailable in this environment.")
  }
  if (databasePromise) return databasePromise

  databasePromise = new Promise((resolve, reject) => {
    const request = indexedDB.open(CACHE_DB_NAME, CACHE_DB_VERSION)
    request.onerror = () => reject(request.error ?? new Error("Unable to open IndexedDB."))
    request.onupgradeneeded = () => {
      const db = request.result
      for (const storeName of CACHE_STORES) {
        if (!db.objectStoreNames.contains(storeName)) {
          db.createObjectStore(storeName, { keyPath: "key" })
        }
      }
    }
    request.onsuccess = () => resolve(request.result)
  })

  try {
    return await databasePromise
  } catch (error) {
    databasePromise = undefined
    throw error
  }
}

export async function readFromIndexedDb<T>(
  key: string,
  kind: CacheEnvelope<T>["kind"],
): Promise<CacheEnvelope<T> | undefined> {
  const db = await getDatabase()
  return new Promise((resolve, reject) => {
    const transaction = db.transaction(getStoreName(kind), "readonly")
    const request = transaction.objectStore(getStoreName(kind)).get(key)
    request.onerror = () => reject(request.error ?? new Error("IndexedDB read failed."))
    request.onsuccess = () => resolve(request.result as CacheEnvelope<T> | undefined)
  })
}

export async function writeToIndexedDb<T>(envelope: CacheEnvelope<T>): Promise<void> {
  const db = await getDatabase()
  return new Promise((resolve, reject) => {
    const transaction = db.transaction(getStoreName(envelope.kind), "readwrite")
    transaction.oncomplete = () => resolve()
    transaction.onerror = () => reject(transaction.error ?? new Error("IndexedDB write failed."))
    transaction.onabort = () => reject(transaction.error ?? new Error("IndexedDB write aborted."))
    transaction.objectStore(getStoreName(envelope.kind)).put(envelope)
  })
}

export async function deleteFromIndexedDb(key: string, kind: CacheEnvelope<unknown>["kind"]): Promise<void> {
  const db = await getDatabase()
  return new Promise((resolve, reject) => {
    const transaction = db.transaction(getStoreName(kind), "readwrite")
    transaction.oncomplete = () => resolve()
    transaction.onerror = () => reject(transaction.error ?? new Error("IndexedDB delete failed."))
    transaction.objectStore(getStoreName(kind)).delete(key)
  })
}

export async function clearIndexedDb(kind?: CacheStoreName): Promise<void> {
  const db = await getDatabase()
  const stores = kind ? [kind] : [...CACHE_STORES]
  await Promise.all(stores.map((storeName) => new Promise<void>((resolve, reject) => {
    const transaction = db.transaction(storeName, "readwrite")
    transaction.oncomplete = () => resolve()
    transaction.onerror = () => reject(transaction.error ?? new Error("IndexedDB clear failed."))
    transaction.objectStore(storeName).clear()
  })))
}

export async function countIndexedDb(kind?: CacheStoreName): Promise<number> {
  const db = await getDatabase()
  const stores = kind ? [kind] : [...CACHE_STORES]
  const counts = await Promise.all(stores.map((storeName) => new Promise<number>((resolve, reject) => {
    const transaction = db.transaction(storeName, "readonly")
    const request = transaction.objectStore(storeName).count()
    request.onerror = () => reject(request.error ?? new Error("IndexedDB count failed."))
    request.onsuccess = () => resolve(request.result)
  })))
  return counts.reduce((sum, value) => sum + value, 0)
}
