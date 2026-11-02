import type { DependencyProbe } from "./health.types";

export interface DependencyResult {
  name: string;
  status: "up" | "down";
}

export class HealthService {
  constructor(private readonly probes: readonly DependencyProbe[]) {}

  liveness(): { status: "ok"; service: string; timestamp: string } {
    return {
      status: "ok",
      service: "ustaad-backend",
      timestamp: new Date().toISOString(),
    };
  }

  async readiness(): Promise<{
    status: "ready" | "not_ready";
    dependencies: DependencyResult[];
  }> {
    const dependencies = await Promise.all(
      this.probes.map(async (probe): Promise<DependencyResult> => {
        try {
          await probe.check();
          return { name: probe.name, status: "up" };
        } catch {
          return { name: probe.name, status: "down" };
        }
      }),
    );
    return {
      status: dependencies.every((item) => item.status === "up")
        ? "ready"
        : "not_ready",
      dependencies,
    };
  }
}
