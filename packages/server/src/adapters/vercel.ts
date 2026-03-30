/**
 * Vercel Serverless Adapter
 *
 * Exports a handler compatible with Vercel serverless functions.
 * The NexusApp.fetch() method is already Web Standard, so this is minimal.
 */

type FetchHandler = (request: Request) => Promise<Response>;

/**
 * Create a Vercel-compatible handler from a Web Standard fetch handler.
 * Usage: export default createVercelHandler(app.fetch)
 */
export function createVercelHandler(fetchHandler: FetchHandler) {
  return async (request: Request): Promise<Response> => {
    return fetchHandler(request);
  };
}
