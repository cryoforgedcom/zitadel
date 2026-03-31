import { createLogger } from "./logger";

const logger = createLogger("cache");

interface CacheEntry<T = any> {
  promise: Promise<T>;
  expiresAt: number;
}

/**
 * A bounded, stale-while-revalidate in-memory promise cache.
 *
 * Features:
 * - Deduplicates concurrent requests by caching the Promise itself
 * - Bounded to `maxSize` entries to prevent unbounded memory growth
 * - Sweeps expired entries and evicts oldest (FIFO) when over capacity
 */
export class PromiseCache {
  private readonly cache = new Map<string, CacheEntry>();
  private readonly maxSize: number;

  constructor(maxSize = 100) {
    this.maxSize = Math.max(1, maxSize);
  }

  /**
   * Get a cached value or execute the fetcher and cache its promise.
   */
  getOrFetch<T>(key: string, fetcher: () => Promise<T>, ttlMs: number): Promise<T> {
    const now = Date.now();
    const cached = this.cache.get(key);
    if (cached && now < cached.expiresAt) {
      return cached.promise;
    }

    const promise = fetcher();
    this.cache.set(key, { promise, expiresAt: now + ttlMs });

    this.evictIfNeeded();

    promise.catch(() => this.cache.delete(key));

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
