import type { Server } from "node:http";
import { Server as SocketServer } from "socket.io";
import { z } from "zod";
import { verifyAccessToken } from "../../common/security/tokens";
import { prisma } from "../../config/database";
import { env } from "../../config/env";
import { member } from "./chat.routes";
export function configureChatSocket(server: Server): SocketServer {
  const io = new SocketServer(server, {
    cors: { origin: env.corsOrigins, credentials: true },
  });
  io.use(async (socket, next) => {
    try {
      const raw = z.string().parse(socket.handshake.auth.token),
        identity = verifyAccessToken(raw),
        u = await prisma.user.findUnique({ where: { id: identity.id } });
      if (!u || u.deletedAt || ["SUSPENDED", "DELETED"].includes(u.status))
        throw Error();
      socket.data.token = raw;
      socket.data.user = identity;
      next();
    } catch {
      next(new Error("unauthorized"));
    }
  });
  io.on("connection", (socket) => {
    async function authorize(bookingId: string) {
      const identity = verifyAccessToken(socket.data.token),
        u = await prisma.user.findUnique({ where: { id: identity.id } });
      if (!u || u.deletedAt || ["SUSPENDED", "DELETED"].includes(u.status))
        throw Error("Account unavailable");
      await member(bookingId, u.id);
      return u.id;
    }
    socket.on(
      "booking:join",
      async (bookingId: string, done?: (ok: boolean) => void) => {
        try {
          z.string().uuid().parse(bookingId);
          await authorize(bookingId);
          await socket.join(`booking:${bookingId}`);
          done?.(true);
        } catch {
          done?.(false);
        }
      },
    );
    socket.on("chat:send", async (input: unknown) => {
      try {
        const d = z
            .object({
              bookingId: z.string().uuid(),
              body: z.string().trim().min(1).max(2000),
            })
            .parse(input),
          id = await authorize(d.bookingId);
        if (!socket.rooms.has(`booking:${d.bookingId}`)) return;
        const conversation = await prisma.chatConversation.upsert({
            where: { bookingId: d.bookingId },
            create: { bookingId: d.bookingId },
            update: {},
          }),
          message = await prisma.chatMessage.create({
            data: {
              conversationId: conversation.id,
              senderId: id,
              body: d.body,
            },
          });
        io.to(`booking:${d.bookingId}`).emit("chat:message", message);
      } catch {
        socket.emit("chat:error", {
          message:
            "Message could not be sent. Check booking and sign in again.",
        });
      }
    });
  });
  return io;
}
