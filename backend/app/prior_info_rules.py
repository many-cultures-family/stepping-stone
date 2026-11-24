"""사전 정보 불일치 판정 규칙 (F-04, R3). 규칙만 내려 주고 서버는 판정하지 않는다.

사전 정보와 입력값은 브라우저에만 있으므로(no-server-storage-user-input.md) 불일치 계산은
브라우저 규칙 엔진이 한다(VIRTUAL-FORM-API.md 공통 규칙). 같은 값을 다르게 적은 것
(010-0000-1234 / 01000001234, 1990.01.01 / 19900101)까지 '다르다'고 하지 않도록 비교 전에
표기를 맞추는데, 그 규칙을 화면 코드에 따로 적지 않고 여기 한 곳에 둔다
(input_format·privacy-rules와 같은 '규칙 한 벌' 원칙).

기준: l3-masking.md "사전 정보 값 대조 방법" [제안], PR #43 `utils/priorMismatch.js`.
경로·응답 모양은 [제안].

`normalize`·`is_mismatch`는 규칙 데이터를 그대로 따라 계산하는 참조 구현이다.
API에서는 쓰지 않고, 내려 주는 규칙이 의도대로 동작하는지 테스트로 고정하는 데 쓴다.
"""

import re
import unicodedata
from datetime import date
from typing import Annotated

from fastapi import APIRouter, Depends

from app import auth

router = APIRouter(prefix="/api")

# 공백·하이픈(유니코드 대시 U+2010~U+2015 포함). 숫자는 \d 대신 [0-9]로 쓴다:
# Python \d는 유니코드 숫자 전체, JavaScript \d는 0~9만 잡아 두 언어에서 결과가 달라진다
_SPACE_DASH = r"[\s\-‐-―]"

_TEXT_STEPS = [
    {"op": "nfc"},
    {"op": "remove", "pattern": _SPACE_DASH},
    {"op": "lowercase"},
]

# 날짜 표기 (1990.01.01 · 1990-1-1 · 1990/1/1 · 1990년 1월 1일 · 19900101 · 900101)를 YYYYMMDD로.
# remove가 있는 패턴은 그 글자를 지운 뒤 맞춰 본다. 월 1~12, 일 1~31만 날짜로 본다
_DATE_STEP = {
    "op": "date",
    "patterns": [
        {
            "regex": r"^([0-9]{4})\s*[.\-/년]\s*([0-9]{1,2})\s*[.\-/월]\s*([0-9]{1,2})\s*[.일]?$",
            "groups": ["year", "month", "day"],
        },
        {
            "remove": r"[\s.\-/]",
            "regex": r"^([0-9]{4})([0-9]{2})([0-9]{2})$",
            "groups": ["year", "month", "day"],
        },
        {
            "remove": r"[\s.\-/]",
            "regex": r"^([0-9]{2})([0-9]{2})([0-9]{2})$",
            "groups": ["yy", "month", "day"],
        },
    ],
    # 두 자리 연도: 올해 두 자리보다 크면 1900년대, 아니면 2000년대 (900101 → 1990, 250101 → 2025)
    "two_digit_year": "1900s_if_greater_than_this_year",
}

RULES = {
    # 둘 중 하나라도 비어 있으면 불일치로 보지 않는다 (빈칸은 '필수 빈칸'으로 따로 센다)
    "empty": "not_mismatch",
    "keys": [
        {"key": "name", "format_code": "name", "steps": _TEXT_STEPS},
        {
            "key": "birth_date",
            "format_code": "date",
            "steps": [_DATE_STEP],
            # 지금 쓴 값이 날짜로 읽히지 않으면 형식 오류가 먼저라 비교하지 않는다.
            # 저장된 값이 날짜로 읽히지 않으면 일반 글자 규칙으로 비교한다
            "unreadable_input": "not_mismatch",
            "unreadable_saved_steps": _TEXT_STEPS,
        },
        {
            "key": "phone",
            "format_code": "phone",
            "steps": [
                {"op": "remove", "pattern": r"[^0-9]"},
                # +82 10… → 010… (숫자만 남긴 뒤 82로 시작하고 11자리 이상일 때)
                {"op": "replace_prefix", "from": "82", "to": "0", "min_length": 11},
            ],
        },
        {
            "key": "address",
            "format_code": "address",
            "steps": [
                *_TEXT_STEPS,
                {"op": "remove", "pattern": r"[,()（）\[\]]"},
            ],
        },
    ],
}

_KEYS = {rule["key"]: rule for rule in RULES["keys"]}


@router.get("/prior-info-rules")
def get_prior_info_rules(user: Annotated[dict, Depends(auth.current_user)]):
    return RULES


# --- 참조 구현 (테스트용) ---


def _parse_date(step, value, today):
    for p in step["patterns"]:
        text = re.sub(p["remove"], "", value) if "remove" in p else value
        m = re.match(p["regex"], text)
        if not m:
            continue
        parts = dict(zip(p["groups"], m.groups()))
        month, day = int(parts["month"]), int(parts["day"])
        if not (1 <= month <= 12 and 1 <= day <= 31):
            continue
        if "yy" in parts:
            yy = int(parts["yy"])
            century = "19" if yy > today.year % 100 else "20"
            year = f"{century}{parts['yy']}"
        else:
            year = parts["year"]
        return f"{year}{month:02d}{day:02d}"
    return None


def _apply(steps, value, today):
    text = value
    for step in steps:
        op = step["op"]
        if op == "nfc":
            text = unicodedata.normalize("NFC", text)
        elif op == "remove":
            text = re.sub(step["pattern"], "", text)
        elif op == "lowercase":
            text = text.lower()
        elif op == "replace_prefix":
            if text.startswith(step["from"]) and len(text) >= step["min_length"]:
                text = step["to"] + text[len(step["from"]) :]
        elif op == "date":
            text = _parse_date(step, text.strip(), today)
            if text is None:
                return None
        else:
            raise ValueError(f"모르는 규칙: {op}")
    return text


def normalize(key, value, today=None):
    """비교용으로 표기를 맞춘 값. 날짜로 읽히지 않으면 None."""
    return _apply(_KEYS[key]["steps"], str(value), today or date.today())


def is_mismatch(key, saved, current, today=None):
    """사전 정보(saved)와 지금 쓴 값(current)이 표기를 맞춰도 다를 때만 True."""
    rule = _KEYS[key]
    today = today or date.today()
    saved, current = str(saved or "").strip(), str(current or "").strip()
    if not saved or not current:
        return False
    current_norm = _apply(rule["steps"], current, today)
    if current_norm is None:
        return False  # unreadable_input: not_mismatch
    saved_norm = _apply(rule["steps"], saved, today)
    if saved_norm is None:
        saved_norm = _apply(rule["unreadable_saved_steps"], saved, today)
    return saved_norm != current_norm
