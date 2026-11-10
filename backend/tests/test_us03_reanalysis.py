# US-03: 추론 결과 재분석 요청 (FIELD-CHECK-API.md 항목 2)
import sqlite3

from conftest import insert_document, insert_draft, insert_form_field

from app import llm

INFER_PATH = "/api/drafts/{}/fields:infer"

FAKE_L1_FIELDS = [
    {
        "label": "보호자 연락처",
        "format_code": "phone",
        "required": True,
        "prior_info_key": "phone",
        "description": "보호자 전화번호를 적습니다",
        "bbox": {"page": 1, "x": 0.1, "y": 0.3, "w": 0.4, "h": 0.04},
    }
]


def infer(client, draft_id, body=None):
    if body is None:
        return client.post(INFER_PATH.format(draft_id))
    return client.post(INFER_PATH.format(draft_id), json=body)


# US-02 #2 (정상): 처음 호출이면 L1을 불러 항목을 추론한다
def test_us03_infer_calls_l1_on_first_request(client, db, seed_user_id, monkeypatch):
    draft_id = insert_draft(db, seed_user_id, "수정", "field_check")
    insert_document(db, draft_id, masked_text="문서 내용")
    monkeypatch.setattr(llm, "infer_fields", lambda **kwargs: FAKE_L1_FIELDS)

    res = infer(client, draft_id)

    assert res.status_code == 200
    body = res.json()
    assert len(body["fields"]) == 1
    assert body["fields"][0]["label"] == "보호자 연락처"
    assert body["draft"]["reanalysis_count"] == 0


# 멱등성: 본문에 flagged_field_ids 키가 없고 이미 fields가 있으면 L1을 다시 부르지 않는다
def test_us03_infer_duplicate_call_reuses_stored_fields(
    client, db, seed_user_id, monkeypatch
):
    draft_id = insert_draft(db, seed_user_id, "수정", "field_check")
    insert_form_field(db, draft_id, label="기존 항목")

    def fail_if_called(**kwargs):
        raise AssertionError("L1을 다시 부르면 안 된다")

    monkeypatch.setattr(llm, "infer_fields", fail_if_called)

    res = infer(client, draft_id)

    assert res.status_code == 200
    assert res.json()["fields"][0]["label"] == "기존 항목"


# US-03 #1 (정상): 원본과 다름 표시 항목이 있으면 재분석해 기존 항목을 새 항목으로 바꾼다
def test_us03_reanalysis_replaces_fields_and_increments_count(
    client, db, seed_user_id, monkeypatch
):
    draft_id = insert_draft(db, seed_user_id, "수정", "field_check")
    insert_document(db, draft_id, masked_text="문서 내용")
    old_field_id = insert_form_field(db, draft_id, label="틀린 항목")
    monkeypatch.setattr(llm, "infer_fields", lambda **kwargs: FAKE_L1_FIELDS)

    res = infer(client, draft_id, {"flagged_field_ids": [old_field_id]})

    assert res.status_code == 200
    body = res.json()
    assert body["draft"]["reanalysis_count"] == 1
    assert all(f["id"] != old_field_id for f in body["fields"])
    assert (
        db.execute(
            "SELECT COUNT(*) FROM form_field WHERE id = ?", (old_field_id,)
        ).fetchone()[0]
        == 0
    )


# US-03 #2 (실패·거절): '원본과 다름' 표시가 0개이면 L1을 부르지 않고 거절한다
def test_us03_reanalysis_rejects_empty_flagged_ids(
    client, db, seed_user_id, monkeypatch
):
    draft_id = insert_draft(db, seed_user_id, "수정", "field_check")

    def fail_if_called(**kwargs):
        raise AssertionError("L1을 부르면 안 된다")

    monkeypatch.setattr(llm, "infer_fields", fail_if_called)

    res = infer(client, draft_id, {"flagged_field_ids": []})

    assert res.status_code == 400
    assert res.json() == {"detail": {"code": "NO_FIELDS_FLAGGED"}}


