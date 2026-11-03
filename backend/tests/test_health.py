from fastapi.testclient import TestClient

from app.main import app

client = TestClient(app)


def test_health():
    # /api/health 요청 결과가 정상인지 확인
    res = client.get("/api/health")

    assert res.status_code == 200
    assert res.json() == {"status": "ok"}
