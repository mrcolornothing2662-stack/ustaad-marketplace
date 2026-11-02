from fastapi import FastAPI
from pydantic import BaseModel, Field
from app.sentiment.analyzer import DeterministicSentimentAnalyzer
from app.trust_score.calculator import calculate
from app.ranking.calculator import rank
app = FastAPI(title="Ustaad Explainable AI Service", version="1.0.0")
analyzer = DeterministicSentimentAnalyzer()
class TextRequest(BaseModel): text: str = Field(min_length=1, max_length=5000)
class ScoreRequest(BaseModel):
    values: dict[str, float]
    penalties: float = 0
@app.get("/health")
def health(): return {"status": "ok"}
@app.post("/sentiment/analyze")
def sentiment(request: TextRequest): return analyzer.analyze(request.text)
@app.post("/trust-score/calculate")
def trust(request: ScoreRequest): return calculate(request.values, request.penalties)
@app.post("/ranking/calculate")
def ranking(request: ScoreRequest): return rank(request.values)
