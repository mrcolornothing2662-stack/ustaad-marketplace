import { Router } from "express";
import { HealthController } from "./health.controller";
import { dependencyProbes } from "./health.probes";
import { HealthService } from "./health.service";

export function createHealthRouter(probes = dependencyProbes): Router {
  const router = Router();
  const controller = new HealthController(new HealthService(probes));
  router.get("/health", controller.liveness);
  router.get("/ready", controller.readiness);
  return router;
}
