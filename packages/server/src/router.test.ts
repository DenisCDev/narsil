import { describe, expect, it } from "vitest";
import { NexusRouter } from "./router.js";

describe("NexusRouter", () => {
  describe("static routes", () => {
    it("matches an exact static route", () => {
      const router = new NexusRouter();
      const handler = async () => "ok";
      router.add("GET", "/api/users", handler);

      const match = router.match("GET", "/api/users");
      expect(match).not.toBeNull();
      expect(match?.route.handler).toBe(handler);
      expect(match?.params).toEqual({});
    });

    it("distinguishes between methods on the same path", () => {
      const router = new NexusRouter();
      const getHandler = async () => "get";
      const postHandler = async () => "post";
      router.add("GET", "/api/users", getHandler);
      router.add("POST", "/api/users", postHandler);

      expect(router.match("GET", "/api/users")?.route.handler).toBe(getHandler);
      expect(router.match("POST", "/api/users")?.route.handler).toBe(postHandler);
    });
  });

  describe("param routes", () => {
    it("matches a route with :id param", () => {
      const router = new NexusRouter();
      const handler = async () => "ok";
      router.add("GET", "/api/users/:id", handler);

      const match = router.match("GET", "/api/users/abc-123");
      expect(match).not.toBeNull();
      expect(match?.params).toEqual({ id: "abc-123" });
    });

    it("extracts multiple params", () => {
      const router = new NexusRouter();
      const handler = async () => "ok";
      router.add("GET", "/api/:module/:id", handler);

      const match = router.match("GET", "/api/users/42");
      expect(match?.params).toEqual({ module: "users", id: "42" });
    });

    it("prefers static over param when both match", () => {
      const router = new NexusRouter();
      const staticHandler = async () => "static";
      const paramHandler = async () => "param";
      router.add("GET", "/api/users/me", staticHandler);
      router.add("GET", "/api/users/:id", paramHandler);

      const match = router.match("GET", "/api/users/me");
      expect(match?.route.handler).toBe(staticHandler);
    });
  });

  describe("404", () => {
    it("returns null for unmatched path", () => {
      const router = new NexusRouter();
      router.add("GET", "/api/users", async () => "ok");
      expect(router.match("GET", "/api/posts")).toBeNull();
    });

    it("returns null for unmatched method", () => {
      const router = new NexusRouter();
      router.add("GET", "/api/users", async () => "ok");
      expect(router.match("DELETE", "/api/users")).toBeNull();
    });
  });

  describe("getRoutes", () => {
    it("returns all registered routes", () => {
      const router = new NexusRouter();
      router.add("GET", "/a", async () => "a");
      router.add("POST", "/b", async () => "b");
      expect(router.getRoutes()).toHaveLength(2);
    });
  });
});
