import { prisma } from "../../config/database";
import { redis } from "../../config/redis";
import type { DependencyProbe } from "./health.types";

export const dependencyProbes: readonly DependencyProbe[] = [
  {
    name: "postgres",
    check: async () => {
      await prisma.$queryRaw`SELECT 1`;
    },
  },
  {
    name: "redis",
    check: async () => {
      await redis.ping();
    },
  },
];
