/**
 * Validation Middleware Factory
 *
 * Uses Zod schemas for request validation.
 * Returns 400 with detailed errors on invalid input.
 */

export interface ValidateConfig {
  /** Zod schema to validate body */
  body?: any;
  /** Zod schema to validate query params */
  query?: any;
  /** Zod schema to validate route params */
  params?: any;
}

/**
 * Create a validation middleware for a specific route.
 * Usage: app.use(validate({ body: z.object({ name: z.string() }) }))
 */
export function validate(config: ValidateConfig) {
  return {
    name: "validate",
    handler: async ({ ctx, next }: { ctx: any; next: () => Promise<unknown> }) => {
      // Validate body
      if (config.body && ctx.body) {
        const result = config.body.safeParse(ctx.body);
        if (!result.success) {
          const err = new Error("Validation failed") as any;
          err.code = "VALIDATION_ERROR";
          err.status = 400;
          err.details = {
            errors: result.error.issues.map((issue: any) => ({
              path: issue.path.join("."),
              message: issue.message,
            })),
          };
          err.toJSON = () => ({ error: { code: err.code, message: err.message, details: err.details } });
          throw err;
        }
        ctx.body = result.data;
      }

      // Validate query params
      if (config.query && ctx.body && ctx.request?.method === "GET") {
        const result = config.query.safeParse(ctx.body);
        if (!result.success) {
          const err = new Error("Query validation failed") as any;
          err.code = "VALIDATION_ERROR";
          err.status = 400;
          err.details = {
            errors: result.error.issues.map((issue: any) => ({
              path: issue.path.join("."),
              message: issue.message,
            })),
          };
          err.toJSON = () => ({ error: { code: err.code, message: err.message, details: err.details } });
          throw err;
        }
      }

      // Validate route params
      if (config.params && ctx.params) {
        const result = config.params.safeParse(ctx.params);
        if (!result.success) {
          const err = new Error("Params validation failed") as any;
          err.code = "VALIDATION_ERROR";
          err.status = 400;
          err.details = {
            errors: result.error.issues.map((issue: any) => ({
              path: issue.path.join("."),
              message: issue.message,
            })),
          };
          err.toJSON = () => ({ error: { code: err.code, message: err.message, details: err.details } });
          throw err;
        }
      }

      return next();
    },
  };
}
