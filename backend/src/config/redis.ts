import { createClient } from "redis";
import { env } from "./env";

export const redis = createClient({ url: env.REDIS_URL });

redis.on("error", (error: Error) => {
  if (env.NODE_ENV !== "test")
    console.error("Redis connection error", error.message);
});

export async function connectRedis(): Promise<void> {
  if (!redis.isOpen) await redis.connect();
}

export async function disconnectRedis(): Promise<void> {
  if (redis.isOpen) await redis.quit();
}
