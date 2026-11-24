"""GET /api/prior-info-rules (F-04 사전 정보 불일치 판정 규칙, R3). 모든 값은 가짜다.

참조 구현(normalize·is_mismatch)은 내려 주는 규칙 데이터만 따라 계산한다.
아래 경우가 통과하면 브라우저도 같은 규칙으로 같은 판정을 낸다.
"""

import re
from datetime import date

import pytest

from app import llm
from app.prior_info_rules import RULES, is_mismatch, normalize

TODAY = date(2026, 11, 24)


def test_prior_info_rules_requires_login(anon_client):
    res = anon_client.get("/api/prior-info-rules")

    assert res.status_code == 401
    assert res.json() == {"detail": {"code": "LOGIN_REQUIRED"}}


def test_prior_info_rules_returns_rules(client):
    res = client.get("/api/prior-info-rules")

    assert res.status_code == 200
    assert res.json() == RULES


def test_rules_cover_every_prior_info_key():
    """L1이 칸에 붙일 수 있는 사전 정보 종류마다 규칙이 하나씩 있다."""
    assert [r["key"] for r in RULES["keys"]] == llm.PRIOR_INFO_KEYS


def test_rule_patterns_use_ascii_digits_only():
    """\\d는 Python·JavaScript에서 다르게 동작하므로 쓰지 않는다."""

    def patterns(obj):
        if isinstance(obj, dict):
            for k, v in obj.items():
                if k in ("pattern", "regex", "remove"):
                    yield v
                else:
                    yield from patterns(v)
        elif isinstance(obj, list):
            for v in obj:
                yield from patterns(v)

    found = list(patterns(RULES))
    assert found
    for p in found:
        re.compile(p)
        assert "\\d" not in p and "\\D" not in p, p


# (종류, 저장된 사전 정보, 지금 쓴 값, 불일치인가)
CASES = [
    # 전화번호: 숫자만 비교, +82 → 0
    ("phone", "010-0000-1234", "01000001234", False),
    ("phone", "010-0000-1234", "010 0000 1234", False),
    ("phone", "010-0000-1234", "+82 10-0000-1234", False),
    ("phone", "010-0000-1234", "010-0000-1235", True),
    # 날짜: 표기 통일
    ("birth_date", "1990.01.01", "1990-1-1", False),
    ("birth_date", "1990.01.01", "19900101", False),
    ("birth_date", "1990.01.01", "900101", False),
    ("birth_date", "1990.01.01", "1990년 1월 1일", False),
    ("birth_date", "1990.01.01", "1990/01/01", False),
    ("birth_date", "1990.01.01", "1990.01.02", True),
    # 날짜를 덜 썼거나 날짜로 읽히지 않으면 형식 오류가 먼저라 비교하지 않는다
    ("birth_date", "1990.01.01", "1990.01", False),
    ("birth_date", "1990.01.01", "1990.13.01", False),
    # 이름: 공백·하이픈·대소문자 무시
    ("name", "NGUYEN VAN A", "nguyen van a", False),
    ("name", "NGUYEN VAN A", "NGUYENVANA", False),
    ("name", "테스트 사용자", "테스트사용자", False),
    ("name", "NGUYEN VAN A", "NGUYEN VAN B", True),
    # 주소: 쉼표·괄호도 무시
    ("address", "서울특별시 가나구 다라로 12", "서울특별시, 가나구 다라로 12", False),
    (
        "address",
        "서울특별시 가나구 다라로 12 (가나동)",
        "서울특별시 가나구 다라로 12 가나동",
        False,
    ),
    ("address", "서울특별시 가나구 다라로 12", "서울특별시 가나구 다라로 13", True),
    # 빈칸은 불일치가 아니다 ('필수 빈칸'으로 따로 센다)
    ("phone", "010-0000-1234", "", False),
    ("phone", "", "010-0000-1234", False),
]


@pytest.mark.parametrize("key, saved, current, expected", CASES)
def test_is_mismatch(key, saved, current, expected):
    assert is_mismatch(key, saved, current, today=TODAY) is expected


def test_two_digit_year_pivot():
    """올해(26) 두 자리보다 크면 1900년대, 아니면 2000년대."""
    assert normalize("birth_date", "900101", today=TODAY) == "19900101"
    assert normalize("birth_date", "250101", today=TODAY) == "20250101"
    assert normalize("birth_date", "260101", today=TODAY) == "20260101"
    assert normalize("birth_date", "270101", today=TODAY) == "19270101"


def test_unreadable_saved_date_falls_back_to_text():
    """저장된 생년월일이 날짜로 읽히지 않으면 일반 글자 규칙으로 비교한다."""
    assert is_mismatch("birth_date", "모름", "1990.01.01", today=TODAY) is True
