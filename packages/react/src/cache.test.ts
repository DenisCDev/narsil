import { beforeEach, describe, expect, it, vi } from "vitest";
import { QueryCache, buildCacheKey } from "./cache.js";

describe("QueryCache", () => {
  let cache: QueryCache;

  beforeEach(() => {
    cache = new QueryCache();
  });

  describe("get/set", () => {
    it("stores and retrieves data", () => {
      cache.set("users", [{ id: 1 }]);
      expect(cache.get("users")).toEqual([{ id: 1 }]);
    });

    it("returns undefined for missing key", () => {
      expect(cache.get("missing")).toBeUndefined();
    });
  });

  describe("TTL", () => {
    it("returns undefined after TTL expires", () => {
      vi.useFakeTimers();
      cache.set("users", [{ id: 1 }], 1); // 1 second TTL
      vi.advanceTimersByTime(1100);
      expect(cache.get("users")).toBeUndefined();
      vi.useRealTimers();
    });

    it("getStale returns data even after TTL", () => {
      vi.useFakeTimers();
      cache.set("users", [{ id: 1 }], 1);
      vi.advanceTimersByTime(1100);
      expect(cache.getStale("users")).toEqual([{ id: 1 }]);
      vi.useRealTimers();
    });
  });

  describe("invalidateByTag", () => {
    it("removes entries matching a tag", () => {
      cache.set("users:list", [1, 2], 300, ["users"]);
      cache.set("users:1", { id: 1 }, 300, ["users"]);
      cache.set("posts:list", [3], 300, ["posts"]);

      cache.invalidateByTag("users");

      expect(cache.get("users:list")).toBeUndefined();
      expect(cache.get("users:1")).toBeUndefined();
      expect(cache.get("posts:list")).toEqual([3]);
    });
  });

  describe("optimisticUpdate + rollback", () => {
    it("applies optimistic update", () => {
      cache.set("users", [{ id: 1, name: "Alice" }]);
      cache.optimisticUpdate<{ id: number; name: string }[]>("users", (current) => [
        ...(current ?? []),
        { id: 2, name: "Bob" },
      ]);
      expect(cache.get("users")).toEqual([
        { id: 1, name: "Alice" },
        { id: 2, name: "Bob" },
      ]);
    });

    it("rollback restores previous value", () => {
      cache.set("users", [{ id: 1, name: "Alice" }]);
      const rollback = cache.optimisticUpdate<{ id: number; name: string }[]>("users", (current) => [
        ...(current ?? []),
        { id: 2, name: "Bob" },
      ]);
      rollback();
      expect(cache.get("users")).toEqual([{ id: 1, name: "Alice" }]);
    });

    it("rollback removes key if it did not exist before", () => {
      const rollback = cache.optimisticUpdate("new-key", () => "value");
      rollback();
      expect(cache.get("new-key")).toBeUndefined();
    });
  });

  describe("subscribe", () => {
    it("notifies on set", () => {
      const listener = vi.fn();
      cache.subscribe("users", listener);
      cache.set("users", [1, 2]);
      expect(listener).toHaveBeenCalledTimes(1);
    });

    it("notifies on invalidate", () => {
      const listener = vi.fn();
      cache.set("users", [1]);
      cache.subscribe("users", listener);
      cache.invalidate("users");
      expect(listener).toHaveBeenCalledTimes(1);
    });

    it("unsubscribe stops notifications", () => {
      const listener = vi.fn();
      const unsub = cache.subscribe("users", listener);
      unsub();
      cache.set("users", [1]);
      expect(listener).not.toHaveBeenCalled();
    });
  });
});

describe("buildCacheKey", () => {
  it("builds key without params", () => {
    expect(buildCacheKey("users", "list")).toBe("narsil:users:list");
  });

  it("builds key with params", () => {
    expect(buildCacheKey("users", "get", { id: "123" })).toBe('narsil:users:get:{"id":"123"}');
  });
});
