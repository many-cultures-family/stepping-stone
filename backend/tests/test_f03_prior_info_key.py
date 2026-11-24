"""F-03 사전 정보 자동 채움 정리: 서버는 prior_info_key만 정확히 남긴다.

사전 정보는 브라우저에만 있고(no-server-storage-user-input.md) 브라우저가 prior_info_key로 칸을 채운다.
그래서 서버는 사전 정보 값(prior_info_value)을 내려 주지 않고, 키가 칸 형식과 맞는지만 거른다.
"""

import pytest
from conftest import insert_document, insert_draft

from app import llm

INFER_PATH = "/api/drafts/{}/fields:infer"
BBOX = {"page": 1, "x": 0.1, "y": 0.3, "w": 0.4, "h": 0.04}


def l1_field(format_code, prior_info_key):
    return {
        "label": "항목",
        "format_code": format_code,
        "required": True,
        "prior_info_key": prior_info_key,
        "description": "설명",
        "bbox": BBOX,
    }


def infer_with(client, db, seed_user_id, monkeypatch, fields):
    draft_id = insert_draft(db, seed_user_id, "수정", "field_check")
    insert_document(db, draft_id, masked_text="문서 내용")
    monkeypatch.setattr(llm, "infer_fields", lambda **kwargs: fields)
    res = client.post(INFER_PATH.format(draft_id))
    assert res.status_code == 200
    return res.json()["fields"]


@pytest.mark.parametrize(
    "format_code, key",
    [
        ("name", "name"),
        ("date", "birth_date"),
        ("phone", "phone"),
        ("address", "address"),
    ],
)
def test_matching_key_is_kept(client, db, seed_user_id, monkeypatch, format_code, key):
    fields = infer_with(
        client, db, seed_user_id, monkeypatch, [l1_field(format_code, key)]
    )

    assert fields[0]["prior_info_key"] == key


@pytest.mark.parametrize(
    "format_code, key",
    [
        ("signature", "name"),  # 서명 칸에 이름을 채우면 안 된다 (R10)
        ("choice", "phone"),
        ("long_text", "address"),
        ("short_text", "name"),
        ("phone", "birth_date"),
        ("date", "phone"),
    ],
)
def test_key_on_wrong_format_is_dropped(
    client, db, seed_user_id, monkeypatch, format_code, key
):
    fields = infer_with(
        client, db, seed_user_id, monkeypatch, [l1_field(format_code, key)]
    )

    assert fields[0]["prior_info_key"] is None


def test_unknown_key_is_dropped(client, db, seed_user_id, monkeypatch):
    """L1 스키마 enum 밖의 키(예: 예전 시드에 없던 email)는 브라우저가 채울 수 없다."""
    fields = infer_with(
        client, db, seed_user_id, monkeypatch, [l1_field("email", "email")]
    )

    assert fields[0]["prior_info_key"] is None


def test_fields_response_has_no_prior_info_value(client, db, seed_user_id, monkeypatch):
    """서버는 사전 정보 값을 갖지 않으므로 응답에 prior_info_value가 없다 (원안 PR #26과 다름)."""
    fields = infer_with(
        client, db, seed_user_id, monkeypatch, [l1_field("phone", "phone")]
    )

    assert "prior_info_value" not in fields[0]


def test_prior_info_keys_match_format_table():
    """L1 응답 스키마의 enum과 거르는 표가 같은 출처에서 나온다."""
    assert llm.PRIOR_INFO_KEYS == list(llm.PRIOR_INFO_FORMATS)
    assert set(llm.PRIOR_INFO_FORMATS.values()) <= set(llm.FORMAT_CODES)
