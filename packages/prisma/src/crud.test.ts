import { describe, expect, it } from "vitest";
import { generatePrismaHandlers } from "./crud.js";

function matchesWhere(row: Record<string, unknown>, where: Record<string, unknown> = {}) {
  return Object.entries(where).every(([k, v]) => row[k] === v);
}

function fakePrisma(rows: Record<string, unknown>[] = []) {
  const calls: { where?: unknown; data?: unknown } = {};
  return {
    calls,
    user: {
      findMany: async (args: { where?: Record<string, unknown> }) => {
        calls.where = args.where;
        return rows.filter((r) => matchesWhere(r, args.where));
      },
      findFirst: async (args: { where?: Record<string, unknown> }) => {
        calls.where = args.where;
        return rows.find((r) => matchesWhere(r, args.where)) ?? null;
      },
      create: async (args: { data: Record<string, unknown> }) => {
        calls.data = args.data;
        return { id: "1", ...args.data };
      },
      updateMany: async (args: { where: Record<string, unknown>; data: Record<string, unknown> }) => {
        calls.where = args.where;
        calls.data = args.data;
        return { count: rows.filter((r) => matchesWhere(r, args.where)).length };
      },
      deleteMany: async (args: { where: Record<string, unknown> }) => {
        calls.where = args.where;
        return { count: rows.filter((r) => matchesWhere(r, args.where)).length };
      },
    },
  };
}

describe("generatePrismaHandlers", () => {
  it("lists through the Prisma model name", async () => {
    const db = fakePrisma([{ id: "1", name: "Ada" }]);
    const handlers = generatePrismaHandlers("user", db);
    await expect(handlers.list({})).resolves.toEqual([{ id: "1", name: "Ada" }]);
  });

  it("strips role, nested writes, and stamps owner on create", async () => {
    const db = fakePrisma();
    const handlers = generatePrismaHandlers("user", db);
    await handlers.create({
      body: {
        name: "Ada",
        role: "admin",
        userId: "attacker",
        posts: { deleteMany: {} },
        profile: { connect: { id: "x" } },
      },
      ownerField: "userId",
      ownerId: "u1",
    });
    expect(db.calls.data).toEqual({ name: "Ada", userId: "u1" });
  });

  it("updateMany includes owner in where and 404s a foreign row", async () => {
    const db = fakePrisma([{ id: "1", name: "Ada", userId: "other" }]);
    const handlers = generatePrismaHandlers("user", db);
    await expect(
      handlers.update({
        params: { id: "1" },
        body: { name: "Eve" },
        ownerField: "userId",
        ownerId: "u1",
      }),
    ).rejects.toMatchObject({ status: 404, code: "NOT_FOUND" });
    expect(db.calls.where).toEqual({ id: "1", userId: "u1" });
  });

  it("deleteMany 404s when count is zero", async () => {
    const db = fakePrisma([]);
    const handlers = generatePrismaHandlers("user", db);
    await expect(handlers.delete({ params: { id: "nope" } })).rejects.toMatchObject({
      status: 404,
      code: "NOT_FOUND",
    });
  });

  it("throws when the Prisma model is missing", () => {
    expect(() => generatePrismaHandlers("user", {})).toThrow(/not found on the client/);
  });
});
