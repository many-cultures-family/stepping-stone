from fastapi.testclient import TestClient
from main import app

client = TestClient(app)


def test_health():
    # /health 요청 결과가 정상인지 확인
    res = client.get("/health")

    assert res.status_code == 200
    assert res.json() == {"status": "ok"}
