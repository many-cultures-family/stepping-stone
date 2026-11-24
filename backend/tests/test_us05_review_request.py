# F-06·F-07 검토 요청 (REVIEW-PRIVACY-API.md 항목 3, US-05). L3는 가짜로 바꾼다. 가짜 데이터만 쓴다.
from types import SimpleNamespace

import pytest

from tests.conftest import insert_draft, insert_form_field

CONFIRMED = "2026-11-20 10:00:00"


@pytest.fixture
def fake_l3(monkeypatch):
    """llm.review_answers를 가짜로 바꾼다. 돌려줄 제안은 fake_l3.reply로 정하고, 받은 값은 fake_l3.calls에 쌓인다"""
    from app import llm

    fake = SimpleNamespace(reply=[], calls=[])

    def review_answers(answers, language):
        fake.calls.append((answers, language))
        return fake.reply

    monkeypatch.setattr(llm, "review_answers", review_answers)
    return fake


@pytest.fixture
def draft(db, seed_user_id):
    """review 단계 작성 건 + 서술형 칸 2개 + 다른 형식 칸 1개 → (draft_id, 칸 id 2개)"""
    d = insert_draft(db, seed_user_id, "수정", "review", fields_confirmed_at=CONFIRMED)
    insert_form_field(db, d, label="성명", format_code="name")
    a = insert_form_field(
        db, d, label="신청 사유", format_code="long_text", guide_text="이유를 쓰세요"
    )
    b = insert_form_field(
        db, d, label="하고 싶은 말", format_code="long_text", description="자유롭게"
    )
    return d, a, b


def _answers(
    a,
    b,
    text_a="저는 [이름1]입니다. 아이를 돌볼 시간이 필요해요.",
    text_b="감사합니다",
    tokens_a=("[이름1]",),
):
    return [
        {"form_field_id": a, "masked_text": text_a, "tokens": list(tokens_a)},
        {"form_field_id": b, "masked_text": text_b, "tokens": []},
    ]


def _post(client, d, answers):
    return client.post(f"/api/drafts/{d}/review:request", json={"answers": answers})


def _draft_row(db, d):
    return db.execute(
        "SELECT review_count, reviewed_at, status, step FROM draft WHERE id = ?", (d,)
    ).fetchone()


def test_review_request_relays_to_l3(client, db, draft, fake_l3):
    d, a, b = draft
    fake_l3.reply = [
        {
            "form_field_id": a,
            "kind": "문법",
            "suggested_text": "저는 [이름1]입니다. 아이를 돌볼 시간이 필요합니다.",
            "explanation": "설명",
        },
        {
            "form_field_id": b,
            "kind": "보충",
            "suggested_text": None,
            "explanation": "더 써 보세요",
        },
    ]
    res = _post(client, d, _answers(a, b))
    assert res.status_code == 200
    assert res.json() == {"suggestions": fake_l3.reply}
    sent, language = fake_l3.calls[0]
    assert language == "vi"
    # 서버 값(label·guide_text)과 가린 답변만 보낸다. 토큰 목록은 L3에 보내지 않는다
    assert sent == [
        {
            "form_field_id": a,
            "label": "신청 사유",
            "guide_text": "이유를 쓰세요",
            "masked_text": "저는 [이름1]입니다. 아이를 돌볼 시간이 필요해요.",
        },
        {
            "form_field_id": b,
            "label": "하고 싶은 말",
            "guide_text": None,
            "masked_text": "감사합니다",
        },
    ]
    row = _draft_row(db, d)
    assert row["review_count"] == 1
    assert row["reviewed_at"] is not None
    assert (row["status"], row["step"]) == ("수정", "review")  # 상태는 바뀌지 않는다


def test_review_request_does_not_store_answers_or_suggestions(
    client, db, draft, fake_l3
):
    d, a, b = draft
    fake_l3.reply = [
        {
            "form_field_id": a,
            "kind": "보충",
            "suggested_text": None,
            "explanation": "설명",
        }
    ]
    _post(client, d, _answers(a, b))
    tables = {
        r[0] for r in db.execute("SELECT name FROM sqlite_master WHERE type = 'table'")
    }
    for table in ("review_suggestion", "privacy_detection"):
        assert table not in tables
    dump = "\n".join(db.iterdump())
    assert "아이를 돌볼 시간" not in dump