def test_us03_reanalysis_rejects_unknown_flagged_id(client, db, seed_user_id):
    draft_id = insert_draft(db, seed_user_id, "수정", "field_check")
    insert_form_field(db, draft_id)

    res = infer(client, draft_id, {"flagged_field_ids": [999999]})

    assert res.status_code == 404
    assert res.json() == {"detail": {"code": "FIELD_NOT_FOUND"}}


# US-03 #3 (실패·거절): 재분석 결과가 규칙 검증을 통과 못해도 머문다(별도 US-02 테스트로 확인),
# 여기서는 재분석 횟수 한도를 확인한다
def test_us03_reanalysis_rejects_when_limit_exceeded(client, db, seed_user_id):
    draft_id = insert_draft(db, seed_user_id, "수정", "field_check", reanalysis_count=3)
    field_id = insert_form_field(db, draft_id)

    res = infer(client, draft_id, {"flagged_field_ids": [field_id]})

    assert res.status_code == 409
    assert res.json() == {"detail": {"code": "REANALYSIS_LIMIT_EXCEEDED"}}


# L1 호출 실패: 재시도 없이 502, 상태·단계·기존 항목은 바뀌지 않는다
def test_us03_infer_llm_failure_returns_502_without_state_change(
    client, db, seed_user_id, monkeypatch
):
    draft_id = insert_draft(db, seed_user_id, "수정", "field_check")
    insert_document(db, draft_id, masked_text="문서 내용")

    def raise_error(**kwargs):
        raise llm.LLMCallError("timeout")

    monkeypatch.setattr(llm, "infer_fields", raise_error)

    res = infer(client, draft_id)

    assert res.status_code == 502
    assert res.json() == {"detail": {"code": "LLM_CALL_FAILED"}}
    assert (
        db.execute(
            "SELECT COUNT(*) FROM form_field WHERE draft_id = ?", (draft_id,)
        ).fetchone()[0]
        == 0
    )
    row = db.execute(
        "SELECT status, step FROM draft WHERE id = ?", (draft_id,)
    ).fetchone()
    assert row["status"] == "수정"
    assert row["step"] == "field_check"


# F-02 리뷰: masked_text가 비어 있으면(OCR 전·실패) L1을 부르지 않고 막는다
def test_us03_infer_rejects_empty_masked_text_without_calling_llm(
    client, db, seed_user_id, monkeypatch
):
    draft_id = insert_draft(db, seed_user_id, "수정", "field_check")
    insert_document(db, draft_id, masked_text="")

    def fail_if_called(**kwargs):
        raise AssertionError("L1을 부르면 안 된다")

    monkeypatch.setattr(llm, "infer_fields", fail_if_called)

    res = infer(client, draft_id)

    assert res.status_code == 502
    assert res.json() == {"detail": {"code": "LLM_CALL_FAILED"}}


# F-02 리뷰: 동시 호출 레이스 — L1이 끝나는 사이 다른 요청이 먼저 저장했다면 중복 저장하지 않는다
# (infer 라우트가 스레드풀에서 돈다 — 부수 효과는 같은 커넥션을 공유 못하므로 새로 연다)
def test_us03_infer_does_not_duplicate_fields_when_another_request_wins_race(
    client, db, tmp_path, seed_user_id, monkeypatch
):
    draft_id = insert_draft(db, seed_user_id, "수정", "field_check")
    insert_document(db, draft_id, masked_text="문서 내용")

    def infer_fields_with_concurrent_winner(**kwargs):
        # 이 요청이 L1 응답을 기다리는 사이, 다른 요청이 먼저 저장을 마쳤다고 가정한다
        conn = sqlite3.connect(tmp_path / "test.db")
        try:
            insert_form_field(conn, draft_id, label="먼저 저장된 항목")
        finally:
            conn.close()
        return FAKE_L1_FIELDS

    monkeypatch.setattr(llm, "infer_fields", infer_fields_with_concurrent_winner)

    res = infer(client, draft_id)

    assert res.status_code == 200
    rows = db.execute(
        "SELECT label FROM form_field WHERE draft_id = ?", (draft_id,)
    ).fetchall()
    assert [r["label"] for r in rows] == ["먼저 저장된 항목"]


