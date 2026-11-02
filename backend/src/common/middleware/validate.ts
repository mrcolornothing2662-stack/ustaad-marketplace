import type { RequestHandler } from "express";
import type { ZodType } from "zod";
export const validate =
  (schema: ZodType): RequestHandler =>
  (req, _res, next) => {
    const result = schema.safeParse({
      body: req.body,
      query: req.query,
      params: req.params,
    });
    if (!result.success)
      return next(
        Object.assign(new Error("Validation failed"), {
          statusCode: 400,
          code: "VALIDATION_ERROR",
          details: result.error.flatten(),
        }),
      );
    next();
  };
