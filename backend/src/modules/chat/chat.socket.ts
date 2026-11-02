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
      const raw = z.string().parse(socket.handshake.auth.token);
      const identity = verifyAccessToken(raw);
      const u = await prisma.user.findUnique({ where: { id: identity.id } });
      if (!u || u.deletedAt || ["SUSPENDED", "DELETED"].includes(u.status)) {
        throw Error();
      }
      socket.data.token = raw;
      socket.data.user = identity;
      next();
    } catch {
      next(new Error("unauthorized"));
    }
  });

  io.on("connection", (socket) => {
    async function authorize(bookingId: string) {
      const identity = verifyAccessToken(socket.data.token);
      const u = await prisma.user.findUnique({ where: { id: identity.id } });
      if (!u || u.deletedAt || ["SUSPENDED", "DELETED"].includes(u.status)) {
        throw Error("Account unavailable");
      }
      await member(bookingId, u.id);
      return u;
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
            attachmentUrl: z.string().url().optional(),
          })
          .parse(input);

        const u = await authorize(d.bookingId);
        if (!socket.rooms.has(`booking:${d.bookingId}`)) return;

        const conversation = await prisma.chatConversation.upsert({
          where: { bookingId: d.bookingId },
          create: { bookingId: d.bookingId },
          update: {},
        });

        const message = await prisma.chatMessage.create({
          data: {
            conversationId: conversation.id,
            senderId: u.id,
            body: d.body,
            attachmentUrl: d.attachmentUrl ?? null,
          },
        });

        // Broadcast UI/UX rich payload with sender name and role
        io.to(`booking:${d.bookingId}`).emit("chat:message", {
          id: message.id,
          conversationId: message.conversationId,
          body: message.body,
          attachmentUrl: message.attachmentUrl,
          createdAt: message.createdAt,
          senderId: u.id, // preserved for backward-compatibility
          sender: {
            id: u.id,
            name: u.name,
            role: u.role,
          },
          bookingId: d.bookingId,
        });
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
