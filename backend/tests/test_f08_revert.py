# F-08 단계 되돌리기: 검토 → 작성 (POST /api/drafts/{id}:revert). 모든 값은 가짜다
import pytest
from conftest import insert_draft

REVERT_PATH = "/api/drafts/{}:revert"
REVIEW_START_PATH = "/api/drafts/{}/review:start"
CONFIRMED_AT = "2026-11-24 01:00:00"
REVIEWED_AT = "2026-11-24 02:00:00"


def revert(client, draft_id, body=None):
    return client.post(
        REVERT_PATH.format(draft_id), json={"to": "writing"} if body is None else body
    )


def review_draft(db, user_id, **fields):
    # 검토 단계까지 온 작성 건 (입력 항목 확정, 검토 1회 마침)
    return insert_draft(
        db,
        user_id,
        "수정",
        "review",
        fields_confirmed_at=CONFIRMED_AT,
        reviewed_at=REVIEWED_AT,
        review_count=1,
        **fields,
    )


def draft_row(db, draft_id):
    return db.execute(
        "SELECT status, step, review_count, reviewed_at, reanalysis_count "
        "FROM draft WHERE id = ?",
        (draft_id,),
    ).fetchone()


# 1 (정상): 수정·review → writing. 응답과 DB가 함께 바뀐다
def test_revert_review_to_writing(client, db, seed_user_id):
    draft_id = review_draft(db, seed_user_id)

    res = revert(client, draft_id)

    assert res.status_code == 200
    assert res.json() == {
        "id": draft_id,
        "status": "수정",
        "step": "writing",
        "next_action": "WRITING",
    }
    row = draft_row(db, draft_id)
    assert (row["status"], row["step"]) == ("수정", "writing")


# 2: 검토·재분석 횟수와 reviewed_at은 되돌리지 않는다
def test_revert_keeps_counts_and_reviewed_at(client, db, seed_user_id):
    draft_id = review_draft(db, seed_user_id, reanalysis_count=2)

    assert revert(client, draft_id).status_code == 200

    row = draft_row(db, draft_id)
    assert row["review_count"] == 1
    assert row["reviewed_at"] == REVIEWED_AT
    assert row["reanalysis_count"] == 2


# 3: review가 아닌 단계는 되돌릴 수 없다
@pytest.mark.parametrize("step", ["upload", "field_check", "prior_info", "writing"])
def test_revert_rejects_other_steps(client, db, seed_user_id, step):
    draft_id = insert_draft(db, seed_user_id, "수정", step)

    res = revert(client, draft_id)

    assert res.status_code == 409
    assert res.json() == {"detail": {"code": "REVERT_NOT_ALLOWED"}}
    assert draft_row(db, draft_id)["step"] == step


# 4: 수정이 아닌 상태는 되돌릴 수 없다 (성공 문서 되돌리기·R11은 이번 범위 밖)
@pytest.mark.parametrize("status", ["성공", "반려", "취소"])
def test_revert_rejects_other_statuses(client, db, seed_user_id, status):
    draft_id = insert_draft(db, seed_user_id, status, "review")

    res = revert(client, draft_id)

    assert res.status_code == 409
    assert res.json() == {"detail": {"code": "REVERT_NOT_ALLOWED"}}
    assert (draft_row(db, draft_id)["status"], draft_row(db, draft_id)["step"]) == (
        status,
        "review",
    )


# 5: writing이 아닌 곳으로는 되돌릴 수 없다 (prior_info로 되돌리기는 이번 범위 밖)
@pytest.mark.parametrize("to", ["prior_info", "upload", "review", ""])
def test_revert_rejects_other_targets(client, db, seed_user_id, to):
    draft_id = review_draft(db, seed_user_id)

    res = revert(client, draft_id, {"to": to})

    assert res.status_code == 409
    assert res.json() == {"detail": {"code": "REVERT_NOT_ALLOWED"}}
    assert draft_row(db, draft_id)["step"] == "review"


# 6: 본문이 JSON이 아니거나 to가 문자열이 아니면 400
@pytest.mark.parametrize("body", [{}, {"to": None}, {"to": 1}, ["writing"], "writing"])
def test_revert_rejects_bad_body(client, db, seed_user_id, body):
    draft_id = review_draft(db, seed_user_id)

    res = revert(client, draft_id, body)

    assert res.status_code == 400
    assert res.json() == {"detail": {"code": "INVALID_REVERT_REQUEST"}}
    assert draft_row(db, draft_id)["step"] == "review"


def test_revert_rejects_non_json_body(client, db, seed_user_id):
    draft_id = review_draft(db, seed_user_id)

    res = client.post(
        REVERT_PATH.format(draft_id),
        content=b"not json",
        headers={"Content-Type": "application/json"},
    )

    assert res.status_code == 400
    assert res.json() == {"detail": {"code": "INVALID_REVERT_REQUEST"}}


# 7 (권한): 다른 사용자의 작성 건 403, 없는 id 404, 비로그인 401
def test_revert_forbidden_for_other_users_draft(client, db):
    other_id = db.execute(
        "INSERT INTO user (google_sub, email, language) "
        "VALUES ('other-sub', 'other@example.com', 'vi')"
    ).lastrowid
    db.commit()
    draft_id = review_draft(db, other_id)

    res = revert(client, draft_id)

    assert res.status_code == 403
    assert res.json() == {"detail": {"code": "FORBIDDEN_DRAFT"}}
    assert draft_row(db, draft_id)["step"] == "review"


def test_revert_not_found(client):
    res = revert(client, 9999)

    assert res.status_code == 404
    assert res.json() == {"detail": {"code": "DRAFT_NOT_FOUND"}}


def test_revert_requires_login(anon_client, db, seed_user_id):
    draft_id = review_draft(db, seed_user_id)

    res = revert(anon_client, draft_id)

    assert res.status_code == 401
    assert res.json() == {"detail": {"code": "LOGIN_REQUIRED"}}


# 8 (흐름): 되돌린 뒤 review:start를 다시 부르면 review로 돌아가고 reviewed_at이 비워진다
def test_revert_then_review_start_again(client, db, seed_user_id):
    draft_id = review_draft(db, seed_user_id)
    assert revert(client, draft_id).status_code == 200

    res = client.post(REVIEW_START_PATH.format(draft_id))

    assert res.status_code == 200
    row = draft_row(db, draft_id)
    assert row["step"] == "review"
    assert row["reviewed_at"] is None
