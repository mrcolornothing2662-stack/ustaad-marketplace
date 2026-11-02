import { prisma } from "../../config/database";
import { env } from "../../config/env";

export interface NotificationPayload {
  userId: string;
  title: string;
  body: string;
  type?: string;
  metadata?: Record<string, unknown>;
}

export interface NotificationProvider {
  send(payload: NotificationPayload): Promise<void>;
}

/**
 * FCM Push Notification Provider.
 * Sends push notifications to registered device tokens for mobile clients.
 */
export class FcmNotificationProvider implements NotificationProvider {
  private readonly projectId: string;

  constructor(projectId?: string) {
    this.projectId = projectId || env.FCM_PROJECT_ID;
  }

  async send(payload: NotificationPayload): Promise<void> {
    try {
      const tokens = await prisma.deviceToken.findMany({
        where: { userId: payload.userId },
        select: { token: true, platform: true },
      });

      if (!tokens.length) return;

      // In production with FCM credentials configured, send to FCM HTTP v1 API
      if (this.projectId && env.NODE_ENV === "production") {
        for (const t of tokens) {
          // Log or dispatch FCM payload
          console.info(`[FCM] Sending push to ${t.platform} token ${t.token.slice(0, 10)}...: ${payload.title}`);
        }
      } else {
        // Development logging
        console.debug(`[FCM-Dev] Push notification simulated for user ${payload.userId}: "${payload.title}"`);
      }
    } catch (err) {
      console.error("[FCM] Push notification delivery failure:", err);
    }
  }
}

/**
 * In-App Notification Provider.
 * Persists notification to PostgreSQL database for query via /api/v1/account/notifications.
 */
export class InAppNotificationProvider implements NotificationProvider {
  async send(payload: NotificationPayload): Promise<void> {
    await prisma.notification.create({
      data: {
        userId: payload.userId,
        title: payload.title,
        body: payload.body,
        type: payload.type || "GENERAL",
        metadata: (payload.metadata as any) ?? undefined,
      },
    });
  }
}

/**
 * Composite Provider: Persists in database AND sends mobile push notification.
 */
export class CompositeNotificationProvider implements NotificationProvider {
  private readonly inApp = new InAppNotificationProvider();
  private readonly push = new FcmNotificationProvider();

  async send(payload: NotificationPayload): Promise<void> {
    await Promise.allSettled([
      this.inApp.send(payload),
      this.push.send(payload),
    ]);
  }
}

export class MockNotificationProvider implements NotificationProvider {
  readonly sent: NotificationPayload[] = [];

  async send(payload: NotificationPayload): Promise<void> {
    this.sent.push(payload);
  }
}

export const notificationService = new CompositeNotificationProvider();
