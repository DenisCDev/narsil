/**
 * Node.js HTTP Adapter
 *
 * Creates a Node.js http.createServer from a Web Standard fetch handler.
 * Used by app.start() for local development.
 */

import { type IncomingMessage, type Server, type ServerResponse, createServer as createHttpServer } from "node:http";

type FetchHandler = (request: Request) => Promise<Response>;

/**
 * Convert Node.js IncomingMessage to Web Standard Request.
 */
function toWebRequest(req: IncomingMessage): Request {
  const protocol = (req.socket as any).encrypted ? "https" : "http";
  const host = req.headers.host ?? "localhost";
  const url = `${protocol}://${host}${req.url ?? "/"}`;

  const headers = new Headers();
  for (const [key, value] of Object.entries(req.headers)) {
    if (value) {
      if (Array.isArray(value)) {
        for (const v of value) headers.append(key, v);
      } else {
        headers.set(key, value);
      }
    }
  }

  const method = req.method ?? "GET";
  const hasBody = method !== "GET" && method !== "HEAD";

  return new Request(url, {
    method,
    headers,
    body: hasBody ? readableStreamFromIncoming(req) : null,
    // @ts-expect-error Node.js specific option
    duplex: hasBody ? "half" : undefined,
  });
}

/**
 * Convert Node.js IncomingMessage to ReadableStream.
 */
function readableStreamFromIncoming(req: IncomingMessage): ReadableStream<Uint8Array> {
  return new ReadableStream({
    start(controller) {
      req.on("data", (chunk: Buffer) => controller.enqueue(new Uint8Array(chunk)));
      req.on("end", () => controller.close());
      req.on("error", (err) => controller.error(err));
    },
  });
}

/**
 * Write Web Standard Response to Node.js ServerResponse.
 */
async function writeWebResponse(webRes: Response, nodeRes: ServerResponse): Promise<void> {
  nodeRes.writeHead(webRes.status, Object.fromEntries(webRes.headers.entries()));

  if (webRes.body) {
    const reader = webRes.body.getReader();
    try {
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        nodeRes.write(value);
      }
    } finally {
      reader.releaseLock();
    }
  }

  nodeRes.end();
}

/**
 * Create a Node.js HTTP server from a Web Standard fetch handler.
 */
export function createNodeServer(fetchHandler: FetchHandler): Server {
  return createHttpServer(async (req, res) => {
    try {
      const webReq = toWebRequest(req);
      const webRes = await fetchHandler(webReq);
      await writeWebResponse(webRes, res);
    } catch (error) {
      console.error("[Narsil] Server error:", error);
      res.writeHead(500, { "Content-Type": "application/json" });
      res.end(JSON.stringify({ error: { code: "INTERNAL_ERROR", message: "Internal server error" } }));
    }
  });
}
