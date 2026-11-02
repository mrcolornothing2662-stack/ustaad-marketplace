class DeterministicSentimentAnalyzer:
    positive = {"great", "excellent", "good", "professional", "helpful", "fast", "recommend"}
    negative = {"bad", "late", "poor", "rude", "broken", "awful", "avoid"}
    def analyze(self, text: str) -> dict[str, str | float]:
        words = set(text.lower().replace(".", "").split())
        score = max(0.05, min(0.95, 0.5 + (len(words & self.positive) - len(words & self.negative)) * 0.15))
        label = "POSITIVE" if score > 0.55 else "NEGATIVE" if score < 0.45 else "NEUTRAL"
        return {"label": label, "score": round(score, 2), "modelVersion": "deterministic-v1"}
