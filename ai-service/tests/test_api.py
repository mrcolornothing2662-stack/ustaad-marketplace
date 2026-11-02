from fastapi.testclient import TestClient
from app.main import app

client = TestClient(app)

def test_health():
    assert client.get("/health").json() == {"status": "ok"}

def test_positive_sentiment_english():
    result = client.post("/sentiment/analyze", json={"text": "great professional service", "language": "en"}).json()
    assert result["label"] == "POSITIVE" and result["score"] > 0.5

def test_positive_sentiment_hindi():
    result = client.post("/sentiment/analyze", json={"text": "बहुत बढ़िया और कुशल काम किया", "language": "hi"}).json()
    assert result["label"] == "POSITIVE" and result["score"] > 0.5

def test_positive_sentiment_hinglish():
    result = client.post("/sentiment/analyze", json={"text": "ekdum mast aur badhiya kaam", "language": "hi"}).json()
    assert result["label"] == "POSITIVE" and result["score"] > 0.5

def test_negative_sentiment_hindi():
    result = client.post("/sentiment/analyze", json={"text": "bahut kharab aur bekar service, late aaya", "language": "hi"}).json()
    assert result["label"] == "NEGATIVE" and result["score"] < 0.5

def test_neutral_defaults_make_new_provider_fair():
    assert client.post("/trust-score/calculate", json={"values": {}}).json()["score"] == 50
