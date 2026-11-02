import { env } from "../../config/env";

export interface SmsProvider {
  sendOtp(phone: string, otp: string): Promise<boolean>;
}

export class Fast2SmsProvider implements SmsProvider {
  private readonly apiKey: string;

  constructor(apiKey?: string) {
    this.apiKey = apiKey || env.SMS_API_KEY;
  }

  async sendOtp(phone: string, otp: string): Promise<boolean> {
    const rawNumber = phone.replace(/^\+91/, "").replace(/\D/g, "");
    if (!this.apiKey) {
      console.warn(`[Fast2SMS] Missing API Key. OTP for ${phone}: ${otp}`);
      return true;
    }

    try {
      const response = await fetch("https://www.fast2sms.com/dev/bulkV2", {
        method: "POST",
        headers: {
          authorization: this.apiKey,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          variables_values: otp,
          route: "otp",
          numbers: rawNumber,
        }),
      });

      const data = await response.json();
      return (data as any)?.return === true;
    } catch (err) {
      console.error("[Fast2SMS] Error sending OTP:", err);
      return false;
    }
  }
}

export class Msg91Provider implements SmsProvider {
  private readonly authKey: string;
  private readonly templateId: string;

  constructor(authKey?: string, templateId?: string) {
    this.authKey = authKey || env.SMS_API_KEY;
    this.templateId = templateId || "default_otp";
  }

  async sendOtp(phone: string, otp: string): Promise<boolean> {
    const rawNumber = phone.replace(/^\+/, "").replace(/\D/g, "");
    if (!this.authKey) {
      console.warn(`[MSG91] Missing Auth Key. OTP for ${phone}: ${otp}`);
      return true;
    }

    try {
      const response = await fetch("https://api.msg91.com/api/v5/otp", {
        method: "POST",
        headers: {
          authkey: this.authKey,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          template_id: this.templateId,
          mobile: rawNumber,
          otp,
        }),
      });

      const data = await response.json();
      return (data as any)?.type === "success";
    } catch (err) {
      console.error("[MSG91] Error sending OTP:", err);
      return false;
    }
  }
}

export class MockSmsProvider implements SmsProvider {
  readonly sentMessages: Array<{ phone: string; otp: string; sentAt: Date }> = [];

  async sendOtp(phone: string, otp: string): Promise<boolean> {
    this.sentMessages.push({ phone, otp, sentAt: new Date() });
    return true;
  }
}

export function getSmsProvider(): SmsProvider {
  if (env.SMS_PROVIDER === "fast2sms") {
    return new Fast2SmsProvider();
  }
  if (env.SMS_PROVIDER === "msg91") {
    return new Msg91Provider();
  }
  return new MockSmsProvider();
}
