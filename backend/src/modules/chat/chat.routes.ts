import { z } from "zod";
import { Router } from "express";
import { prisma } from "../../config/database";
import { authenticate } from "../../common/middleware/authenticate";
import type { AuthenticatedRequest } from "../../common/types/authenticated-request";
import { AppError } from "../../common/errors/app-error";

export async function member(bookingId: string, userId: string) {
  const b = await prisma.booking.findUnique({
    where: { id: bookingId },
    include: {
      customer: { include: { user: { select: { id: true, name: true, role: true } } } },
      provider: { include: { user: { select: { id: true, name: true, role: true } } } },
    },
  });
  if (
    !b ||
    ![b.customer.userId, b.provider.userId].includes(userId) ||
    ![
      "CONFIRMED",
      "PROVIDER_ON_THE_WAY",
      "IN_PROGRESS",
      "AWAITING_CUSTOMER_CONFIRMATION",
      "COMPLETED",
      "REVIEWED",
    ].includes(b.status)
  ) {
    throw new AppError(403, "Chat is unavailable");
  }
  return b;
}

export const chatRouter = Router();
chatRouter.use(authenticate);

chatRouter.get("/:bookingId/messages", async (req, res, next) => {
  try {
    const u = (req as AuthenticatedRequest).user!;
    const booking = await member(req.params.bookingId!, u.id);

    const messages = await prisma.chatMessage.findMany({
      where: { conversation: { bookingId: req.params.bookingId! } },
      orderBy: { createdAt: "asc" },
    });

    // Lookup participant identities for UI/UX representation
    const customerUser = booking.customer.user;
    const providerUser = booking.provider.user;
    const userMap: Record<string, { id: string; name: string; role: string }> = {
      [customerUser.id]: customerUser,
      [providerUser.id]: providerUser,
    };

    const enriched = messages.map((m) => {
      const sender = userMap[m.senderId] || { id: m.senderId, name: "User", role: "UNKNOWN" };
      return {
        id: m.id,
        body: m.body,
        attachmentUrl: m.attachmentUrl,
        isRead: m.isRead,
        createdAt: m.createdAt,
        senderId: m.senderId, // preserved for backward-compatibility
        sender: {
          id: sender.id,
          name: sender.name,
          role: sender.role,
        },
        isMe: m.senderId === u.id,
      };
    });

    res.json(enriched);
  } catch (e) {
    next(e);
  }
});

chatRouter.post("/:bookingId/messages", async (req, res, next) => {
  try {
    const u = (req as AuthenticatedRequest).user!;
    await member(req.params.bookingId!, u.id);

    const d = z
      .object({
        body: z.string().trim().min(1).max(2000),
        attachmentUrl: z.string().url().optional(),
      })
      .parse(req.body);

    const conversation = await prisma.chatConversation.upsert({
      where: { bookingId: req.params.bookingId! },
      create: { bookingId: req.params.bookingId! },
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

    const user = await prisma.user.findUnique({
      where: { id: u.id },
      select: { id: true, name: true, role: true },
    });

    res.status(201).json({
      id: message.id,
      conversationId: message.conversationId,
      body: message.body,
      attachmentUrl: message.attachmentUrl,
      createdAt: message.createdAt,
      senderId: message.senderId,
      sender: user,
      isMe: true,
    });
  } catch (e) {
    next(e);
  }
});

chatRouter.post("/:bookingId/read", async (req, res, next) => {
  try {
    const u = (req as AuthenticatedRequest).user!;
    await member(req.params.bookingId!, u.id);

    const updated = await prisma.chatMessage.updateMany({
      where: {
        conversation: { bookingId: req.params.bookingId! },
        senderId: { not: u.id },
        isRead: false,
      },
      data: {
        isRead: true,
        readAt: new Date(),
      },
    });

    res.json({ markedRead: updated.count });
  } catch (e) {
    next(e);
  }
});
