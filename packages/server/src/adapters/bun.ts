/**
 * Bun.serve adapter — the fast local/production host.
 * Next.js Route Handlers are not this path; they still pay Next's pipeline.
 */

type FetchHandler = (request: Request) => Promise<Response> | Response;

export interface BunServeHandle {
  port: number;
  stop(): void;
}

export function createBunServer(fetchHandler: FetchHandler, port: number): BunServeHandle {
  const bun = (globalThis as { Bun?: { serve: (opts: Record<string, unknown>) => { port: number; stop: () => void } } })
    .Bun;
  if (!bun) {
    throw new Error("createBunServer requires the Bun runtime");
  }
  const server = bun.serve({
    port,
    fetch: (request: Request) => fetchHandler(request),
  });
  return { port: server.port, stop: () => server.stop() };
}
