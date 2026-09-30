import { once } from "node:events";
import { describe, expect, it } from "vitest";
import { rateLimit } from "../security/rate-limit.js";
import { createNodeServer } from "./node.js";
import { getClientIP, setClientIP } from "./web-standard.js";

describe("client address trust", () => {
  it("keeps native peer addresses isolated between requests", () => {
    const first = new Request("https://example.com/api");
    const second = new Request("https://example.com/api");
    setClientIP(first, "::ffff:127.0.0.1");
    setClientIP(second, "192.0.2.2");
    expect(getClientIP(first)).toBe("::ffff:127.0.0.1");
    expect(getClientIP(second)).toBe("192.0.2.2");
  });

  it("validates explicitly configured platform addresses", () => {
    const request = new Request("https://example.com/api");
    expect(getClientIP(request, () => "2001:db8::1")).toBe("2001:db8::1");
    expect(getClientIP(request, () => "192.0.2.1, 192.0.2.2")).toBeUndefined();
    expect(getClientIP(request, () => "arbitrary-bucket")).toBeUndefined();
    setClientIP(request, "arbitrary-bucket");
    expect(getClientIP(request)).toBeUndefined();
  });

  it("does not trust addresses supplied in request headers", () => {
    const request = new Request("https://example.com/api", {
      headers: { "x-forwarded-for": "192.0.2.1", "x-real-ip": "192.0.2.2" },
    });
    expect(getClientIP(request)).toBeUndefined();
  });

  it("blocks a direct client that rotates proxy headers", async () => {
    const limiter = rateLimit({ max: 1, windowMs: 60_000 });
    const server = createNodeServer(async (request) => {
      try {
        const response = await limiter.handler({
          ctx: { ip: getClientIP(request) },
          next: async () => new Response("ok"),
        });
        if (!(response instanceof Response)) throw new Error("resposta de teste inválida");
        return response;
      } catch (error) {
        if (error instanceof Error && "status" in error && error.status === 429) {
          return new Response("limitado", { status: 429 });
        }
        throw error;
      }
    });
    server.listen(0, "127.0.0.1");
    await once(server, "listening");
    try {
      const address = server.address();
      if (!address || typeof address === "string") throw new Error("endereço de teste indisponível");
      const url = `http://127.0.0.1:${address.port}/api`;
      const first = await fetch(url, {
        headers: { "x-forwarded-for": "192.0.2.1", "x-real-ip": "192.0.2.1" },
        signal: AbortSignal.timeout(5_000),
      });
      await first.text();
      const second = await fetch(url, {
        headers: { "x-forwarded-for": "192.0.2.2", "x-real-ip": "192.0.2.2" },
        signal: AbortSignal.timeout(5_000),
      });
      await second.text();
      expect([first.status, second.status]).toEqual([200, 429]);
    } finally {
      await new Promise<void>((resolve, reject) => {
        server.close((error) => (error ? reject(error) : resolve()));
        server.closeAllConnections();
      });
    }
  });

  it("uses separate buckets for different native peers", async () => {
    const limiter = rateLimit({ max: 1, windowMs: 60_000 });
    for (const address of ["192.0.2.1", "192.0.2.2"]) {
      const request = new Request("https://example.com/api");
      setClientIP(request, address);
      const response = await limiter.handler({
        ctx: { ip: getClientIP(request) },
        next: async () => new Response("ok"),
      });
      expect(response).toBeInstanceOf(Response);
      if (response instanceof Response) expect(response.status).toBe(200);
    }
  });
});
