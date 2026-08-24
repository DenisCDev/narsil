/**
 * Prisma auto-CRUD — same REST shape as a default Next.js route.ts pair.
 * The db argument is a PrismaClient (or anything with model delegates).
 */

export interface CrudOptions {
  defaultLimit?: number;
  maxLimit?: number;
}

export interface CrudHandlers {
  list: (ctx: CrudCtx) => Promise<unknown[]>;
  get: (ctx: CrudCtx) => Promise<unknown>;
  create: (ctx: CrudCtx) => Promise<unknown>;
  update: (ctx: CrudCtx) => Promise<unknown>;
  delete: (ctx: CrudCtx) => Promise<{ success: boolean }>;
}

interface CrudCtx {
  params?: Record<string, string>;
  body?: unknown;
  ownerField?: string;
  ownerId?: string;
}

interface ModelDelegate {
  findMany: (args: Record<string, unknown>) => Promise<unknown[]>;
  findFirst: (args: Record<string, unknown>) => Promise<unknown | null>;
  create: (args: Record<string, unknown>) => Promise<unknown>;
  updateMany: (args: Record<string, unknown>) => Promise<{ count: number }>;
  deleteMany: (args: Record<string, unknown>) => Promise<{ count: number }>;
}

const PRISMA_TIMEOUT_MS = 5_000;

const DENIED_WRITE_FIELDS = new Set(["id", "role", "createdAt", "updatedAt", "created_at", "updated_at"]);

export function generatePrismaHandlers(model: string, db: object, options: CrudOptions = {}): CrudHandlers {
  const defaultLimit = options.defaultLimit ?? 50;
  const maxLimit = options.maxLimit ?? 1000;
  const delegate = getDelegate(db, model);

  return {
    list: async (ctx) => {
      const body = ctx.body as Record<string, unknown> | undefined;
      const take = Math.min(typeof body?.limit === "number" ? body.limit : defaultLimit, maxLimit);
      const skip = typeof body?.offset === "number" ? body.offset : undefined;
      return withDeadline(
        delegate.findMany({
          take,
          skip,
          where: ownerWhere(ctx),
        }),
      );
    },

    get: async (ctx) => {
      const id = ctx.params?.id;
      if (!id) throw createError("VALIDATION", "id", "Required");
      const row = await withDeadline(delegate.findFirst({ where: { id, ...ownerWhere(ctx) } }));
      if (!row) throw createError("NOT_FOUND", model, id);
      return row;
    },

    create: async (ctx) => {
      if (!ctx.body || typeof ctx.body !== "object") {
        throw createError("VALIDATION", "body", "Request body is required");
      }
      return withDeadline(delegate.create({ data: sanitizeWrite(ctx.body as Record<string, unknown>, ctx) }));
    },

    update: async (ctx) => {
      const id = ctx.params?.id;
      if (!id) throw createError("VALIDATION", "id", "Required");
      if (!ctx.body || typeof ctx.body !== "object") {
        throw createError("VALIDATION", "body", "Request body is required");
      }
      const data = sanitizeWrite(ctx.body as Record<string, unknown>, ctx);
      const result = await withDeadline(delegate.updateMany({ where: { id, ...ownerWhere(ctx) }, data }));
      if (result.count === 0) throw createError("NOT_FOUND", model, id);
      const row = await withDeadline(delegate.findFirst({ where: { id, ...ownerWhere(ctx) } }));
      if (!row) throw createError("NOT_FOUND", model, id);
      return row;
    },

    delete: async (ctx) => {
      const id = ctx.params?.id;
      if (!id) throw createError("VALIDATION", "id", "Required");
      const result = await withDeadline(delegate.deleteMany({ where: { id, ...ownerWhere(ctx) } }));
      if (result.count === 0) throw createError("NOT_FOUND", model, id);
      return { success: true };
    },
  };
}

function getDelegate(db: object, model: string): ModelDelegate {
  const value = (db as Record<string, unknown>)[model];
  if (!value || typeof value !== "object") {
    throw new Error(`Prisma model "${model}" not found on the client`);
  }
  return value as ModelDelegate;
}

function ownerWhere(ctx: CrudCtx): Record<string, unknown> {
  if (!ctx.ownerField || !ctx.ownerId) return {};
  return { [ctx.ownerField]: ctx.ownerId };
}

function sanitizeWrite(data: Record<string, unknown>, ctx: CrudCtx): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(data)) {
    if (DENIED_WRITE_FIELDS.has(key)) continue;
    if (ctx.ownerField && key === ctx.ownerField) continue;
    if (value !== null && typeof value === "object") continue;
    out[key] = value;
  }
  if (ctx.ownerField && ctx.ownerId) out[ctx.ownerField] = ctx.ownerId;
  return out;
}

function withDeadline<T>(promise: Promise<T>, ms = PRISMA_TIMEOUT_MS): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error(`prisma timed out after ${ms}ms`)), ms);
    promise.then(
      (value) => {
        clearTimeout(timer);
        resolve(value);
      },
      (err: unknown) => {
        clearTimeout(timer);
        reject(err);
      },
    );
  });
}

function createError(type: "VALIDATION" | "NOT_FOUND", ...args: string[]) {
  if (type === "VALIDATION") {
    const err = new Error(`Validation failed: ${args[0]} — ${args[1]}`) as Error & {
      code: string;
      status: number;
      details: unknown;
      toJSON: () => unknown;
    };
    err.code = "VALIDATION_ERROR";
    err.status = 400;
    err.details = { field: args[0], message: args[1] };
    err.toJSON = () => ({ error: { code: err.code, message: err.message, details: err.details } });
    return err;
  }
  const err = new Error(`${args[0]}${args[1] ? ` (${args[1]})` : ""} not found`) as Error & {
    code: string;
    status: number;
    details: unknown;
    toJSON: () => unknown;
  };
  err.code = "NOT_FOUND";
  err.status = 404;
  err.details = { resource: args[0], id: args[1] };
  err.toJSON = () => ({ error: { code: err.code, message: err.message, details: err.details } });
  return err;
}
