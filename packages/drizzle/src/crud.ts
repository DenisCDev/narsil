/**
 * Drizzle Auto-CRUD Generator
 *
 * Generates list/get/create/update/delete handlers
 * from a Drizzle pgTable definition.
 */

import { getColumns, getPrimaryKeyColumn, getTableName } from "./schema-utils.js";

export interface CrudOptions {
  defaultLimit?: number;
  maxLimit?: number;
}

export interface CrudHandlers {
  list: (ctx: any) => Promise<unknown[]>;
  get: (ctx: any) => Promise<unknown>;
  create: (ctx: any) => Promise<unknown>;
  update: (ctx: any) => Promise<unknown>;
  delete: (ctx: any) => Promise<{ success: boolean }>;
}

/**
 * Generate CRUD handlers for a Drizzle table.
 *
 * These handlers are "raw" — they don't check permissions or run hooks.
 * When `ctx.ownerField` + `ctx.ownerId` are set (the `owner` permission),
 * every query is scoped to that column and create stamps it.
 */
export function generateCrudHandlers(table: any, db: any, options: CrudOptions = {}): CrudHandlers {
  const defaultLimit = options.defaultLimit ?? 50;
  const maxLimit = options.maxLimit ?? 1000;
  const pk = getPrimaryKeyColumn(table);

  return {
    list: async (ctx) => {
      const body = ctx.body as Record<string, unknown> | undefined;
      const { eq } = await importDrizzle();

      let query = db.select().from(table);
      const ownerClause = ownerEq(table, ctx, eq);
      if (ownerClause) query = query.where(ownerClause);

      const limit = Math.min(typeof body?.limit === "number" ? body.limit : defaultLimit, maxLimit);
      query = query.limit(limit);

      if (typeof body?.offset === "number") {
        query = query.offset(body.offset);
      }

      return query;
    },

    get: async (ctx) => {
      const { eq, and } = await importDrizzle();
      const id = ctx.params?.id;
      if (!id) throw createError("VALIDATION", "id", "Required");

      const rows = await db
        .select()
        .from(table)
        .where(scopedWhere(table, ctx, eq, and, eq(table[pk.name], id)))
        .limit(1);
      const row = rows[0];
      if (!row) throw createError("NOT_FOUND", getTableName(table), id);
      return row;
    },

    create: async (ctx) => {
      const data = ctx.body;
      if (!data || typeof data !== "object") {
        throw createError("VALIDATION", "body", "Request body is required");
      }

      const values = sanitizeWrite(table, data as Record<string, unknown>, ctx.ownerField, ctx.ownerId);

      const rows = await db.insert(table).values(values).returning();
      return rows[0];
    },

    update: async (ctx) => {
      const { eq, and } = await importDrizzle();
      const id = ctx.params?.id;
      if (!id) throw createError("VALIDATION", "id", "Required");

      const data = ctx.body;
      if (!data || typeof data !== "object") {
        throw createError("VALIDATION", "body", "Request body is required");
      }

      const values = sanitizeWrite(table, data as Record<string, unknown>, ctx.ownerField, undefined);

      const rows = await db
        .update(table)
        .set(values)
        .where(scopedWhere(table, ctx, eq, and, eq(table[pk.name], id)))
        .returning();
      const row = rows[0];
      if (!row) throw createError("NOT_FOUND", getTableName(table), id);
      return row;
    },

    delete: async (ctx) => {
      const { eq, and } = await importDrizzle();
      const id = ctx.params?.id;
      if (!id) throw createError("VALIDATION", "id", "Required");

      const rows = await db
        .delete(table)
        .where(scopedWhere(table, ctx, eq, and, eq(table[pk.name], id)))
        .returning();
      if (rows.length === 0) throw createError("NOT_FOUND", getTableName(table), id);
      return { success: true };
    },
  };
}

const DENIED_WRITE_FIELDS = new Set(["id", "role", "createdAt", "updatedAt", "created_at", "updated_at"]);

function sanitizeWrite(
  table: Record<string, unknown>,
  data: Record<string, unknown>,
  ownerField?: string,
  ownerId?: string,
): Record<string, unknown> {
  const columns = getColumns(table);
  const out: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(data)) {
    if (!(key in columns)) continue;
    if (DENIED_WRITE_FIELDS.has(key)) continue;
    if (ownerField && key === ownerField) continue;
    out[key] = value;
  }
  if (ownerField && ownerId) out[ownerField] = ownerId;
  return out;
}

function ownerEq(
  table: Record<string, unknown>,
  ctx: { ownerField?: string; ownerId?: string },
  eq: (left: unknown, right: unknown) => unknown,
): unknown {
  if (!ctx.ownerField || !ctx.ownerId) return undefined;
  return eq(table[ctx.ownerField], ctx.ownerId);
}

function scopedWhere(
  table: Record<string, unknown>,
  ctx: { ownerField?: string; ownerId?: string },
  eq: (left: unknown, right: unknown) => unknown,
  and: (...args: unknown[]) => unknown,
  primary: unknown,
): unknown {
  const owner = ownerEq(table, ctx, eq);
  return owner ? and(primary, owner) : primary;
}

// ─── Helpers ─────────────────────────────────────────────────────────

/** Lazy import drizzle-orm operators for tree-shaking */
async function importDrizzle() {
  const mod = await import("drizzle-orm");
  return {
    eq: mod.eq as (left: unknown, right: unknown) => unknown,
    and: mod.and as (...args: unknown[]) => unknown,
    sql: mod.sql,
  };
}

/** Create a lightweight error without importing the full error module */
function createError(type: "VALIDATION" | "NOT_FOUND", ...args: string[]) {
  if (type === "VALIDATION") {
    const err = new Error(`Validation failed: ${args[0]} — ${args[1]}`) as any;
    err.code = "VALIDATION_ERROR";
    err.status = 400;
    err.details = { field: args[0], message: args[1] };
    err.toJSON = () => ({ error: { code: err.code, message: err.message, details: err.details } });
    return err;
  }
  const err = new Error(`${args[0]}${args[1] ? ` (${args[1]})` : ""} not found`) as any;
  err.code = "NOT_FOUND";
  err.status = 404;
  err.details = { resource: args[0], id: args[1] };
  err.toJSON = () => ({ error: { code: err.code, message: err.message, details: err.details } });
  return err;
}
