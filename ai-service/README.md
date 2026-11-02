# AI service

This FastAPI application provides deterministic, explainable sentiment, trust-score, and provider-ranking endpoints. It performs no image diagnosis.

```bash
pip install -r requirements.txt
uvicorn app.main:app --reload --port 8000
pytest
```
