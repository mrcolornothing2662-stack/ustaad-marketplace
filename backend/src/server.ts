import { createServer } from "node:http";
import { createApp } from "./app";
import { connectRedis, disconnectRedis } from "./config/redis";
import { disconnectDatabase } from "./config/database";
import { env } from "./config/env";
import { configureChatSocket } from "./modules/chat/chat.socket";

async function start(): Promise<void> {
  await connectRedis();
  const server = createServer(createApp());
  configureChatSocket(server);
  server.listen(env.PORT, () =>
    console.log(`Ustaad API listening on port ${env.PORT}`),
  );

  const shutdown = (signal: string): void => {
    console.log(`${signal} received; shutting down`);
    server.close(() => {
      void Promise.all([disconnectDatabase(), disconnectRedis()]).finally(() =>
        process.exit(0),
      );
    });
  };
  process.on("SIGTERM", () => shutdown("SIGTERM"));
  process.on("SIGINT", () => shutdown("SIGINT"));
}

void start().catch((error: unknown) => {
  console.error("Failed to start server", error);
  process.exit(1);
});
