import { afterEach, describe, expect, test, vi } from "vitest";
import { PromiseCache } from "./cache";

// Suppress logger output during tests
vi.mock("./logger", () => ({
  createLogger: () => ({
    warn: vi.fn(),
    info: vi.fn(),
    error: vi.fn(),
    debug: vi.fn(),
  }),
}));

describe("PromiseCache", () => {
  let cache: PromiseCache;

  afterEach(() => {
    cache?.clear();
  });

  describe("getOrFetch", () => {
    test("should return the fetcher result on cache miss", async () => {
      cache = new PromiseCache(10);
      const result = await cache.getOrFetch("key1", () => Promise.resolve("value1"), 60_000);
      expect(result).toBe("value1");
      expect(cache.size).toBe(1);
    });

    test("should return cached value on cache hit", async () => {
      cache = new PromiseCache(10);
      let callCount = 0;
      const fetcher = () => {
        callCount++;
        return Promise.resolve(`value-${callCount}`);
      };

      const first = await cache.getOrFetch("key1", fetcher, 60_000);
      const second = await cache.getOrFetch("key1", fetcher, 60_000);

      expect(first).toBe("value-1");
      expect(second).toBe("value-1");
      expect(callCount).toBe(1);
    });

    test("should return stale value immediately after TTL expires (SWR)", async () => {
      cache = new PromiseCache(10);
      let callCount = 0;
      let resolveRevalidation: ((v: string) => void) | undefined;

      const fetcher = () => {
        callCount++;
        if (callCount === 1) {
          return Promise.resolve("value-1");
        }
        // Second call: return a promise we control
        return new Promise<string>((resolve) => {
          resolveRevalidation = resolve;
        });
      };

      vi.useFakeTimers();
      try {
        // First call — blocks on fetch
        const first = await cache.getOrFetch("key1", fetcher, 100);
        expect(first).toBe("value-1");
        expect(callCount).toBe(1);

        // Expire the entry
        vi.advanceTimersByTime(101);

        // Second call after expiry — should get stale value immediately
        const second = await cache.getOrFetch("key1", fetcher, 100);
        expect(second).toBe("value-1"); // stale value, not blocking
        expect(callCount).toBe(2); // revalidation was triggered

        // Third call while revalidation is in-flight — also gets stale value
        const third = await cache.getOrFetch("key1", fetcher, 100);
        expect(third).toBe("value-1"); // stale value
        expect(callCount).toBe(2); // no additional fetch (already revalidating)

        // Resolve the background revalidation and flush the .then() chain
        resolveRevalidation!("value-2");
        await Promise.resolve();
        await Promise.resolve();

        // Now we should get the fresh value
        const fourth = await cache.getOrFetch("key1", fetcher, 100);
        expect(fourth).toBe("value-2");
      } finally {
        vi.useRealTimers();
      }
    });

    test("should keep stale value when revalidation fails", async () => {
      cache = new PromiseCache(10);
      let callCount = 0;

      const fetcher = () => {
        callCount++;
        if (callCount === 1) {
          return Promise.resolve("value-1");
        }
        return Promise.reject(new Error("network error"));
      };

      vi.useFakeTimers();
      try {
        const first = await cache.getOrFetch("key1", fetcher, 100);
        expect(first).toBe("value-1");

        vi.advanceTimersByTime(101);

        // After TTL: returns stale, triggers failing revalidation
        const second = await cache.getOrFetch("key1", fetcher, 100);
        expect(second).toBe("value-1");
        expect(callCount).toBe(2);

        // Flush the rejected promise's .catch() handler
        await vi.advanceTimersByTimeAsync(0);

        // isRevalidating should be reset, so next call can retry
        vi.advanceTimersByTime(1);
        const third = await cache.getOrFetch("key1", fetcher, 100);
        expect(third).toBe("value-1"); // still stale
        expect(callCount).toBe(3); // retried
      } finally {
        vi.useRealTimers();
      }
    });

    test("should re-fetch after TTL expires when no stale value exists (first fetch failed then evicted)", async () => {
      cache = new PromiseCache(10);
      let callCount = 0;
      const fetcher = () => {
        callCount++;
        return Promise.resolve(`value-${callCount}`);
      };

      vi.useFakeTimers();
      try {
        const first = await cache.getOrFetch("key1", fetcher, 100);
        expect(first).toBe("value-1");

        // Evict the entry manually
        cache.clear();

        const second = await cache.getOrFetch("key1", fetcher, 100);
        expect(second).toBe("value-2");
        expect(callCount).toBe(2);
      } finally {
        vi.useRealTimers();
      }
    });

    test("should remove entry from cache on first-fetch rejection", async () => {
      cache = new PromiseCache(10);
      const failingFetcher = () => Promise.reject(new Error("fail"));

      await expect(cache.getOrFetch("key1", failingFetcher, 60_000)).rejects.toThrow("fail");

      // Wait a tick for the .catch() handler to run
      await new Promise((r) => setTimeout(r, 0));
      expect(cache.size).toBe(0);
    });

    test("should deduplicate concurrent requests for the same key", async () => {
      cache = new PromiseCache(10);
      let callCount = 0;
      const fetcher = () => {
        callCount++;
        return new Promise<string>((resolve) => setTimeout(() => resolve(`value-${callCount}`), 10));
      };

      const [a, b] = await Promise.all([
        cache.getOrFetch("key1", fetcher, 60_000),
        cache.getOrFetch("key1", fetcher, 60_000),
      ]);

      expect(a).toBe("value-1");
      expect(b).toBe("value-1");
      expect(callCount).toBe(1);
    });
  });

  describe("maxSize eviction", () => {
    test("should evict oldest entries when maxSize is exceeded", async () => {
      cache = new PromiseCache(3);

      await cache.getOrFetch("a", () => Promise.resolve(1), 60_000);
      await cache.getOrFetch("b", () => Promise.resolve(2), 60_000);
      await cache.getOrFetch("c", () => Promise.resolve(3), 60_000);
      expect(cache.size).toBe(3);

      // Adding a 4th entry should trigger eviction of the oldest ("a")
      await cache.getOrFetch("d", () => Promise.resolve(4), 60_000);
      expect(cache.size).toBe(3);

      // "a" should have been evicted — re-fetching should call a new fetcher
      let refetched = false;
      await cache.getOrFetch(
        "a",
        () => {
          refetched = true;
          return Promise.resolve(10);
        },
        60_000,
      );
      expect(refetched).toBe(true);
    });

    test("should prefer evicting expired entries before live ones", async () => {
      cache = new PromiseCache(3);

      vi.useFakeTimers();
      try {
        // "a" gets a short TTL, "b" and "c" get long TTLs
        await cache.getOrFetch("a", () => Promise.resolve(1), 50);
        await cache.getOrFetch("b", () => Promise.resolve(2), 60_000);
        await cache.getOrFetch("c", () => Promise.resolve(3), 60_000);

        // Expire "a"
        vi.advanceTimersByTime(51);

        // Adding "d" should sweep expired "a" first, so "b" and "c" survive
        await cache.getOrFetch("d", () => Promise.resolve(4), 60_000);
        expect(cache.size).toBe(3);

        // "b" should still be cached (not evicted)
        let bRefetched = false;
        await cache.getOrFetch(
          "b",
          () => {
            bRefetched = true;
            return Promise.resolve(20);
          },
          60_000,
        );
        expect(bRefetched).toBe(false);
      } finally {
        vi.useRealTimers();
      }
    });

    test("should respect maxSize of 1", async () => {
      cache = new PromiseCache(1);

      await cache.getOrFetch("a", () => Promise.resolve(1), 60_000);
      expect(cache.size).toBe(1);

      await cache.getOrFetch("b", () => Promise.resolve(2), 60_000);
      expect(cache.size).toBe(1);

      // Only "b" should remain
      let aRefetched = false;
      await cache.getOrFetch(
        "a",
        () => {
          aRefetched = true;
          return Promise.resolve(10);
        },
        60_000,
      );
      expect(aRefetched).toBe(true);
    });
  });

  describe("sweepExpired", () => {
    test("should remove all expired entries", async () => {
      cache = new PromiseCache(100);

      vi.useFakeTimers();
      try {
        await cache.getOrFetch("short1", () => Promise.resolve(1), 50);
        await cache.getOrFetch("short2", () => Promise.resolve(2), 50);
        await cache.getOrFetch("long1", () => Promise.resolve(3), 60_000);
        expect(cache.size).toBe(3);

        vi.advanceTimersByTime(51);

        const removed = cache.sweepExpired();
        expect(removed).toBe(2);
        expect(cache.size).toBe(1);
      } finally {
        vi.useRealTimers();
      }
    });

    test("should return 0 when nothing is expired", async () => {
      cache = new PromiseCache(100);

      await cache.getOrFetch("a", () => Promise.resolve(1), 60_000);
      await cache.getOrFetch("b", () => Promise.resolve(2), 60_000);

      const removed = cache.sweepExpired();
      expect(removed).toBe(0);
      expect(cache.size).toBe(2);
    });
  });

  describe("clear", () => {
    test("should remove all entries", async () => {
      cache = new PromiseCache(10);

      await cache.getOrFetch("a", () => Promise.resolve(1), 60_000);
      await cache.getOrFetch("b", () => Promise.resolve(2), 60_000);
      expect(cache.size).toBe(2);

      cache.clear();
      expect(cache.size).toBe(0);
    });
  });
});
