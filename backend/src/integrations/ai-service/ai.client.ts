import { env } from "../../config/env";
export class AiServiceClient {
  async analyzeSentiment(
    text: string,
  ): Promise<{ label: string; score: number; modelVersion: string }> {
    const response = await fetch(`${env.AI_SERVICE_URL}/sentiment/analyze`, {
      signal: AbortSignal.timeout(5000),
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ text }),
    });
    if (!response.ok) throw new Error("AI service unavailable");
    return response.json() as Promise<{
      label: string;
      score: number;
      modelVersion: string;
    }>;
  }
}
