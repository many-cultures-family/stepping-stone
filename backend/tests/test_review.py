# F-06: 서술형 답변 검토 (frontend/src/api/review.js [제안] 계약을 따른다)
from conftest import insert_draft, insert_field_answer, insert_form_field

from app import llm

REVIEW_PATH = "/api/drafts/{}/review"
REQUEST_PATH = "/api/drafts/{}/review:request"
SUGGESTION_PATH = "/api/drafts/{}/review/suggestions/{}"


def get_review(client, draft_id):
    return client.get(REVIEW_PATH.format(draft_id))


def request_review(client, draft_id):
    return client.post(REQUEST_PATH.format(draft_id))


def decide(client, draft_id, suggestion_id, decision):
    return client.patch(
        SUGGESTION_PATH.format(draft_id, suggestion_id), json={"decision": decision}
    )


def _draft_with_long_text_answer(db, user_id, value="저는 한국에 산지 2년 되었습니다."):
    draft_id = insert_draft(db, user_id, "수정", "review")
    field_id = insert_form_field(
        db,
        draft_id,
        label="신청 사유",
        format_code="long_text",
        required=1,
        description="왜 신청하는지 써 주세요.",
    )
    answer_id = insert_field_answer(db, field_id, value)
    return draft_id, answer_id


# 정상: 서술형 항목의 답변 목록을 보여 준다
def test_get_review_returns_long_text_answers(client, db, seed_user_id):
    draft_id, answer_id = _draft_with_long_text_answer(db, seed_user_id)

    res = get_review(client, draft_id)

    assert res.status_code == 200
    assert res.json() == {
        "answers": [
            {
                "id": answer_id,
                "label": "신청 사유",
                "guide": "왜 신청하는지 써 주세요.",
                "value": "저는 한국에 산지 2년 되었습니다.",
            }
        ]
    }


# 정상: 서술형 항목이 없으면 빈 목록
def test_get_review_returns_empty_when_no_long_text_fields(client, db, seed_user_id):
    draft_id = insert_draft(db, seed_user_id, "수정", "review")
    insert_form_field(db, draft_id, format_code="name", required=1)

    res = get_review(client, draft_id)

    assert res.json() == {"answers": []}


# 공통 규칙: step이 review가 아니면 조회할 수 없다
def test_get_review_rejects_wrong_step(client, db, seed_user_id):
    draft_id = insert_draft(db, seed_user_id, "수정", "writing")

    res = get_review(client, draft_id)

    assert res.status_code == 409
    assert res.json() == {"detail": {"code": "DRAFT_STEP_INVALID"}}


# 정상: 검토를 요청하면 L3 응답을 저장하고 돌려준다
def test_request_review_calls_llm_and_stores_suggestions(
    client, db, seed_user_id, monkeypatch
):
    draft_id, answer_id = _draft_with_long_text_answer(db, seed_user_id)

    def fake_review_answers(answers, language):
        assert answers == [
            {
                "field_answer_id": answer_id,
                "label": "신청 사유",
                "guide_text": "왜 신청하는지 써 주세요.",
                "value": "저는 한국에 산지 2년 되었습니다.",
            }
        ]
        return [
            {
                "field_answer_id": answer_id,
                "kind": "맞춤법",
                "suggested_text": "저는 한국에 산 지 2년 되었습니다.",
                "explanation": "'산 지'는 띄어 써요.",
            }
        ]

    monkeypatch.setattr(llm, "review_answers", fake_review_answers)

    res = request_review(client, draft_id)

    assert res.status_code == 200
    body = res.json()
    assert len(body["suggestions"]) == 1
    suggestion = body["suggestions"][0]
    assert suggestion["field_answer_id"] == answer_id
    assert suggestion["kind"] == "맞춤법"
    assert suggestion["decision"] == "미결정"

    row = db.execute(
        "SELECT COUNT(*) FROM review_suggestion WHERE field_answer_id = ?",
        (answer_id,),
    ).fetchone()[0]
    assert row == 1


# 개인정보 보호(팀 리뷰): 답변에 사용자가 저장해 둔 사전 정보가 섞여 있으면
# L3에 보내기 전에 가린다 (원문이 그대로 Gemini로 전송되던 문제)
def test_request_review_masks_known_prior_info_before_calling_llm(
    client, db, seed_user_id, monkeypatch
):
    # 시드 사전 정보(conftest SEED_PRIOR_INFO)의 phone 값
    draft_id, answer_id = _draft_with_long_text_answer(
        db, seed_user_id, value="연락처는 010-0000-1234입니다."
    )
    captured = {}

    def fake_review_answers(answers, language):
        captured["answers"] = answers
        return []

    monkeypatch.setattr(llm, "review_answers", fake_review_answers)

    request_review(client, draft_id)

    assert captured["answers"][0]["value"] == "연락처는 [phone]입니다."
    # DB에 저장된 원문 답변은 그대로 유지된다 (마스킹은 L3 전송용 사본에만 적용)
    row = db.execute(
        "SELECT value FROM field_answer WHERE id = ?", (answer_id,)
    ).fetchone()
    assert row["value"] == "연락처는 010-0000-1234입니다."