# F-02 리뷰: 재분석 동시 호출 레이스 — 재확인 없이 통과시키면 횟수 한도(3)를 넘길 수 있었다
def test_us03_reanalysis_limit_enforced_against_concurrent_race(
    client, db, tmp_path, seed_user_id, monkeypatch
):
    draft_id = insert_draft(db, seed_user_id, "수정", "field_check", reanalysis_count=2)
    field_id = insert_form_field(db, draft_id)
    insert_document(db, draft_id, masked_text="문서 내용")

    def infer_fields_with_concurrent_winner(**kwargs):
        # 이 요청의 사전 확인(reanalysis_count=2 < 3) 뒤, 다른 요청이 먼저
        # 재분석을 마쳐 횟수를 3으로 올렸다고 가정한다
        conn = sqlite3.connect(tmp_path / "test.db")
        try:
            conn.execute(
                "UPDATE draft SET reanalysis_count = 3 WHERE id = ?", (draft_id,)
            )
            conn.commit()
        finally:
            conn.close()
        return FAKE_L1_FIELDS

    monkeypatch.setattr(llm, "infer_fields", infer_fields_with_concurrent_winner)

    res = infer(client, draft_id, {"flagged_field_ids": [field_id]})

    assert res.status_code == 409
    assert res.json() == {"detail": {"code": "REANALYSIS_LIMIT_EXCEEDED"}}


# F-02 리뷰: 깨진 JSON을 보내면 "키 없음"으로 처리돼 L1이 불리면 안 된다
def test_us03_infer_rejects_malformed_json_without_calling_llm(
    client, db, seed_user_id, monkeypatch
):
    draft_id = insert_draft(db, seed_user_id, "수정", "field_check")

    def fail_if_called(**kwargs):
        raise AssertionError("L1을 부르면 안 된다")

    monkeypatch.setattr(llm, "infer_fields", fail_if_called)

    res = client.post(
        INFER_PATH.format(draft_id),
        content="{깨진 JSON".encode(),
        headers={"Content-Type": "application/json"},
    )

    assert res.status_code == 400
    assert res.json() == {"detail": {"code": "INVALID_FLAGGED_FIELD_IDS"}}


# F-02 리뷰: flagged_field_ids가 정수 배열이 아니면(중첩 배열 등) 500 대신 400
def test_us03_infer_rejects_non_integer_flagged_field_ids(client, db, seed_user_id):
    draft_id = insert_draft(db, seed_user_id, "수정", "field_check")

    res = infer(client, draft_id, {"flagged_field_ids": [[1]]})

    assert res.status_code == 400
    assert res.json() == {"detail": {"code": "INVALID_FLAGGED_FIELD_IDS"}}


# 권한: 다른 사용자의 작성 건은 추론·재분석할 수 없다
def test_us03_infer_forbidden_for_other_users_draft(client, db):
    other_user_id = db.execute(
        "INSERT INTO user (google_sub, email, language) VALUES (?, ?, ?)",
        ("other-sub-0001", "other@example.com", "ko"),
    ).lastrowid
    db.commit()
    draft_id = insert_draft(db, other_user_id, "수정", "field_check")

    res = infer(client, draft_id)

    assert res.status_code == 403
    assert res.json() == {"detail": {"code": "FORBIDDEN_DRAFT"}}


def test_us03_infer_without_login_is_401(anon_client, db, seed_user_id):
    draft_id = insert_draft(db, seed_user_id, "수정", "field_check")

    res = infer(anon_client, draft_id)

    assert res.status_code == 401
    assert res.json() == {"detail": {"code": "LOGIN_REQUIRED"}}
