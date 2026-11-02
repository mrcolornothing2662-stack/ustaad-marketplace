import { z } from "zod";
import { Router } from "express";
import { prisma } from "../../config/database";
import { authenticate } from "../../common/middleware/authenticate";
import type { AuthenticatedRequest } from "../../common/types/authenticated-request";
import { AppError } from "../../common/errors/app-error";
export async function member(bookingId: string, userId: string) {
  const b = await prisma.booking.findUnique({
    where: { id: bookingId },
    include: { customer: true, provider: true },
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
  )
    throw new AppError(403, "Chat is unavailable");
  return b;
}
export const chatRouter = Router();
chatRouter.use(authenticate);
chatRouter.get("/:bookingId/messages", async (req, res, next) => {
  try {
    const u = (req as AuthenticatedRequest).user!;
    await member(req.params.bookingId!, u.id);
    res.json(
      await prisma.chatMessage.findMany({
        where: { conversation: { bookingId: req.params.bookingId! } },
        orderBy: { createdAt: "asc" },
      }),
    );
  } catch (e) {
    next(e);
  }
});
chatRouter.post("/:bookingId/messages", async (req, res, next) => {
  try {
    const u = (req as AuthenticatedRequest).user!;
    await member(req.params.bookingId!, u.id);
    const conversation = await prisma.chatConversation.upsert({
      where: { bookingId: req.params.bookingId! },
      create: { bookingId: req.params.bookingId! },
      update: {},
    });
    res.status(201).json(
      await prisma.chatMessage.create({
        data: {
          conversationId: conversation.id,
          senderId: u.id,
          body: z.string().trim().min(1).max(2000).parse(req.body.body),
        },
      }),
    );
  } catch (e) {
    next(e);
  }
});
