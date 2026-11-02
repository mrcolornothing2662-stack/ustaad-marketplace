import type { ErrorRequestHandler } from "express";
import { ZodError } from "zod";
import { AppError } from "../errors/app-error";
import { env } from "../../config/env";

export const errorHandler: ErrorRequestHandler = (
  error: unknown,
  _request,
  response,
  _next,
) => {
  if (error instanceof ZodError) {
    response.status(400).json({
      error: {
        code: "VALIDATION_ERROR",
        message: "Request validation failed",
        details: error.issues,
      },
    });
    return;
  }

  const appError =
    error instanceof AppError
      ? error
      : new AppError(500, "An unexpected error occurred", "INTERNAL_ERROR");
  if (appError.statusCode >= 500 && env.NODE_ENV !== "test")
    console.error(appError);

  response.status(appError.statusCode).json({
    error: {
      code: appError.code,
      message: appError.message,
      ...(appError.details === undefined ? {} : { details: appError.details }),
    },
  });
};
