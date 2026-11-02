import { photoRouter } from "./modules/bookings/booking.photos";
import { accountRouter } from "./modules/account.routes";
import { ZodError } from "zod";
import cors from "cors";
import express, { type Express } from "express";
import helmet from "helmet";
import rateLimit from "express-rate-limit";
import { env } from "./config/env";
import { errorHandler } from "./common/middleware/error-handler";
import { notFoundHandler } from "./common/middleware/not-found";
import { createHealthRouter } from "./modules/health/health.routes";
import type { DependencyProbe } from "./modules/health/health.types";
import { authRouter } from "./modules/auth/auth.routes";
import { providerRouter } from "./modules/providers/provider.routes";
import { categoryRouter } from "./modules/service-categories/service-category.routes";
import { searchRouter } from "./modules/search/search.routes";
import { bookingRouter } from "./modules/bookings/booking.routes";
import { reviewRouter } from "./modules/reviews/review.routes";
import { chatRouter } from "./modules/chat/chat.routes";
import { verificationRouter } from "./modules/verification/verification.routes";
import { adminRouter } from "./modules/admin/admin.routes";
import swaggerUi from "swagger-ui-express";
import openApiDocument from "../docs/openapi.json";

export function createApp(probes?: readonly DependencyProbe[]): Express {
  const app = express();
  app.disable("x-powered-by");
  app.use(helmet());
  app.use(cors({ origin: env.corsOrigins, credentials: true }));
  app.use(
    "/api",
    rateLimit({
      windowMs: 60_000,
      limit: 120,
      standardHeaders: true,
      legacyHeaders: false,
    }),
  );
  app.use(express.json({ limit: "8mb" }));
  app.use(express.urlencoded({ extended: false, limit: "1mb" }));
  app.use(createHealthRouter(probes));
  app.use("/api-docs", swaggerUi.serve, swaggerUi.setup(openApiDocument));
  const api = RouterPlaceholder();
  api.use("/account", accountRouter);
  api.use("/auth", authRouter);
  api.use("/providers", providerRouter);
  api.use("/categories", categoryRouter);
  api.use("/search/providers", searchRouter);
  api.use("/search", searchRouter);
  api.use("/bookings", bookingRouter);
  api.use("/bookings", photoRouter);
  api.use("/reviews", reviewRouter);
  api.use("/chat", chatRouter);
  api.use("/verification", verificationRouter);
  api.use("/admin", adminRouter);
  app.use("/api/v1", api);
  app.use(notFoundHandler);
  app.use((error: any, _req: any, res: any, next: any) => {
    if (error instanceof ZodError)
      return res
        .status(400)
        .json({ message: "Invalid input", issues: error.issues });
    if (error?.code === "P2002")
      return res.status(409).json({ message: "Record already exists" });
    if (error?.code === "P2025")
      return res
        .status(404)
        .json({ message: "Record not found or changed; refresh and retry" });
    next(error);
  });
  app.use(errorHandler);
  return app;
}

function RouterPlaceholder(): express.Router {
  const router = express.Router();
  router.get("/", (_request, response) =>
    response.json({ name: "Ustaad Marketplace API", version: "v1" }),
  );
  return router;
}
