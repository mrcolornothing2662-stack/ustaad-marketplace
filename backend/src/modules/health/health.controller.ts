import type { RequestHandler } from "express";
import type { HealthService } from "./health.service";

export class HealthController {
  constructor(private readonly healthService: HealthService) {}

  liveness: RequestHandler = (_request, response) => {
    response.status(200).json(this.healthService.liveness());
  };

  readiness: RequestHandler = async (_request, response, next) => {
    try {
      const result = await this.healthService.readiness();
      response.status(result.status === "ready" ? 200 : 503).json(result);
    } catch (error) {
      next(error);
    }
  };
}