def test_review_request_drops_suggestion_with_unknown_or_changed_token(
    client, draft, fake_l3
):
    d, a, b = draft
    fake_l3.reply = [
        {
            "form_field_id": a,
            "kind": "문법",
            "suggested_text": "저는 [이름2]입니다.",
            "explanation": "새 토큰",
        },
        {
            "form_field_id": a,
            "kind": "문법",
            "suggested_text": "저는 [ 이름1 ]입니다.",
            "explanation": "글자 바뀜",
        },
        {
            "form_field_id": a,
            "kind": "문법",
            "suggested_text": "저는 홍길동[이름]입니다.",
            "explanation": "다른 모양",
        },
        # 다른 칸에 보낸 토큰은 이 칸 제안에 쓸 수 없다
        {
            "form_field_id": b,
            "kind": "문법",
            "suggested_text": "[이름1] 감사합니다",
            "explanation": "다른 칸 토큰",
        },
        {
            "form_field_id": a,
            "kind": "문법",
            "suggested_text": "아이를 돌볼 시간이 필요합니다.",
            "explanation": "토큰 빠짐은 둔다",
        },
        {
            "form_field_id": a,
            "kind": "맞춤법",
            "suggested_text": "저는 [이름1]입니다.",
            "explanation": "그대로",
        },
    ]
    res = _post(client, d, _answers(a, b))
    assert [s["explanation"] for s in res.json()["suggestions"]] == [
        "토큰 빠짐은 둔다",
        "그대로",
    ]


@pytest.mark.parametrize(
    "text",
    [
        "제 번호는 010-1234-5678 입니다",
        "메일 test@example.com 로 주세요",
        "주민번호 900101-1234567",
    ],
)
def test_review_request_rejects_remaining_pii(client, db, draft, fake_l3, text):
    d, a, b = draft
    res = _post(client, d, _answers(a, b, text_b=text))
    assert res.status_code == 422
    assert res.json() == {"detail": {"code": "PII_REMAINING", "field_ids": [b]}}
    assert fake_l3.calls == []
    assert _draft_row(db, d)["review_count"] == 0  # 재검사 거절은 세지 않는다


def test_review_request_tokens_are_not_pii(client, draft, fake_l3):
    d, a, b = draft
    text = (
        "연락은 [전화번호1], 메일은 [이메일1], 주소는 [주소1], 직접 가린 것은 [가림1]"
    )
    res = _post(
        client,
        d,
        _answers(
            a,
            b,
            text_a=text,
            tokens_a=("[전화번호1]", "[이메일1]", "[주소1]", "[가림1]"),
        ),
    )
    assert res.status_code == 200


def test_review_request_incomplete_when_field_missing(client, draft, fake_l3):
    d, a, b = draft
    res = _post(client, d, _answers(a, b)[:1])
    assert res.status_code == 400
    assert res.json() == {"detail": {"code": "ANSWERS_INCOMPLETE", "field_ids": [b]}}
    assert fake_l3.calls == []


def test_review_request_incomplete_when_empty_list(client, draft, fake_l3):
    d, a, b = draft
    res = _post(client, d, [])
    assert res.json() == {"detail": {"code": "ANSWERS_INCOMPLETE", "field_ids": [a, b]}}


def test_review_request_incomplete_when_duplicated(client, draft, fake_l3):
    d, a, b = draft
    answers = _answers(a, b) + [{"form_field_id": a, "masked_text": "또", "tokens": []}]
    res = _post(client, d, answers)
    assert res.status_code == 400
    assert res.json() == {"detail": {"code": "ANSWERS_INCOMPLETE", "field_ids": [a]}}


def test_review_request_field_not_found(client, db, draft, fake_l3):
    d, a, b = draft
    name_field = db.execute(
        "SELECT id FROM form_field WHERE draft_id = ? AND format_code = 'name'", (d,)
    ).fetchone()[0]
    for bad in (name_field, 9999):  # 서술형이 아닌 칸, 없는 칸
        answers = _answers(a, b) + [
            {"form_field_id": bad, "masked_text": "x", "tokens": []}
        ]
        res = _post(client, d, answers)
        assert res.status_code == 404
        assert res.json() == {"detail": {"code": "FIELD_NOT_FOUND"}}


@pytest.mark.parametrize("text_b", ["", "   \n"])
def test_review_request_answer_empty(client, draft, fake_l3, text_b):
    d, a, b = draft
    res = _post(client, d, _answers(a, b, text_b=text_b))
    assert res.status_code == 400
    assert res.json() == {"detail": {"code": "ANSWER_EMPTY"}}


@pytest.mark.parametrize(
    "body",
    [
        None,  # JSON 아님
        {},
        {"answers": "x"},
        {"answers": ["x"]},
        {"answers": [{"form_field_id": "1", "masked_text": "a", "tokens": []}]},
        {"answers": [{"form_field_id": True, "masked_text": "a", "tokens": []}]},
        {"answers": [{"form_field_id": 1, "masked_text": 3, "tokens": []}]},
        {"answers": [{"form_field_id": 1, "masked_text": "a"}]},
        {
            "answers": [{"form_field_id": 1, "masked_text": "a", "tokens": ["홍길동"]}]
        },  # 토큰 값을 보냄
        {
            "answers": [{"form_field_id": 1, "masked_text": "a", "tokens": ["[이름]"]}]
        },  # 번호 없음
        {
            "answers": [{"form_field_id": 1, "masked_text": "a", "tokens": ["[학교1]"]}]
        },  # 없는 종류
    ],
)
def test_review_request_invalid_body(client, draft, fake_l3, body):
    d, _, _ = draft
    if body is None:
        res = client.post(f"/api/drafts/{d}/review:request", content=b"not json")
    else:
        res = client.post(f"/api/drafts/{d}/review:request", json=body)
    assert res.status_code == 400
    assert res.json() == {"detail": {"code": "INVALID_REVIEW_REQUEST"}}


