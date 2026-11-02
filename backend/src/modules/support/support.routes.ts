import { Router } from "express";
import { z } from "zod";
import { randomInt } from "node:crypto";
import { prisma } from "../../config/database";
import { authenticate } from "../../common/middleware/authenticate";
import { authorize } from "../../common/middleware/authorize";
import type { AuthenticatedRequest } from "../../common/types/authenticated-request";
import { AppError } from "../../common/errors/app-error";

export const supportRouter = Router();

/**
 * Public FAQ endpoint supporting English, Hindi, and Punjabi.
 */
supportRouter.get("/faqs", async (req, res, next) => {
  try {
    const lang = (String(req.query.lang || "en").toLowerCase()) as "en" | "hi" | "pa";
    const faqs = await prisma.supportFaq.findMany({
      where: { active: true },
      orderBy: { order: "asc" },
    });

    const localized = faqs.map((f) => ({
      id: f.id,
      category: f.category,
      question: lang === "hi" ? f.questionHi : lang === "pa" ? f.questionPa : f.questionEn,
      answer: lang === "hi" ? f.answerHi : lang === "pa" ? f.answerPa : f.answerEn,
      language: lang,
    }));

    res.json(localized);
  } catch (e) {
    next(e);
  }
});

// Authenticated ticket endpoints
supportRouter.post("/tickets", authenticate, async (req, res, next) => {
  try {
    const user = (req as AuthenticatedRequest).user!;
    const d = z
      .object({
        category: z.enum(["BOOKING", "PAYMENT", "WORKER", "CUSTOMER", "ACCOUNT", "OTHER"]).default("OTHER"),
        priority: z.enum(["LOW", "MEDIUM", "HIGH", "URGENT"]).default("MEDIUM"),
        subject: z.string().trim().min(5).max(200),
        description: z.string().trim().min(10).max(4000),
        bookingId: z.string().uuid().optional(),
      })
      .parse(req.body);

    const ticketNumber = `UST-${Date.now().toString().slice(-6)}-${randomInt(100, 999)}`;

    const ticket = await prisma.supportTicket.create({
      data: {
        ticketNumber,
        userId: user.id,
        category: d.category,
        priority: d.priority,
        subject: d.subject,
        description: d.description,
        bookingId: d.bookingId ?? null,
        messages: {
          create: {
            senderId: user.id,
            senderRole: user.role,
            message: d.description,
          },
        },
      },
      include: { messages: true },
    });

    res.status(201).json(ticket);
  } catch (e) {
    next(e);
  }
});

supportRouter.get("/tickets", authenticate, async (req, res, next) => {
  try {
    const user = (req as AuthenticatedRequest).user!;
    const tickets = await prisma.supportTicket.findMany({
      where: { userId: user.id },
      orderBy: { createdAt: "desc" },
      include: {
        _count: { select: { messages: true } },
      },
    });
    res.json(tickets);
  } catch (e) {
    next(e);
  }
});

supportRouter.get("/tickets/:id", authenticate, async (req, res, next) => {
  try {
    const user = (req as AuthenticatedRequest).user!;
    const ticket = await prisma.supportTicket.findUnique({
      where: { id: String(req.params.id) },
      include: {
        messages: {
          orderBy: { createdAt: "asc" },
          include: { sender: { select: { id: true, name: true, role: true } } },
        },
      },
    });

    if (!ticket) throw new AppError(404, "Ticket not found");
    if (ticket.userId !== user.id && user.role !== "ADMIN") {
      throw new AppError(403, "Not authorized to view this ticket");
    }

    res.json(ticket);
  } catch (e) {
    next(e);
  }
});

supportRouter.post("/tickets/:id/messages", authenticate, async (req, res, next) => {
  try {
    const user = (req as AuthenticatedRequest).user!;
    const ticket = await prisma.supportTicket.findUnique({
      where: { id: String(req.params.id) },
    });

    if (!ticket) throw new AppError(404, "Ticket not found");
    if (ticket.userId !== user.id && user.role !== "ADMIN") {
      throw new AppError(403, "Not authorized to respond to this ticket");
    }
    if (ticket.status === "CLOSED") {
      throw new AppError(409, "Ticket is closed");
    }

    const d = z
      .object({
        message: z.string().trim().min(1).max(3000),
        attachmentUrl: z.string().url().optional(),
      })
      .parse(req.body);

    const message = await prisma.ticketMessage.create({
      data: {
        ticketId: ticket.id,
        senderId: user.id,
        senderRole: user.role,
        message: d.message,
        attachmentUrl: d.attachmentUrl ?? null,
      },
    });

    // If customer/worker sent message and status was RESOLVED, reopen to IN_PROGRESS
    if (user.role !== "ADMIN" && ticket.status === "RESOLVED") {
      await prisma.supportTicket.update({
        where: { id: ticket.id },
        data: { status: "IN_PROGRESS" },
      });
    }

    res.status(201).json(message);
  } catch (e) {
    next(e);
  }
});

// Admin-specific support ticket operations
export const adminSupportRouter = Router();
adminSupportRouter.use(authenticate, authorize("ADMIN"));

adminSupportRouter.get("/tickets", async (req, res, next) => {
  try {
    const q = z
      .object({
        status: z.enum(["OPEN", "IN_PROGRESS", "RESOLVED", "CLOSED"]).optional(),
        priority: z.enum(["LOW", "MEDIUM", "HIGH", "URGENT"]).optional(),
        category: z.enum(["BOOKING", "PAYMENT", "WORKER", "CUSTOMER", "ACCOUNT", "OTHER"]).optional(),
      })
      .parse(req.query);

    const tickets = await prisma.supportTicket.findMany({
      where: {
        ...(q.status ? { status: q.status } : {}),
        ...(q.priority ? { priority: q.priority } : {}),
        ...(q.category ? { category: q.category } : {}),
      },
      include: {
        user: { select: { id: true, name: true, email: true, phone: true, role: true } },
        _count: { select: { messages: true } },
      },
      orderBy: { createdAt: "desc" },
    });

    res.json(tickets);
  } catch (e) {
    next(e);
  }
});

adminSupportRouter.post("/tickets/:id/resolve", async (req, res, next) => {
  try {
    const actor = (req as AuthenticatedRequest).user!;
    const { resolution } = z
      .object({ resolution: z.string().trim().min(5).max(4000) })
      .parse(req.body);

    const ticket = await prisma.supportTicket.update({
      where: { id: String(req.params.id) },
      data: {
        status: "RESOLVED",
        resolution,
        assignedAdminId: actor.id,
      },
    });

    await prisma.ticketMessage.create({
      data: {
        ticketId: ticket.id,
        senderId: actor.id,
        senderRole: "ADMIN",
        message: `Ticket marked as resolved: ${resolution}`,
      },
    });

    res.json(ticket);
  } catch (e) {
    next(e);
  }
});

adminSupportRouter.post("/tickets/:id/assign", async (req, res, next) => {
  try {
    const { adminId } = z.object({ adminId: z.string().uuid() }).parse(req.body);
    const ticket = await prisma.supportTicket.update({
      where: { id: String(req.params.id) },
      data: {
        assignedAdminId: adminId,
        status: "IN_PROGRESS",
      },
    });
    res.json(ticket);
  } catch (e) {
    next(e);
  }
});
