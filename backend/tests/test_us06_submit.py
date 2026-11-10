# US-06: 제출 완료 처리 (DRAFT-STATUS-API.md 항목 2)
from conftest import insert_draft


def submit(client, draft_id):
    return client.post(f"/api/drafts/{draft_id}:submit")


# US-06 (정상)
def test_us06_submit_marks_submitted_at_without_changing_status(
    client, db, seed_user_id
):
    draft_id = insert_draft(db, seed_user_id, "성공", "review")

    res = submit(client, draft_id)

    assert res.status_code == 200
    body = res.json()
    assert body["id"] == draft_id
    assert body["status"] == "성공"
    assert body["submitted_at"].endswith("Z")

    row = db.execute(
        "SELECT status, submitted_at FROM draft WHERE id = ?", (draft_id,)
    ).fetchone()
    assert row["status"] == "성공"
    assert row["submitted_at"] is not None


# US-06 (실패·거절): 완성본 최종 확인 전이면 제출할 수 없다
def test_us06_submit_rejects_draft_not_ready(client, db, seed_user_id):
    draft_id = insert_draft(db, seed_user_id, "수정", "review")

    res = submit(client, draft_id)

    assert res.status_code == 409
    assert res.json() == {"detail": {"code": "DRAFT_NOT_READY"}}


# US-06 (실패·거절): 중복 제출
def test_us06_submit_rejects_already_submitted(client, db, seed_user_id):
    draft_id = insert_draft(
        db, seed_user_id, "성공", "review", submitted_at="2026-01-01 00:00:00"
    )

    res = submit(client, draft_id)

    assert res.status_code == 409
    assert res.json() == {"detail": {"code": "ALREADY_SUBMITTED"}}


# US-06 (실패·거절): 없는 작성 건
def test_us06_submit_missing_draft_is_404(client):
    res = submit(client, 99999)

    assert res.status_code == 404
    assert res.json() == {"detail": {"code": "DRAFT_NOT_FOUND"}}


# US-06 (권한): 다른 사용자의 작성 건은 제출할 수 없다
def test_us06_submit_forbidden_for_other_users_draft(client, db):
    other_user_id = db.execute(
        "INSERT INTO user (google_sub, email, language) VALUES (?, ?, ?)",
        ("other-sub-0001", "other@example.com", "ko"),
    ).lastrowid
    db.commit()
    draft_id = insert_draft(db, other_user_id, "성공", "review")

    res = submit(client, draft_id)

    assert res.status_code == 403
    assert res.json() == {"detail": {"code": "FORBIDDEN_DRAFT"}}


def test_us06_submit_without_login_is_401(anon_client, db, seed_user_id):
    draft_id = insert_draft(db, seed_user_id, "성공", "review")

    res = submit(anon_client, draft_id)

    assert res.status_code == 401
    assert res.json() == {"detail": {"code": "LOGIN_REQUIRED"}}
