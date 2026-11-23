"""GET /api/input-formats (F-03). input_format 테이블이 R2 허용 목록의 단일 출처다."""

from app.db import SEED_INPUT_FORMATS


def test_input_formats_requires_login(anon_client):
    res = anon_client.get("/api/input-formats")

    assert res.status_code == 401
    assert res.json() == {"detail": {"code": "LOGIN_REQUIRED"}}


def test_input_formats_returns_seed_in_order(client):
    res = client.get("/api/input-formats")

    assert res.status_code == 200
    assert res.json() == {
        "formats": [
            {"code": code, "label": label, "pattern": pattern, "example": example}
            for code, label, pattern, example in SEED_INPUT_FORMATS
        ]
    }


def test_input_formats_reflect_db_rows(client, db):
    """코드 상수가 아니라 DB 행을 읽는다 (허용 목록이 두 군데로 갈라지지 않게)."""
    db.execute(
        "UPDATE input_format SET example = ? WHERE code = ?", ("010-1111-2222", "phone")
    )
    db.commit()

    formats = client.get("/api/input-formats").json()["formats"]

    assert (
        next(f for f in formats if f["code"] == "phone")["example"] == "010-1111-2222"
    )
