import { env } from "../../config/env";
import { prisma } from "../../config/database";

export interface SentimentResult {
  label: string;
  score: number;
  modelVersion: string;
}

export class AiServiceClient {
  private readonly baseUrl: string;

  constructor(baseUrl?: string) {
    this.baseUrl = baseUrl || env.AI_SERVICE_URL;
  }

  /**
   * Deterministic local fallback in case the external AI microservice is temporarily unreachable.
   * Matches both English and Hindi/Hinglish keywords.
   */
  private localFallbackSentiment(text: string): SentimentResult {
    const positiveWords = new Set([
      "great", "excellent", "good", "professional", "helpful", "fast", "recommend",
      "accha", "achha", "badhiya", "badiya", "shandar", "mast", "sahi", "behtar",
      "अच्छा", "उत्कृष्ट", "बढ़िया", "शानदार", "कुशल", "संतुष्ट", "धन्यवाद"
    ]);
    const negativeWords = new Set([
      "bad", "late", "poor", "rude", "broken", "awful", "avoid",
      "kharab", "bekar", "bakwas", "deri", "chor", "dhokha", "ghatiya",
      "खराब", "देर", "घटिया", "बकवास", "बेकार", "गलत", "धोखा"
    ]);

    const words = new Set(text.toLowerCase().replace(/[^a-zA-Z0-9\u0900-\u097F\s]/g, " ").split(/\s+/));
    let posCount = 0;
    let negCount = 0;

    for (const w of words) {
      if (positiveWords.has(w)) posCount++;
      if (negativeWords.has(w)) negCount++;
    }

    const delta = posCount - negCount;
    const score = Math.max(0.05, Math.min(0.95, 0.5 + delta * 0.15));
    const label = score > 0.55 ? "POSITIVE" : score < 0.45 ? "NEGATIVE" : "NEUTRAL";

    return {
      label,
      score: Math.round(score * 100) / 100,
      modelVersion: "local-fallback-v1",
    };
  }

  async analyzeSentiment(
    text: string,
    language: "en" | "hi" = "en",
  ): Promise<SentimentResult> {
    for (let attempt = 1; attempt <= 2; attempt++) {
      try {
        const response = await fetch(`${this.baseUrl}/sentiment/analyze`, {
          signal: AbortSignal.timeout(3000),
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ text, language }),
        });

        if (response.ok) {
          return (await response.json()) as SentimentResult;
        }
      } catch {
        // Attempt failed, will retry or fallback
      }
    }

    // Return resilient local fallback
    return this.localFallbackSentiment(text);
  }

  /**
   * Background processor to re-analyze pending sentiments.
   */
  async retryPendingSentiments(): Promise<number> {
    const pending = await prisma.reviewSentiment.findMany({
      where: { pending: true },
      include: { review: true },
      take: 20,
    });

    let processed = 0;
    for (const item of pending) {
      try {
        const lang = item.review.language === "HI" ? "hi" : "en";
        const result = await this.analyzeSentiment(item.review.text, lang);
        await prisma.reviewSentiment.update({
          where: { id: item.id },
          data: {
            label: result.label,
            score: result.score,
            modelVersion: result.modelVersion,
            pending: false,
            processedAt: new Date(),
          },
        });
        processed++;
      } catch {
        // Will retry in next run
      }
    }
    return processed;
  }
}
