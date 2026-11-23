"""GET /api/privacy-rules (REVIEW-PRIVACY-API.md 항목 4, F-07 / US-05)."""

import re

from app import privacy


def test_privacy_rules_requires_login(anon_client):
    res = anon_client.get("/api/privacy-rules")

    assert res.status_code == 401
    assert res.json() == {"detail": {"code": "LOGIN_REQUIRED"}}


def test_privacy_rules_returns_server_value_patterns(client):
    """브라우저 감지와 서버 재검사가 같은 규칙을 쓰도록 _PATTERNS를 그대로 내려 준다."""
    res = client.get("/api/privacy-rules")

    assert res.status_code == 200
    assert res.json() == {
        "rules": [{"kind": kind, "pattern": p.pattern} for kind, p in privacy._PATTERNS]
    }


def test_privacy_rules_exclude_label_rules(client):
    """라벨 규칙은 OCR 문서용이라 넣지 않는다."""
    patterns = {r["pattern"] for r in client.get("/api/privacy-rules").json()["rules"]}

    for _, label in privacy._LABELS:
        assert label.pattern not in patterns


def test_privacy_rules_detect_fake_values(client):
    """내려 준 규칙만으로 가짜 개인정보 값을 찾을 수 있다 (모든 값은 가짜)."""
    rules = client.get("/api/privacy-rules").json()["rules"]
    samples = {
        "resident_no": "900101-1234567",
        "alien_no": "900101-5234567",
        "phone": "010-0000-1234",
        "email": "test.user@example.com",
        "address": "서울특별시 가나구 다라로 12",
    }

    for kind, value in samples.items():
        assert any(
            r["kind"] == kind and re.search(r["pattern"], value) for r in rules
        ), kind
