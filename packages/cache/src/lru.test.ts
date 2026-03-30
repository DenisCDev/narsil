import { beforeEach, describe, expect, it, vi } from "vitest";
import { LRUCache } from "./lru.js";

describe("LRUCache", () => {
  let cache: LRUCache<string>;

  beforeEach(() => {
    cache = new LRUCache<string>(3);
  });

  describe("set/get", () => {
    it("stores and retrieves values", () => {
      cache.set("a", "alpha");
      expect(cache.get("a")).toBe("alpha");
    });

    it("returns undefined for missing keys", () => {
      expect(cache.get("missing")).toBeUndefined();
    });

    it("overwrites existing keys", () => {
      cache.set("a", "alpha");
      cache.set("a", "updated");
      expect(cache.get("a")).toBe("updated");
    });
  });

  describe("TTL", () => {
    it("returns value before expiry", () => {
      cache.set("a", "alpha", 10);
      expect(cache.get("a")).toBe("alpha");
    });

    it("returns undefined after TTL expires", () => {
      vi.useFakeTimers();
      cache.set("a", "alpha", 1);
      vi.advanceTimersByTime(1100);
      expect(cache.get("a")).toBeUndefined();
      vi.useRealTimers();
    });

    it("has() returns false for expired entries", () => {
      vi.useFakeTimers();
      cache.set("a", "alpha", 1);
      vi.advanceTimersByTime(1100);
      expect(cache.has("a")).toBe(false);
      vi.useRealTimers();
    });
  });

  describe("eviction", () => {
    it("evicts LRU entry when at capacity", () => {
      cache.set("a", "alpha");
      cache.set("b", "beta");
      cache.set("c", "gamma");
      cache.set("d", "delta"); // should evict 'a'
      expect(cache.get("a")).toBeUndefined();
      expect(cache.get("d")).toBe("delta");
    });

    it("accessing an entry prevents it from being evicted", () => {
      cache.set("a", "alpha");
      cache.set("b", "beta");
      cache.set("c", "gamma");
      cache.get("a"); // move 'a' to front
      cache.set("d", "delta"); // should evict 'b' (LRU)
      expect(cache.get("a")).toBe("alpha");
      expect(cache.get("b")).toBeUndefined();
    });
  });

  describe("delete", () => {
    it("removes an entry", () => {
      cache.set("a", "alpha");
      expect(cache.delete("a")).toBe(true);
      expect(cache.get("a")).toBeUndefined();
    });

    it("returns false for non-existent key", () => {
      expect(cache.delete("missing")).toBe(false);
    });

    it("decrements size", () => {
      cache.set("a", "alpha");
      cache.set("b", "beta");
      cache.delete("a");
      expect(cache.size).toBe(1);
    });
  });

  describe("clear", () => {
    it("removes all entries", () => {
      cache.set("a", "alpha");
      cache.set("b", "beta");
      cache.clear();
      expect(cache.size).toBe(0);
      expect(cache.get("a")).toBeUndefined();
      expect(cache.get("b")).toBeUndefined();
    });
  });
});
