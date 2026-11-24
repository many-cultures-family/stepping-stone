# F-05 쉬운 풀이 요청 (WORD-EXPLAIN-API.md 항목 2). L2는 가짜로 바꾼다. 가짜 데이터만 쓴다.
import json

import pytest

from tests.conftest import insert_document, insert_draft, insert_form_field

MASKED = (
    "@p1 0.12,0.34,0.30,0.04 | 성명: [이름]\n"
    "@p1 0.12,0.40,0.50,0.04 | 보호자 동의 후\n"
    "@p1 0.12,0.46,0.50,0.04 | 제출합니다"
)


@pytest.fixture
def fake_l2(monkeypatch):
    """llm.explain_text를 가짜로 바꾸고 호출 기록을 돌려준다"""
    from app import llm

    calls = []

    def fake(selected_text, language, glossary_explanation=None):
        calls.append((selected_text, language, glossary_explanation))
        return f"풀이:{selected_text}"

    monkeypatch.setattr(llm, "explain_text", fake)
    return calls


@pytest.fixture
def draft_id(db, seed_user_id):
    d = insert_draft(db, seed_user_id, "수정", "writing")
    insert_document(db, d, masked_text=MASKED)
    insert_form_field(
        db,
        d,
        label="개인정보 수집·이용 동의",
        description="동의 여부를 고릅니다",
        format_code="choice",
        options=["동의합니다", "동의하지 않습니다"],
        guide_text=None,
    )
    insert_form_field(
        db,
        d,
        label="신청 사유",
        format_code="long_text",
        guide_text="지원이 필요한 이유를 씁니다",
    )
    return d


def _post(client, draft_id, text):
    return client.post(
        f"/api/drafts/{draft_id}/explanations", json={"selected_text": text}
    )


def test_explanation_calls_l2_and_saves(client, db, draft_id, fake_l2):
    res = _post(client, draft_id, "보호자 동의")
    assert res.status_code == 200
    assert res.json() == {
        "selected_text": "보호자 동의",
        "explanation": "풀이:보호자 동의",
        "source": "ai",
    }
    assert fake_l2 == [("보호자 동의", "vi", None)]
    row = db.execute("SELECT * FROM easy_explanation").fetchone()
    assert (row["selected_text"], row["language"], row["request_count"]) == (
        "보호자 동의",
        "vi",
        1,
    )
    assert row["glossary_term_id"] is None
    assert (
        db.execute(
            "SELECT explanation_count FROM draft WHERE id = ?", (draft_id,)
        ).fetchone()[0]
        == 1
    )


def test_explanation_reuses_saved_without_counting(client, db, draft_id, fake_l2):
    _post(client, draft_id, "보호자 동의")
    res = _post(
        client, draft_id, "  보호자   동의 "
    )  # 공백은 하나로 줄여 같은 말로 본다
    assert res.status_code == 200
    assert res.json()["explanation"] == "풀이:보호자 동의"
    assert len(fake_l2) == 1
    assert db.execute("SELECT request_count FROM easy_explanation").fetchone()[0] == 2
    assert (
        db.execute(
            "SELECT explanation_count FROM draft WHERE id = ?", (draft_id,)
        ).fetchone()[0]
        == 1
    )


def test_explanation_shared_between_users(client, db, draft_id, fake_l2, seed_user_id):
    # 같은 (글자, 언어) 풀이는 다른 작성 건에서도 그대로 쓴다 (사용자 사이에 같이 씀)
    db.execute(
        "INSERT INTO easy_explanation (selected_text, language, explanation) VALUES ('제출합니다', 'vi', '저장된 풀이')"
    )
    db.commit()
    res = _post(client, draft_id, "제출합니다")
    assert res.json()["explanation"] == "저장된 풀이"
    assert fake_l2 == []


def test_explanation_links_glossary_and_sends_its_explanation(
    client, db, draft_id, fake_l2
):
    res = _post(client, draft_id, "보호자")
    assert res.status_code == 200
    term = db.execute(
        "SELECT id, explanation FROM glossary_term WHERE term = '보호자'"
    ).fetchone()
    assert fake_l2 == [("보호자", "vi", term["explanation"])]
    assert (
        db.execute("SELECT glossary_term_id FROM easy_explanation").fetchone()[0]
        == term["id"]
    )


@pytest.mark.parametrize(
    "text",
    [
        "동의하지 않습니다",
        "개인정보 수집·이용 동의",
        "동의 여부를 고릅니다",
        "지원이 필요한 이유를",
        "동의 후 제출합니다",
    ],
)
def test_explanation_accepts_field_texts_and_across_lines(
    client, draft_id, fake_l2, text
):
    # 칸 이름·설명·선택지·안내 문구, 그리고 문서 본문 줄을 이어서 고른 글자도 받는다
    assert _post(client, draft_id, text).status_code == 200


@pytest.mark.parametrize("text", ["홍길동", "010-1234-5678", "보호자동의"])
def test_explanation_rejects_text_not_in_document(client, db, draft_id, fake_l2, text):
    res = _post(client, draft_id, text)
    assert res.status_code == 400
    assert res.json() == {"detail": {"code": "TEXT_NOT_IN_DOCUMENT"}}
    assert fake_l2 == []
    assert db.execute("SELECT COUNT(*) FROM easy_explanation").fetchone()[0] == 0