# 정상: 서술형 항목이 없으면 L3을 부르지 않고 빈 목록을 돌려준다
def test_request_review_skips_llm_when_no_long_text_fields(
    client, db, seed_user_id, monkeypatch
):
    draft_id = insert_draft(db, seed_user_id, "수정", "review")

    def fail_if_called(*args, **kwargs):
        raise AssertionError("서술형 항목이 없으면 L3을 부르면 안 된다")

    monkeypatch.setattr(llm, "review_answers", fail_if_called)

    res = request_review(client, draft_id)

    assert res.status_code == 200
    assert res.json() == {"suggestions": []}


# 정상: 이미 검토한 적 있으면 L3을 다시 부르지 않는다 (멱등성)
def test_request_review_is_idempotent(client, db, seed_user_id, monkeypatch):
    draft_id, answer_id = _draft_with_long_text_answer(db, seed_user_id)
    call_count = {"n": 0}

    def fake_review_answers(answers, language):
        call_count["n"] += 1
        return [
            {
                "field_answer_id": answer_id,
                "kind": "맞춤법",
                "suggested_text": "고친 문장",
                "explanation": "설명",
            }
        ]

    monkeypatch.setattr(llm, "review_answers", fake_review_answers)

    first = request_review(client, draft_id)
    second = request_review(client, draft_id)

    assert first.status_code == 200
    assert second.status_code == 200
    assert first.json() == second.json()
    assert call_count["n"] == 1


# 실패·거절: 빈 답변이 있으면 검토를 요청할 수 없다
def test_request_review_rejects_when_answer_is_empty(client, db, seed_user_id):
    draft_id = insert_draft(db, seed_user_id, "수정", "review")
    field_id = insert_form_field(db, draft_id, format_code="long_text", required=1)
    insert_field_answer(db, field_id, "")

    res = request_review(client, draft_id)

    assert res.status_code == 400
    assert res.json() == {"detail": {"code": "ANSWER_EMPTY"}}


# 실패: L3 호출이 실패하면 502를 돌려주고 상태는 바꾸지 않는다
def test_request_review_returns_502_when_llm_fails(
    client, db, seed_user_id, monkeypatch
):
    draft_id, answer_id = _draft_with_long_text_answer(db, seed_user_id)

    def fake_review_answers(answers, language):
        raise llm.LLMCallError("실패")

    monkeypatch.setattr(llm, "review_answers", fake_review_answers)

    res = request_review(client, draft_id)

    assert res.status_code == 502
    assert res.json() == {"detail": {"code": "LLM_CALL_FAILED"}}
    assert (
        db.execute(
            "SELECT COUNT(*) FROM review_suggestion WHERE field_answer_id = ?",
            (answer_id,),
        ).fetchone()[0]
        == 0
    )


# 정상: 제안의 반영 여부를 저장한다
def test_decide_suggestion_updates_decision(client, db, seed_user_id):
    draft_id, answer_id = _draft_with_long_text_answer(db, seed_user_id)
    cur = db.execute(
        "INSERT INTO review_suggestion (field_answer_id, kind, explanation) "
        "VALUES (?, '맞춤법', '설명')",
        (answer_id,),
    )
    db.commit()
    suggestion_id = cur.lastrowid

    res = decide(client, draft_id, suggestion_id, "반영")

    assert res.status_code == 200
    assert res.json() == {"id": suggestion_id, "decision": "반영"}
    row = db.execute(
        "SELECT decision FROM review_suggestion WHERE id = ?", (suggestion_id,)
    ).fetchone()
    assert row["decision"] == "반영"


# 실패·거절: decision 값이 허용 목록 밖이면 거절한다
def test_decide_suggestion_rejects_invalid_decision(client, db, seed_user_id):
    draft_id, answer_id = _draft_with_long_text_answer(db, seed_user_id)
    cur = db.execute(
        "INSERT INTO review_suggestion (field_answer_id, kind, explanation) "
        "VALUES (?, '맞춤법', '설명')",
        (answer_id,),
    )
    db.commit()

    res = decide(client, draft_id, cur.lastrowid, "보류")

    assert res.status_code == 400
    assert res.json() == {"detail": {"code": "DECISION_INVALID"}}


def test_decide_suggestion_missing_is_404(client, db, seed_user_id):
    draft_id, _ = _draft_with_long_text_answer(db, seed_user_id)

    res = decide(client, draft_id, 99999, "무시")

    assert res.status_code == 404
    assert res.json() == {"detail": {"code": "SUGGESTION_NOT_FOUND"}}


# 권한
def test_get_review_without_login_is_401(anon_client, db, seed_user_id):
    draft_id, _ = _draft_with_long_text_answer(db, seed_user_id)

    res = get_review(anon_client, draft_id)

    assert res.status_code == 401
    assert res.json() == {"detail": {"code": "LOGIN_REQUIRED"}}


def test_get_review_forbidden_for_other_users_draft(client, db):
    other_user_id = db.execute(
        "INSERT INTO user (google_sub, email, language) VALUES (?, ?, ?)",
        ("other-sub-0003", "other3@example.com", "ko"),
    ).lastrowid
    db.commit()
    draft_id, _ = _draft_with_long_text_answer(db, other_user_id)

    res = get_review(client, draft_id)

    assert res.status_code == 403
    assert res.json() == {"detail": {"code": "FORBIDDEN_DRAFT"}}
