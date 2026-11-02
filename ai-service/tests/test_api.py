from fastapi.testclient import TestClient
from app.main import app
client = TestClient(app)
def test_health(): assert client.get("/health").json() == {"status": "ok"}
def test_positive_sentiment():
    result = client.post("/sentiment/analyze", json={"text": "great professional service"}).json()
    assert result["label"] == "POSITIVE" and result["score"] > .5
def test_neutral_defaults_make_new_provider_fair():
    assert client.post("/trust-score/calculate", json={"values": {}}).json()["score"] == 50