def test_explanation_rejects_pii_even_if_in_document(client, db, seed_user_id, fake_l2):
    # 가리기에서 빠진 개인정보가 문서 글자에 남아 있어도 L2에 보내지 않는다
    d = insert_draft(db, seed_user_id, "수정", "writing")
    insert_document(
        db, d, masked_text="@p1 0.1,0.1,0.5,0.04 | 문의 010-1234-5678 로 연락"
    )
    res = _post(client, d, "010-1234-5678")
    assert res.status_code == 422
    assert res.json() == {"detail": {"code": "PII_REMAINING"}}
    assert fake_l2 == []


@pytest.mark.parametrize(
    "body",
    [{}, {"selected_text": ""}, {"selected_text": "   "}, {"selected_text": 3}, None],
)
def test_explanation_text_required(client, draft_id, fake_l2, body):
    if body is None:
        res = client.post(f"/api/drafts/{draft_id}/explanations", content=b"not json")
    else:
        res = client.post(f"/api/drafts/{draft_id}/explanations", json=body)
    assert res.status_code == 400
    assert res.json() == {"detail": {"code": "TEXT_REQUIRED"}}


def test_explanation_text_too_long(client, draft_id, fake_l2):
    res = _post(client, draft_id, "가" * 101)
    assert res.status_code == 400
    assert res.json() == {"detail": {"code": "TEXT_TOO_LONG"}}


def test_explanation_limit(client, db, draft_id, fake_l2):
    db.execute("UPDATE draft SET explanation_count = 20 WHERE id = ?", (draft_id,))
    db.commit()
    res = _post(client, draft_id, "보호자 동의")
    assert res.status_code == 409
    assert res.json() == {"detail": {"code": "EXPLANATION_LIMIT_EXCEEDED"}}
    assert fake_l2 == []
    # 저장된 풀이는 한도와 상관없이 준다
    db.execute(
        "INSERT INTO easy_explanation (selected_text, language, explanation) VALUES ('제출합니다', 'vi', '저장된 풀이')"
    )
    db.commit()
    assert _post(client, draft_id, "제출합니다").status_code == 200


def test_explanation_llm_failure(client, db, draft_id, monkeypatch):
    from app import llm

    def boom(*args, **kwargs):
        raise llm.LLMCallError("fake")

    monkeypatch.setattr(llm, "explain_text", boom)
    res = _post(client, draft_id, "보호자 동의")
    assert res.status_code == 502
    assert res.json() == {"detail": {"code": "LLM_CALL_FAILED"}}
    assert db.execute("SELECT COUNT(*) FROM easy_explanation").fetchone()[0] == 0
    assert (
        db.execute(
            "SELECT explanation_count FROM draft WHERE id = ?", (draft_id,)
        ).fetchone()[0]
        == 0
    )


@pytest.mark.parametrize("step", ["upload", "field_check", "prior_info"])
def test_explanation_step_invalid(client, db, seed_user_id, fake_l2, step):
    d = insert_draft(db, seed_user_id, "수정", step)
    insert_document(db, d, masked_text=MASKED)
    res = _post(client, d, "보호자 동의")
    assert res.status_code == 409
    assert res.json() == {"detail": {"code": "DRAFT_STEP_INVALID"}}


@pytest.mark.parametrize("status", ["반려", "성공", "취소"])
def test_explanation_not_editable(client, db, seed_user_id, fake_l2, status):
    d = insert_draft(db, seed_user_id, status, "writing")
    insert_document(db, d, masked_text=MASKED)
    res = _post(client, d, "보호자 동의")
    assert res.status_code == 409
    assert res.json() == {"detail": {"code": "DRAFT_NOT_EDITABLE"}}


def test_explanation_other_user(client, db, fake_l2):
    cur = db.execute(
        "INSERT INTO user (google_sub, email, language) VALUES ('other', 'o@example.com', 'vi')"
    )
    d = insert_draft(db, cur.lastrowid, "수정", "writing")
    insert_document(db, d, masked_text=MASKED)
    res = _post(client, d, "보호자 동의")
    assert res.status_code == 403
    assert res.json() == {"detail": {"code": "FORBIDDEN_DRAFT"}}


def test_explanation_not_found(client, fake_l2):
    res = _post(client, 9999, "보호자 동의")
    assert res.status_code == 404
    assert res.json() == {"detail": {"code": "DRAFT_NOT_FOUND"}}


def test_explanation_requires_login(anon_client):
    res = anon_client.post(
        "/api/drafts/1/explanations", json={"selected_text": "보호자"}
    )
    assert res.status_code == 401


# ── llm.explain_text ──


def test_llm_explain_text_parses_response(monkeypatch):
    from app import llm

    seen = {}

    def fake_call(prompt, schema=None):
        seen["prompt"], seen["schema"] = prompt, schema
        return json.dumps({"explanation": "  쉬운 풀이  "})

    monkeypatch.setattr(llm, "_call_gemini", fake_call)
    assert llm.explain_text("보호자 동의", "vi", "기본 설명") == "쉬운 풀이"
    assert seen["schema"] == llm.EXPLAIN_SCHEMA
    assert "보호자 동의" in seen["prompt"] and "기본 설명" in seen["prompt"]
    assert "베트남어" in seen["prompt"]


@pytest.mark.parametrize(
    "reply", ["not json", "[]", '{"explanation": ""}', '{"other": 1}']
)
def test_llm_explain_text_rejects_bad_response(monkeypatch, reply):
    from app import llm

    monkeypatch.setattr(llm, "_call_gemini", lambda prompt, schema=None: reply)
    with pytest.raises(llm.LLMCallError):
        llm.explain_text("보호자", "vi")
