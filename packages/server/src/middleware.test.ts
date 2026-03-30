import { describe, expect, it, vi } from "vitest";
import { type NexusMiddleware, composeMiddleware } from "./middleware.js";

describe("composeMiddleware", () => {
  it("executes middleware in order", async () => {
    const order: string[] = [];

    const mw1: NexusMiddleware = {
      name: "first",
      handler: async ({ next }) => {
        order.push("first:before");
        const result = await next();
        order.push("first:after");
        return result;
      },
    };

    const mw2: NexusMiddleware = {
      name: "second",
      handler: async ({ next }) => {
        order.push("second:before");
        const result = await next();
        order.push("second:after");
        return result;
      },
    };

    const final = vi.fn(async () => {
      order.push("final");
      return "result";
    });

    const pipeline = composeMiddleware([mw1, mw2], final);
    const result = await pipeline({});

    expect(result).toBe("result");
    expect(order).toEqual(["first:before", "second:before", "final", "second:after", "first:after"]);
  });

  it("calls final when no middleware", async () => {
    const final = vi.fn(async () => "done");
    const pipeline = composeMiddleware([], final);
    const result = await pipeline({});
    expect(result).toBe("done");
    expect(final).toHaveBeenCalledTimes(1);
  });

  it("passes ctx and route to middleware", async () => {
    const ctxSpy = vi.fn();
    const mw: NexusMiddleware = {
      name: "spy",
      handler: async ({ ctx, route, next }) => {
        ctxSpy(ctx, route);
        return next();
      },
    };

    const pipeline = composeMiddleware([mw], async () => "ok");
    const ctx = { user: null };
    const route = { name: "list", type: "GET", module: "users" };
    await pipeline(ctx, route);

    expect(ctxSpy).toHaveBeenCalledWith(ctx, route);
  });

  it("propagates errors from middleware", async () => {
    const mw: NexusMiddleware = {
      name: "error",
      handler: async () => {
        throw new Error("middleware failed");
      },
    };

    const pipeline = composeMiddleware([mw], async () => "ok");
    await expect(pipeline({})).rejects.toThrow("middleware failed");
  });

  it("propagates errors from final handler", async () => {
    const mw: NexusMiddleware = {
      name: "pass",
      handler: async ({ next }) => next(),
    };

    const pipeline = composeMiddleware([mw], async () => {
      throw new Error("handler failed");
    });
    await expect(pipeline({})).rejects.toThrow("handler failed");
  });

  it("stops chain if middleware does not call next", async () => {
    const mw: NexusMiddleware = {
      name: "blocker",
      handler: async () => "blocked",
    };

    const final = vi.fn(async () => "ok");
    const pipeline = composeMiddleware([mw], final);
    const result = await pipeline({});

    expect(result).toBe("blocked");
    expect(final).not.toHaveBeenCalled();
  });
});
