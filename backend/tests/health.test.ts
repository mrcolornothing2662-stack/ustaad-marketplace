process.env.NODE_ENV = "test";

import request from "supertest";
import { createApp } from "../src/app";
import type { DependencyProbe } from "../src/modules/health/health.types";

describe("operational health endpoints", () => {
  test("GET /health reports liveness without checking dependencies", async () => {
    const response = await request(createApp([])).get("/health");
    expect(response.status).toBe(200);
    expect(response.body).toMatchObject({
      status: "ok",
      service: "ustaad-backend",
    });
  });

  test("GET /ready reports ready when every dependency is up", async () => {
    const probes: DependencyProbe[] = [
      { name: "postgres", check: async () => undefined },
      { name: "redis", check: async () => undefined },
    ];
    const response = await request(createApp(probes)).get("/ready");
    expect(response.status).toBe(200);
    expect(response.body).toEqual({
      status: "ready",
      dependencies: [
        { name: "postgres", status: "up" },
        { name: "redis", status: "up" },
      ],
    });
  });

  test("GET /ready returns 503 and identifies an unavailable dependency", async () => {
    const probes: DependencyProbe[] = [
      {
        name: "postgres",
        check: async () => {
          throw new Error("offline");
        },
      },
    ];
    const response = await request(createApp(probes)).get("/ready");
    expect(response.status).toBe(503);
    expect(response.body).toEqual({
      status: "not_ready",
      dependencies: [{ name: "postgres", status: "down" }],
    });
  });

  test("unknown routes use the centralized error response", async () => {
    const response = await request(createApp([])).get("/missing");
    expect(response.status).toBe(404);
    expect(response.body.error.code).toBe("ROUTE_NOT_FOUND");
  });
});
