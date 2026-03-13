/**
 * NexusFlow Error Hierarchy
 * Lightweight, serializable errors with HTTP status codes.
 */

export class NexusError extends Error {
  public readonly code: string
  public readonly status: number
  public readonly details?: Record<string, unknown>

  constructor(
    message: string,
    opts: { code?: string; status?: number; details?: Record<string, unknown> } = {}
  ) {
    super(message)
    this.name = 'NexusError'
    this.code = opts.code ?? 'INTERNAL_ERROR'
    this.status = opts.status ?? 500
    this.details = opts.details
  }

  toJSON() {
    return {
      error: {
        code: this.code,
        message: this.message,
        ...(this.details ? { details: this.details } : {}),
      },
    }
  }
}

export class NexusValidationError extends NexusError {
  constructor(field: string, message: string) {
    super(`Validation failed: ${field} — ${message}`, {
      code: 'VALIDATION_ERROR',
      status: 400,
      details: { field, message },
    })
    this.name = 'NexusValidationError'
  }
}

export class NexusNotFoundError extends NexusError {
  constructor(resource: string, id?: string) {
    super(`${resource}${id ? ` (${id})` : ''} not found`, {
      code: 'NOT_FOUND',
      status: 404,
      details: { resource, id },
    })
    this.name = 'NexusNotFoundError'
  }
}

export class NexusAuthError extends NexusError {
  constructor(message = 'Authentication required') {
    super(message, { code: 'UNAUTHORIZED', status: 401 })
    this.name = 'NexusAuthError'
  }
}

export class NexusForbiddenError extends NexusError {
  constructor(message = 'Permission denied') {
    super(message, { code: 'FORBIDDEN', status: 403 })
    this.name = 'NexusForbiddenError'
  }
}

export class NexusDatabaseError extends NexusError {
  constructor(message: string, details?: Record<string, unknown>) {
    super(message, { code: 'DATABASE_ERROR', status: 500, details })
    this.name = 'NexusDatabaseError'
  }
}
