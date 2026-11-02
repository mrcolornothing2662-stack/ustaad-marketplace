import { z } from "zod";
import { Router } from "express";
import { prisma } from "../../config/database";
import { authenticate } from "../../common/middleware/authenticate";
import type { AuthenticatedRequest } from "../../common/types/authenticated-request";
import { AppError } from "../../common/errors/app-error";

export async function member(
  bookingId: string,
  userId: string,
  action: "read" | "write" = "read",
) {
  const b = await prisma.booking.findUnique({
    where: { id: bookingId },
    include: {
      customer: { include: { user: { select: { id: true, name: true, role: true } } } },
      provider: { include: { user: { select: { id: true, name: true, role: true } } } },
    },
  });
  if (!b || ![b.customer.userId, b.provider.userId].includes(userId)) {
    throw new AppError(404, "Booking not found");
  }

  // Chat is strictly unavailable before both parties confirm (PENDING / ACCEPTED)
  if (["PENDING", "ACCEPTED"].includes(b.status)) {
    throw new AppError(
      403,
      "Chat is only available once booking is confirmed by both parties",
    );
  }

  // Write authorization: active bookings allow sending. Completed bookings allow within 48h.
  if (action === "write") {
    if (
      [
        "CANCELLED_BY_CUSTOMER",
        "CANCELLED_BY_PROVIDER",
        "REJECTED",
        "NO_SHOW",
      ].includes(b.status)
    ) {
      throw new AppError(
        403,
        "Cannot send new messages in cancelled or declined bookings",
      );
    }

    if (["COMPLETED", "REVIEWED"].includes(b.status)) {
      const completedTime = b.completedAt
        ? b.completedAt.getTime()
        : b.updatedAt.getTime();
      const hoursSince = (Date.now() - completedTime) / (3600 * 1000);
      if (hoursSince > 48) {
        throw new AppError(
          403,
          "Post-completion chat communication period has expired (48h policy)",
        );
      }
    }
  }

  return b;
}

export const chatRouter = Router();
chatRouter.use(authenticate);

chatRouter.get("/:bookingId/messages", async (req, res, next) => {
  try {
    const u = (req as AuthenticatedRequest).user!;
    const booking = await member(req.params.bookingId!, u.id, "read");

    const messages = await prisma.chatMessage.findMany({
      where: { conversation: { bookingId: req.params.bookingId! } },
      orderBy: { createdAt: "asc" },
    });

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
        senderId: m.senderId,
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
    await member(req.params.bookingId!, u.id, "write");

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
    await member(req.params.bookingId!, u.id, "read");

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

/**
 * Report inappropriate chat messages or behavior.
 */
chatRouter.post("/:bookingId/report", async (req, res, next) => {
  try {
    const u = (req as AuthenticatedRequest).user!;
    const booking = await member(req.params.bookingId!, u.id, "read");

    const d = z
      .object({
        reason: z.string().trim().min(5).max(1000),
        messageId: z.string().uuid().optional(),
      })
      .parse(req.body);

    const otherUserId =
      booking.customer.userId === u.id ? booking.provider.userId : booking.customer.userId;

    const report = await prisma.auditLog.create({
      data: {
        actorId: u.id,
        action: "CHAT_MESSAGE_REPORTED",
        targetType: "Booking",
        targetId: booking.id,
        metadata: {
          messageId: d.messageId,
          reportedUserId: otherUserId,
          reason: d.reason,
          reportedAt: new Date(),
        },
      },
    });

    res.status(201).json({
      success: true,
      reportId: report.id,
      message: "Chat report logged for administrative review.",
    });
  } catch (e) {
    next(e);
  }
});
