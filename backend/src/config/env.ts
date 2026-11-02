import "dotenv/config";
import { z } from "zod";

const envSchema = z.object({
  NODE_ENV: z
    .enum(["development", "test", "production"])
    .default("development"),
  PORT: z.coerce.number().int().positive().default(4000),
  DATABASE_URL: z
    .string()
    .min(1)
    .default(
      "postgresql://ustaad:ustaad_dev_password@localhost:5432/ustaad?schema=public",
    ),
  REDIS_URL: z.string().url().default("redis://localhost:6379"),
  CORS_ORIGINS: z
    .string()
    .default("http://localhost:3000,http://localhost:8080"),
  LOG_LEVEL: z.enum(["error", "warn", "info", "debug"]).default("info"),
  JWT_ACCESS_SECRET: z.string().min(16).default("dev-access-secret-change-me"),
  JWT_REFRESH_SECRET: z
    .string()
    .min(16)
    .default("dev-refresh-secret-change-me"),
  ACCESS_TOKEN_MINUTES: z.coerce.number().positive().default(15),
  REFRESH_TOKEN_DAYS: z.coerce.number().positive().default(30),
  AI_SERVICE_URL: z.string().url().default("http://localhost:8000"),
  MOCK_OTP: z.string().length(6).default("123456"),
});

const parsed = envSchema.safeParse(process.env);
if (!parsed.success) {
  throw new Error(`Invalid environment configuration: ${parsed.error.message}`);
}

export const env = {
  ...parsed.data,
  corsOrigins: parsed.data.CORS_ORIGINS.split(",")
    .map((origin) => origin.trim())
    .filter(Boolean),
};
