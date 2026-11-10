# F-08 항목 1: 작성 목록 조회. backlog에 인수 조건 없음
# (근거: mvp-assumptions-questions.md 30행, DRAFT-STATUS-API.md 항목 1)
from conftest import insert_draft

LIST_PATH = "/api/drafts"


def test_f08_list_excludes_canceled_by_default(client, db, seed_user_id):
    kept = insert_draft(db, seed_user_id, "수정", "field_check")
    insert_draft(db, seed_user_id, "취소", "upload")

    res = client.get(LIST_PATH)

    assert res.status_code == 200
    drafts = res.json()["drafts"]
    assert kept in [d["id"] for d in drafts]
    assert all(d["status"] != "취소" for d in drafts)


def test_f08_list_status_canceled_is_rejected(client):
    res = client.get(LIST_PATH, params={"status": "취소"})

    assert res.status_code == 400
    assert res.json() == {"detail": {"code": "STATUS_NOT_ALLOWED"}}


def test_f08_list_status_unknown_value_is_rejected(client):
    res = client.get(LIST_PATH, params={"status": "존재안함"})

    assert res.status_code == 400
    assert res.json() == {"detail": {"code": "STATUS_NOT_ALLOWED"}}


def test_f08_list_filters_by_status(client, db, seed_user_id):
    rejected = insert_draft(
        db, seed_user_id, "반려", "upload", reject_reason="OCR_FAILED"
    )
    insert_draft(db, seed_user_id, "수정", "upload")

    res = client.get(LIST_PATH, params={"status": "반려"})

    assert res.status_code == 200
    ids = [d["id"] for d in res.json()["drafts"]]
    assert ids == [rejected]
    assert res.json()["drafts"][0]["reject_reason"] == "OCR_FAILED"


def test_f08_next_action_covers_all_steps_and_statuses(client, db, seed_user_id):
    cases = [
        ("수정", "upload", None, "UPLOAD"),
        ("수정", "field_check", None, "FIELD_CHECK"),
        ("수정", "prior_info", None, "PRIOR_INFO"),
        ("수정", "writing", None, "WRITING"),
        ("수정", "review", None, "REVIEW"),
        ("반려", "upload", None, "REJECTED"),
        ("성공", "review", None, "SUBMIT"),
        ("성공", "review", "2026-01-01 00:00:00", "DONE"),
    ]
    expected_by_id = {}
    for status, step, submitted_at, expected in cases:
        extra = {"submitted_at": submitted_at} if submitted_at else {}
        draft_id = insert_draft(db, seed_user_id, status, step, **extra)
        expected_by_id[draft_id] = expected

    res = client.get(LIST_PATH)

    actual_by_id = {d["id"]: d["next_action"] for d in res.json()["drafts"]}
    for draft_id, expected in expected_by_id.items():
        assert actual_by_id[draft_id] == expected


# 권한: 로그인한 사용자 본인 소유의 작성 건만 돌려준다 (다른 사용자 건은 섞이지 않는다)
def test_f08_list_only_returns_own_drafts(client, db, seed_user_id):
    other_user_id = db.execute(
        "INSERT INTO user (google_sub, email, language) VALUES (?, ?, ?)",
        ("other-sub-0001", "other@example.com", "ko"),
    ).lastrowid
    db.commit()
    mine = insert_draft(db, seed_user_id, "수정", "upload")
    insert_draft(db, other_user_id, "수정", "upload")

    res = client.get(LIST_PATH)

    ids = [d["id"] for d in res.json()["drafts"]]
    assert ids == [mine]


def test_f08_list_without_login_is_401(anon_client):
    res = anon_client.get(LIST_PATH)

    assert res.status_code == 401
    assert res.json() == {"detail": {"code": "LOGIN_REQUIRED"}}
