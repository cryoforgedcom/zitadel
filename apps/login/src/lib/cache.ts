import { createLogger } from "./logger";

const logger = createLogger("cache");

interface CacheEntry<T = any> {
  promise: Promise<T>;
  /** Last successfully resolved value – undefined until first resolve. */
  value?: T;
  expiresAt: number;
  /** True while a background revalidation fetch is in-flight. */
  isRevalidating: boolean;
}

/**
 * A bounded, stale-while-revalidate in-memory promise cache.
 *
 * Features:
 * - Deduplicates concurrent requests by caching the Promise itself
 * - Serves stale data immediately while revalidating in the background
 * - Bounded to `maxSize` entries to prevent unbounded memory growth
 * - Sweeps expired entries and evicts oldest (FIFO) when over capacity
 */
export class PromiseCache {
  private readonly cache = new Map<string, CacheEntry>();
  private readonly maxSize: number;

  constructor(maxSize = 100_000) {
    this.maxSize = Math.max(1, maxSize);
  }

  /**
   * Get a cached value or execute the fetcher and cache its promise.
   *
   * After the first successful fetch, expired entries return the stale
   * value immediately and trigger a background revalidation (SWR).
   * Only the very first call for a key (or after eviction/error) blocks
   * on the fetch.
   */
  getOrFetch<T>(key: string, fetcher: () => Promise<T>, ttlMs: number): Promise<T> {
    const now = Date.now();
    const cached = this.cache.get(key) as CacheEntry<T> | undefined;

    // Still fresh → return cached promise
    if (cached && now < cached.expiresAt) {
      return cached.promise;
    }

    // Expired but has a stale value → return stale immediately (SWR)
    if (cached?.value !== undefined) {
      // Trigger background revalidation only if one isn't already in-flight
      if (!cached.isRevalidating) {
        cached.isRevalidating = true;
        const bgPromise = fetcher();
        bgPromise
          .then((value) => {
            this.cache.set(key, {
              promise: Promise.resolve(value),
              value,
              expiresAt: Date.now() + ttlMs,
              isRevalidating: false,
            });
          })
          .catch(() => {
            // Revalidation failed — keep stale entry, allow retry next call
            cached.isRevalidating = false;
          });
      }

      // Return stale value immediately, whether or not we just started revalidation
      return Promise.resolve(cached.value);
    }

    // ③ No stale value (first call ever or evicted) → blocking fetch
    const promise = fetcher();
    const entry: CacheEntry<T> = {
      promise,
      expiresAt: now + ttlMs,
      isRevalidating: false,
    };
    this.cache.set(key, entry);

    this.evictIfNeeded();

    promise
      .then((value) => {
        entry.value = value;
      })
      .catch(() => this.cache.delete(key));

    return promise;
  }

  /**
   * Remove all expired entries from the cache.
   * Returns the number of entries removed.
   */
  sweepExpired(): number {
    const now = Date.now();
    return Array.from(this.cache.entries())
      .filter(([, v]) => now >= v.expiresAt)
      .map(([k]) => this.cache.delete(k)).length;
  }

  /**
   * Evict entries when the cache exceeds maxSize.
   * Strategy: sweep expired first, then evict oldest entries (Map insertion order).
   */
  private evictIfNeeded(): void {
    if (this.cache.size <= this.maxSize) return;
    this.sweepExpired();
    const excess = this.cache.size - this.maxSize;
    if (excess > 0) {
      const evicted = Array.from(this.cache.keys())
        .slice(0, excess)
        .map((k) => this.cache.delete(k)).length;
      logger.warn("Cache eviction triggered", {
        evicted,
        maxSize: this.maxSize,
        remaining: this.cache.size,
      });
    }
  }

  /** Current number of entries. */
  get size(): number {
    return this.cache.size;
  }

  /** Clear all entries. */
  clear(): void {
    this.cache.clear();
  }
}
