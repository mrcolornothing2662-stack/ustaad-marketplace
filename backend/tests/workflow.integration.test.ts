import request from "supertest";
import { prisma as db } from "../src/config/database";
import { createApp } from "../src/app";
const suite = process.env.RUN_DB_TESTS === "1" ? describe : describe.skip;
suite("database-backed customer/provider workflow", () => {
  const app = createApp([]),
    stamp = Date.now();
  let c: any,
    p: any,
    other: any,
    admin: any,
    booking: any,
    serviceId: string,
    providerId: string,
    otp: string;
  const call = (
    method: "get" | "post" | "put",
    path: string,
    token?: string,
    body?: any,
  ) => {
    const q = request(app)[method]("/api/v1" + path);
    if (token) q.set("authorization", "Bearer " + token);
    return body === undefined ? q : q.send(body);
  };
  beforeAll(async () => {
    const login = await call("post", "/auth/login", undefined, {
      email: "admin@ustaad.local",
      password: "UstaadDev123!",
    });
    expect(login.status).toBe(200);
    admin = login.body.tokens;
  }, 30000);
  afterAll(async () => {
    await db.$disconnect();
  });
  test("registers real accounts without exposing password hashes", async () => {
    const register = async (role: string, n: number) => {
      const r = await call("post", "/auth/register/" + role, undefined, {
        name: "Workflow Test " + n,
        email: `workflow-${stamp}-${n}@test.local`,
        phone: `+91${String(stamp).slice(-8)}${n}`,
        password: "WorkflowPass123!",
      });
      expect(r.status).toBe(201);
      expect(r.body.user.passwordHash).toBeUndefined();
      expect(r.body.user.password).toBeUndefined();
      return r.body;
    };
    c = await register("customer", 1);
    p = await register("provider", 2);
    other = await register("customer", 3);
    const login = await call("post", "/auth/login", undefined, {
      email: c.user.email,
      password: "WorkflowPass123!",
    });
    expect(login.body.user.passwordHash).toBeUndefined();
  }, 30000);
  test("phone OTP is challenge-bound and cannot be reused", async () => {
    const sent = await call("post", "/auth/send-phone-otp", undefined, {
      phone: c.user.phone,
    });
    expect(sent.status).toBe(200);
    const code = sent.body.developmentOtp;
    expect(code).toMatch(/^\d{6}$/);
    expect(
      (
        await call("post", "/auth/verify-phone-otp", undefined, {
          phone: c.user.phone,
          otp: code,
        })
      ).status,
    ).toBe(200);
    expect(
      (
        await call("post", "/auth/verify-phone-otp", undefined, {
          phone: c.user.phone,
          otp: code,
        })
      ).status,
    ).toBe(400);
  });
  test("provider completes profile, services, availability and admin verification", async () => {
    const sent = await call("post", "/auth/send-phone-otp", undefined, {
      phone: p.user.phone,
    });
    expect(
      (
        await call("post", "/auth/verify-phone-otp", undefined, {
          phone: p.user.phone,
          otp: sent.body.developmentOtp,
        })
      ).status,
    ).toBe(200);
    const categories = await call("get", "/categories");
    serviceId = categories.body[0].services[0].id;
    expect(
      (
        await call("put", "/providers/me", p.tokens.accessToken, {
          title: "Test Electrician",
          description: "Qualified professional for integration testing",
          experienceYears: 4,
          languages: ["English"],
          city: "Ludhiana",
          latitude: 30.9,
          longitude: 75.85,
          serviceRadiusKm: 15,
        })
      ).status,
    ).toBe(200);
    const me = await call("get", "/providers/me", p.tokens.accessToken);
    providerId = me.body.id;
    expect(
      (
        await call(
          "put",
          "/account/services/" + serviceId,
          p.tokens.accessToken,
          { startingPrice: 499, description: "Repair work", active: true },
        )
      ).status,
    ).toBe(200);
    expect(
      (
        await call(
          "put",
          "/account/availability",
          p.tokens.accessToken,
          Array.from({ length: 7 }, (_, weekday) => ({
            weekday,
            startTime: "09:00",
            endTime: "18:00",
            enabled: true,
          })),
        )
      ).status,
    ).toBe(200);
    const identity = await call(
      "post",
      "/verification/digilocker/start",
      p.tokens.accessToken,
      { documentType: "AADHAAR", consent: true },
    );
    expect(identity.status).toBe(201);
    expect(
      (
        await call(
          "post",
          "/verification/digilocker/callback",
          p.tokens.accessToken,
          {
            requestId: identity.body.requestId,
            state: identity.body.state,
            code: "development-consent",
          },
        )
      ).status,
    ).toBe(200);
    const skill = await call(
      "post",
      "/verification/skill",
      p.tokens.accessToken,
      {
        documentType: "OTHER",
        mimeType: "application/pdf",
        contentBase64: Buffer.from("%PDF-1.4\nTest evidence").toString(
          "base64",
        ),
      },
    );
    expect(skill.status).toBe(201);
    for (const id of [identity.body.requestId, skill.body.id])
      expect(
        (
          await call(
            "post",
            `/admin/verifications/${id}/decision`,
            admin.accessToken,
            { status: "APPROVED" },
          )
        ).status,
      ).toBe(200);
  }, 30000);
  test("search hides private coordinates; booking rejects unavailable and invalid choices", async () => {
    const found = await call(
      "get",
      `/search/providers?latitude=30.9&longitude=75.85&serviceId=${serviceId}`,
    );
    expect(found.status).toBe(200);
    const match = found.body.find((x: any) => x.id === providerId);
    expect(match).toBeDefined();
    expect(match.latitude).toBeUndefined();
    expect(match.longitude).toBeUndefined();
    const time = new Date(Date.now() + 2 * 86400000);
    time.setUTCHours(5, 0, 0, 0);
    const input = {
      providerId,
      serviceId,
      problemDescription: "Repair the electrical switch",
      addressText: "123 Integration Street",
      latitude: 30.9,
      longitude: 75.85,
      preferredAt: time.toISOString(),
    };
    expect(
      (
        await call("post", "/bookings", c.tokens.accessToken, {
          ...input,
          latitude: 1,
        })
      ).status,
    ).toBe(409);
    expect(
      (
        await call("post", "/bookings", c.tokens.accessToken, {
          ...input,
          preferredAt: new Date(0).toISOString(),
        })
      ).status,
    ).toBe(409);
    const created = await call(
      "post",
      "/bookings",
      c.tokens.accessToken,
      input,
    );
    expect(created.status).toBe(201);
    booking = created.body;
    const photo=await call('post',`/bookings/${booking.id}/photos`,c.tokens.accessToken,{mimeType:'image/png',contentBase64:'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+j2ioAAAAASUVORK5CYII='});expect(photo.status).toBe(201);
    expect((await call('get',`/bookings/${booking.id}/photos`,other.tokens.accessToken)).status).toBe(404);
    expect((await call('get',`/bookings/${booking.id}/photos`,p.tokens.accessToken)).body.length).toBe(1);

    expect(
      (await call("post", "/bookings", c.tokens.accessToken, input)).status,
    ).toBe(409);
    expect(
      (await call("get", "/bookings/" + booking.id, other.tokens.accessToken))
        .status,
    ).toBe(404);
    expect(
      (await call("get", "/bookings", p.tokens.accessToken)).body.some(
        (x: any) => x.id === booking.id,
      ),
    ).toBe(true);
  }, 30000);
  test("enforces booking ownership, role transitions, chat rules and OTP expiry", async () => {
    const change = (token: string, status: string, extra: any = {}) =>
      call("post", `/bookings/${booking.id}/transition`, token, {
        status,
        ...extra,
      });
    expect((await change(c.tokens.accessToken, "ACCEPTED")).status).toBe(409);
    expect((await change(p.tokens.accessToken, "NOT_A_STATUS")).status).toBe(
      400,
    );
    expect(
      (
        await call(
          "post",
          `/chat/${booking.id}/messages`,
          c.tokens.accessToken,
          { body: "Early message" },
        )
      ).status,
    ).toBe(403);
    expect((await change(p.tokens.accessToken, "ACCEPTED")).status).toBe(200);
    expect((await change(c.tokens.accessToken, "CONFIRMED")).status).toBe(200);
    expect(
      (
        await call(
          "post",
          `/chat/${booking.id}/messages`,
          c.tokens.accessToken,
          { body: "Please ring the bell" },
        )
      ).status,
    ).toBe(201);
    expect(
      (
        await call(
          "get",
          `/chat/${booking.id}/messages`,
          other.tokens.accessToken,
        )
      ).status,
    ).toBe(403);
    expect(
      (await change(p.tokens.accessToken, "PROVIDER_ON_THE_WAY")).status,
    ).toBe(200);
    expect((await change(p.tokens.accessToken, "IN_PROGRESS")).status).toBe(
      400,
    );
    let code = await call(
      "post",
      `/bookings/${booking.id}/start-otp`,
      c.tokens.accessToken,
      {},
    );
    expect(code.status).toBe(200);
    await db.jobStartOtp.update({
      where: { bookingId: booking.id },
      data: { expiresAt: new Date(0) },
    });
    expect(
      (
        await change(p.tokens.accessToken, "IN_PROGRESS", {
          otp: code.body.otp,
        })
      ).status,
    ).toBe(400);
    code = await call(
      "post",
      `/bookings/${booking.id}/start-otp`,
      c.tokens.accessToken,
      {},
    );
    otp = code.body.otp;
    expect(
      (await change(p.tokens.accessToken, "IN_PROGRESS", { otp })).status,
    ).toBe(200);
    expect(
      (
        await db.jobStartOtp.findUniqueOrThrow({
          where: { bookingId: booking.id },
        })
      ).usedAt,
    ).not.toBeNull();
    expect(
      (
        await change(p.tokens.accessToken, "AWAITING_CUSTOMER_CONFIRMATION", {
          finalAmount: -1,
        })
      ).status,
    ).toBe(400);
    expect(
      (
        await change(p.tokens.accessToken, "AWAITING_CUSTOMER_CONFIRMATION", {
          finalAmount: 650,
        })
      ).status,
    ).toBe(200);
    expect((await change(p.tokens.accessToken, "COMPLETED")).status).toBe(409);
    expect((await change(c.tokens.accessToken, "COMPLETED")).status).toBe(200);
  }, 30000);
  test("review is validated, atomic, unique and updates actual trust inputs", async () => {
    expect(
      (
        await call("post", "/reviews", c.tokens.accessToken, {
          bookingId: booking.id,
          rating: 8,
          text: "Very good service",
        })
      ).status,
    ).toBe(400);
    const r = await call("post", "/reviews", c.tokens.accessToken, {
      bookingId: booking.id,
      rating: 5,
      text: "Excellent and professional service",
    });
    expect(r.status).toBe(201);
    expect(
      (
        await call("post", "/reviews", c.tokens.accessToken, {
          bookingId: booking.id,
          rating: 5,
          text: "Excellent and professional service",
        })
      ).status,
    ).toBe(409);
    expect(
      (await db.booking.findUniqueOrThrow({ where: { id: booking.id } }))
        .status,
    ).toBe("REVIEWED");
    const score = await db.trustScore.findUniqueOrThrow({
      where: { providerId },
    });
    expect((score.components as any).completionRate).toBe(100);
  }, 30000);
  test("password recovery is one-use and rejects the previous password", async () => {
    const sent = await call("post", "/auth/forgot-password", undefined, {
      email: other.user.email,
    });
    expect(sent.status).toBe(200);
    const data = {
      token: sent.body.developmentToken,
      password: "ChangedPassword123!",
    };
    expect(
      (await call("post", "/auth/reset-password", undefined, data)).status,
    ).toBe(200);
    expect(
      (await call("post", "/auth/reset-password", undefined, data)).status,
    ).toBe(400);
    expect(
      (
        await call("post", "/auth/login", undefined, {
          email: other.user.email,
          password: "WorkflowPass123!",
        })
      ).status,
    ).toBe(401);
    expect(
      (
        await call("post", "/auth/login", undefined, {
          email: other.user.email,
          password: data.password,
        })
      ).status,
    ).toBe(200);
  });
  test("complaint and notification records remain scoped to the current user", async () => {
    const complaint = await call(
      "post",
      "/account/complaints",
      c.tokens.accessToken,
      {
        bookingId: booking.id,
        reason: "Please investigate this service issue",
      },
    );
    expect(complaint.status).toBe(201);
    expect(
      (
        await call("post", "/account/complaints", other.tokens.accessToken, {
          bookingId: booking.id,
          reason: "Unrelated account complaint",
        })
      ).status,
    ).toBe(403);
    expect(
      (
        await call(
          "post",
          `/admin/complaints/${complaint.body.id}/resolve`,
          admin.accessToken,
          { status: "RESOLVED", resolution: "Customer and provider contacted" },
        )
      ).status,
    ).toBe(200);
    const notices = await call(
      "get",
      "/account/notifications",
      c.tokens.accessToken,
    );
    expect(notices.status).toBe(200);
    expect(notices.body.length).toBeGreaterThan(0);
    expect(notices.body.every((n: any) => n.userId === c.user.id)).toBe(true);
    expect(
      (
        await call("post", "/auth/refresh", undefined, {
          refreshToken: "invalid-but-long-enough-token",
        })
      ).status,
    ).toBe(401);
  });
  test("refresh rotates once and suspension blocks existing tokens", async () => {
    const first = await call("post", "/auth/refresh", undefined, {
      refreshToken: c.tokens.refreshToken,
    });
    expect(first.status).toBe(200);
    expect(
      (
        await call("post", "/auth/refresh", undefined, {
          refreshToken: c.tokens.refreshToken,
        })
      ).status,
    ).toBe(401);
    expect(
      (
        await call(
          "post",
          `/admin/providers/${providerId}/suspend`,
          admin.accessToken,
          {},
        )
      ).status,
    ).toBe(200);
    expect(
      (await call("get", "/providers/me", p.tokens.accessToken)).status,
    ).toBe(403);
    expect(
      (
        await call("post", "/auth/refresh", undefined, {
          refreshToken: p.tokens.refreshToken,
        })
      ).status,
    ).toBe(401);
  });
});
