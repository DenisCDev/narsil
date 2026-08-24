import { describe, expect, it } from "vitest";
import { generateCrudHandlers } from "./crud.js";

const tableName = Symbol.for("drizzle:Name");

function fakeTable() {
  return {
    [tableName]: "posts",
    id: { dataType: "string", primaryKey: true },
    userId: { dataType: "string" },
    title: { dataType: "string" },
  };
}

function fakeDb(rows: Record<string, unknown>[] = []) {
  const calls: { where?: unknown; values?: unknown } = {};
  const thenable = {
    where(cond: unknown) {
      calls.where = cond;
      return thenable;
    },
    limit() {
      return Promise.resolve(rows);
    },
    offset() {
      return thenable;
    },
    returning() {
      return Promise.resolve(rows);
    },
  };
  return {
    calls,
    select: () => ({ from: () => thenable }),
    insert: () => ({
      values(v: unknown) {
        calls.values = v;
        return thenable;
      },
    }),
    update: () => ({
      set() {
        return thenable;
      },
    }),
    delete: () => thenable,
  };
}

describe("generateCrudHandlers owner scope", () => {
  it("stamps ownerField on create and ignores the client value", async () => {
    const db = fakeDb([{ id: "1", title: "t", userId: "u1" }]);
    const handlers = generateCrudHandlers(fakeTable(), db);
    const row = await handlers.create({
      body: { title: "t", userId: "attacker" },
      ownerField: "userId",
      ownerId: "u1",
    });
    expect(db.calls.values).toEqual({ title: "t", userId: "u1" });
    expect(row).toEqual({ id: "1", title: "t", userId: "u1" });
  });

  it("throws a 404-shaped error when get finds nothing", async () => {
    const db = fakeDb([]);
    const handlers = generateCrudHandlers(fakeTable(), db);
    await expect(handlers.get({ params: { id: "nope" } })).rejects.toMatchObject({
      status: 404,
      code: "NOT_FOUND",
    });
  });

  it("applies owner where on list", async () => {
    const db = fakeDb([]);
    const handlers = generateCrudHandlers(fakeTable(), db);
    await handlers.list({ ownerField: "userId", ownerId: "u1", body: { limit: 10 } });
    expect(db.calls.where).toBeDefined();
  });
});
