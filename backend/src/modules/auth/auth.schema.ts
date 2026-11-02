import { z } from "zod";
const credentials = z.object({
  name: z.string().min(2).max(80),
  email: z.email(),
  phone: z.string().min(8).max(20),
  password: z.string().min(8).max(72),
});
export const registerSchema = z.object({
  body: credentials,
  query: z.any(),
  params: z.any(),
});
export const loginSchema = z.object({
  body: z.object({ email: z.email(), password: z.string().min(1) }),
  query: z.any(),
  params: z.any(),
});
export const refreshSchema = z.object({
  body: z.object({ refreshToken: z.string().min(20) }),
  query: z.any(),
  params: z.any(),
});
export const otpSchema = z.object({
  body: z.object({
    phone: z.string().min(8),
    otp: z.string().length(6).optional(),
  }),
  query: z.any(),
  params: z.any(),
});