def test_review_request_limit(client, db, draft, fake_l3):
    d, a, b = draft
    db.execute("UPDATE draft SET review_count = 5 WHERE id = ?", (d,))
    db.commit()
    res = _post(client, d, _answers(a, b))
    assert res.status_code == 409
    assert res.json() == {"detail": {"code": "REVIEW_LIMIT_EXCEEDED"}}
    assert fake_l3.calls == []


def test_review_request_fifth_call_allowed(client, db, draft, fake_l3):
    d, a, b = draft
    db.execute("UPDATE draft SET review_count = 4 WHERE id = ?", (d,))
    db.commit()
    assert _post(client, d, _answers(a, b)).status_code == 200
    assert _draft_row(db, d)["review_count"] == 5


def test_review_request_llm_failure_not_counted(client, db, draft, monkeypatch):
    from app import llm

    def boom(*args):
        raise llm.LLMCallError("fake")

    monkeypatch.setattr(llm, "review_answers", boom)
    d, a, b = draft
    res = _post(client, d, _answers(a, b))
    assert res.status_code == 502
    assert res.json() == {"detail": {"code": "LLM_CALL_FAILED"}}
    row = _draft_row(db, d)
    assert row["review_count"] == 0
    assert row["reviewed_at"] is None


def test_review_request_no_long_text_fields(client, db, seed_user_id, fake_l3):
    d = insert_draft(db, seed_user_id, "수정", "review", fields_confirmed_at=CONFIRMED)
    insert_form_field(db, d, label="성명", format_code="name")
    res = _post(client, d, [])
    assert res.status_code == 200
    assert res.json() == {"suggestions": []}
    assert fake_l3.calls == []
    row = _draft_row(db, d)
    assert row["reviewed_at"] is not None  # 검토를 마친 것으로 본다
    assert row["review_count"] == 0


@pytest.mark.parametrize("step", ["writing", "prior_info"])
def test_review_request_step_invalid(client, db, seed_user_id, fake_l3, step):
    d = insert_draft(db, seed_user_id, "수정", step, fields_confirmed_at=CONFIRMED)
    res = _post(client, d, [])
    assert res.status_code == 409
    assert res.json() == {"detail": {"code": "DRAFT_STEP_INVALID"}}


@pytest.mark.parametrize("status", ["반려", "성공", "취소"])
def test_review_request_not_editable(client, db, seed_user_id, fake_l3, status):
    d = insert_draft(db, seed_user_id, status, "review", fields_confirmed_at=CONFIRMED)
    assert _post(client, d, []).json() == {"detail": {"code": "DRAFT_NOT_EDITABLE"}}


def test_review_request_other_user(client, db, fake_l3):
    cur = db.execute(
        "INSERT INTO user (google_sub, email, language) VALUES ('other', 'o@example.com', 'vi')"
    )
    d = insert_draft(db, cur.lastrowid, "수정", "review", fields_confirmed_at=CONFIRMED)
    assert _post(client, d, []).status_code == 403


def test_review_request_not_found(client, fake_l3):
    assert _post(client, 9999, []).status_code == 404


def test_review_request_requires_login(anon_client):
    assert (
        anon_client.post(
            "/api/drafts/1/review:request", json={"answers": []}
        ).status_code
        == 401
    )


@pytest.mark.parametrize(
    "text",
    [
        "이름은 [이름1]이고 연락처는 [전화번호1]입니다",
        "주소는 [주소1]입니다. 감사합니다",
        "주소는 아직 정하지 못했어요",  # 라벨 규칙(OCR 문서용)은 쓰지 않는다
    ],
)
def test_review_request_uses_same_rules_as_browser(client, draft, fake_l3, text):
    d, a, b = draft
    tokens = ("[이름1]", "[전화번호1]", "[주소1]")
    res = _post(client, d, _answers(a, b, text_a=text, tokens_a=tokens))
    assert res.status_code == 200


def test_review_request_rules_match_privacy_rules_api(client):
    # 재검사 규칙 = GET /api/privacy-rules 가 브라우저에 주는 규칙
    from app import privacy

    sent = {r["pattern"] for r in client.get("/api/privacy-rules").json()["rules"]}
    assert sent == {p.pattern for _, p in privacy._PATTERNS}
