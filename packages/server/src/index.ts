/**
 * @nexusflow/server
 *
 * Server runtime: router, middleware pipeline, request handler.
 */

export { NexusRouter } from './router.js'
export type { HttpMethod, Route, RouteHandler, ModelHandlers } from './router.js'

export { composeMiddleware, cors, logger } from './middleware.js'
export type { MiddlewareHandler } from './middleware.js'

export { createServer } from './handler.js'
export type { NexusServerOptions, NexusServer, NexusCaller } from './handler.js'

export { parseHeaders, getClientIP, getAuthToken } from './adapters/web-standard.js'
