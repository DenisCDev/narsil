import { describe, expect, it, vi } from "vitest";

// Mock @narsil/drizzle before importing app
vi.mock("@narsil/drizzle", () => ({
  generateCrudHandlers: (_schema: any, _db: any, _opts: any) => ({
    list: async () => [
      { id: "1", name: "Alice" },
      { id: "2", name: "Bob" },
    ],
    get: async (ctx: any) => ({ id: ctx.params?.id, name: "Alice" }),
    create: async (ctx: any) => ({ id: "3", ...ctx.body }),
    update: async (ctx: any) => ({ id: ctx.params?.id, ...ctx.body }),
    delete: async () => ({ success: true }),
  }),
}));

// Mock @narsil/server/adapters/node (used by start())
vi.mock("@narsil/server/adapters/node", () => ({
  createNodeServer: vi.fn(),
}));

import { createApp } from "./app.js";
import type { ModuleConfig } from "./types.js";

const fakeSchema = {} as any;
const fakeDb = {} as any;

function createTestModule(overrides: Partial<ModuleConfig> = {}): ModuleConfig {
  return {
    schema: fakeSchema,
    ...overrides,
  };
}

describe("createApp integration", () => {
  describe("CRUD via fetch", () => {
    it("GET /api/users returns list", async () => {
      const app = createApp({ db: fakeDb }).module("users", createTestModule());
      const res = await app.fetch(new Request("http://localhost/api/users"));
      expect(res.status).toBe(200);
      const body = await res.json();
      expect(body).toEqual([
        { id: "1", name: "Alice" },
        { id: "2", name: "Bob" },
      ]);
    });

    it("GET /api/users/:id returns single", async () => {
      const app = createApp({ db: fakeDb }).module("users", createTestModule());
      const res = await app.fetch(new Request("http://localhost/api/users/42"));
      expect(res.status).toBe(200);
      const body = await res.json();
      expect(body).toEqual({ id: "42", name: "Alice" });
    });

    it("POST /api/users creates and returns 201", async () => {
      const app = createApp({ db: fakeDb }).module("users", createTestModule());
      const res = await app.fetch(
        new Request("http://localhost/api/users", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ name: "Charlie" }),
        }),
      );
      expect(res.status).toBe(201);
      const body = await res.json();
      expect(body).toEqual({ id: "3", name: "Charlie" });
    });

    it("PATCH /api/users/:id updates", async () => {
      const app = createApp({ db: fakeDb }).module("users", createTestModule());
      const res = await app.fetch(
        new Request("http://localhost/api/users/1", {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ name: "Updated" }),
        }),
      );
      expect(res.status).toBe(200);
      const body = await res.json();
      expect(body).toEqual({ id: "1", name: "Updated" });
    });

    it("DELETE /api/users/:id deletes", async () => {
      const app = createApp({ db: fakeDb }).module("users", createTestModule());
      const res = await app.fetch(new Request("http://localhost/api/users/1", { method: "DELETE" }));
      expect(res.status).toBe(200);
      const body = await res.json();
      expect(body).toEqual({ success: true });
    });

    it("returns 404 for unknown route", async () => {
      const app = createApp({ db: fakeDb }).module("users", createTestModule());
      const res = await app.fetch(new Request("http://localhost/api/unknown"));
      expect(res.status).toBe(404);
    });
  });

  describe("permissions", () => {
    it("blocks unauthenticated access to authenticated route", async () => {
      const app = createApp({ db: fakeDb }).module(
        "users",
        createTestModule({
          permissions: { list: "authenticated" },
        }),
      );
      const res = await app.fetch(new Request("http://localhost/api/users"));
      expect(res.status).toBe(401);
    });

    it("allows authenticated access", async () => {
      const app = createApp({
        db: fakeDb,
        auth: async (token) => (token === "valid" ? { id: "u1", role: "user" } : null),
      }).module(
        "users",
        createTestModule({
          permissions: { list: "authenticated" },
        }),
      );

      const res = await app.fetch(
        new Request("http://localhost/api/users", {
          headers: { Authorization: "Bearer valid" },
        }),
      );
      expect(res.status).toBe(200);
    });

    it("blocks non-admin from admin route", async () => {
      const app = createApp({
        db: fakeDb,
        auth: async () => ({ id: "u1", role: "user" }),
      }).module(
        "users",
        createTestModule({
          permissions: { create: "admin" },
        }),
      );

      const res = await app.fetch(
        new Request("http://localhost/api/users", {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: "Bearer some-token",
          },
          body: JSON.stringify({ name: "Test" }),
        }),
      );
      expect(res.status).toBe(403);
    });
  });

  describe("auth resolution", () => {
    it("resolves user from Bearer token", async () => {
      let capturedUser: any = null;
      const app = createApp({
        db: fakeDb,
        auth: async (token) => (token === "abc" ? { id: "u1", email: "a@b.com" } : null),
      }).module(
        "users",
        createTestModule({
          hooks: {
            beforeCreate: async ({ ctx }) => {
              capturedUser = ctx.user;
            },
          },
        }),
      );

      await app.fetch(
        new Request("http://localhost/api/users", {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: "Bearer abc",
          },
          body: JSON.stringify({ name: "Test" }),
        }),
      );

      expect(capturedUser).toEqual({ id: "u1", email: "a@b.com" });
    });

    it("ctx.user is null without auth header", async () => {
      let capturedUser: any = "not-set";
      const app = createApp({
        db: fakeDb,
        auth: async () => ({ id: "u1" }),
      }).module(
        "users",
        createTestModule({
          hooks: {
            beforeCreate: async ({ ctx }) => {
              capturedUser = ctx.user;
            },
          },
        }),
      );

      await app.fetch(
        new Request("http://localhost/api/users", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ name: "Test" }),
        }),
      );

      expect(capturedUser).toBeNull();
    });
  });

  describe("hooks", () => {
    it("calls beforeCreate and afterCreate hooks", async () => {
      const beforeCreate = vi.fn();
      const afterCreate = vi.fn();

      const app = createApp({ db: fakeDb }).module(
        "users",
        createTestModule({
          hooks: { beforeCreate, afterCreate },
        }),
      );

      await app.fetch(
        new Request("http://localhost/api/users", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ name: "Test" }),
        }),
      );

      expect(beforeCreate).toHaveBeenCalledTimes(1);
      expect(afterCreate).toHaveBeenCalledTimes(1);
    });
  });
});
