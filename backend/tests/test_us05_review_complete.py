# F-06·F-07 최종 확인 (REVIEW-PRIVACY-API.md 항목 5, US-05, R9). 가짜 데이터만 쓴다.
import pytest

from tests.conftest import insert_draft

CONFIRMED = "2026-11-20 10:00:00"
ZERO = {
    "remaining_required": 0,
    "unacknowledged_mismatches": 0,
    "undecided_suggestions": 0,
    "undecided_privacy": 0,
}


@pytest.fixture
def reviewed(db, seed_user_id):
    return insert_draft(
        db,
        seed_user_id,
        "수정",
        "review",
        fields_confirmed_at=CONFIRMED,
        reviewed_at=CONFIRMED,
    )


def _complete(client, d, body):
    return client.post(f"/api/drafts/{d}:complete", json=body)


def _row(db, d):
    return db.execute(
        "SELECT status, step, reject_reason FROM draft WHERE id = ?", (d,)
    ).fetchone()


def test_complete_success(client, db, reviewed):
    res = _complete(client, reviewed, ZERO)
    assert res.status_code == 200
    assert res.json() == {"draft": {"id": reviewed, "status": "성공", "step": "review"}}
    assert tuple(_row(db, reviewed)) == ("성공", "review", None)


@pytest.mark.parametrize("key", list(ZERO))
def test_complete_rejected_when_condition_left(client, db, reviewed, key):
    res = _complete(client, reviewed, {**ZERO, key: 1})
    assert res.status_code == 200  # 결과가 반려여도 요청은 처리됨
    assert res.json() == {
        "draft": {
            "id": reviewed,
            "status": "반려",
            "step": "review",
            "reject_reason": "CONDITION_UNMET",
        }
    }
    assert tuple(_row(db, reviewed)) == ("반려", "review", "CONDITION_UNMET")


def test_complete_rejected_without_confirmed_fields(client, db, seed_user_id):
    d = insert_draft(db, seed_user_id, "수정", "review", reviewed_at=CONFIRMED)
    assert _complete(client, d, ZERO).json()["draft"]["status"] == "반려"


def test_complete_requires_review_done(client, db, seed_user_id):
    d = insert_draft(db, seed_user_id, "수정", "review", fields_confirmed_at=CONFIRMED)
    res = _complete(client, d, ZERO)
    assert res.status_code == 409
    assert res.json() == {"detail": {"code": "REVIEW_NOT_DONE"}}
    assert tuple(_row(db, d)) == ("수정", "review", None)  # 상태를 바꾸지 않는다


def test_complete_after_review_request_flow(client, db, seed_user_id, monkeypatch):
    # 검토 시작 → (서술형 칸 없음) 검토 요청 → 최종 확인 → 제출까지 이어지는지
    d = insert_draft(db, seed_user_id, "수정", "writing", fields_confirmed_at=CONFIRMED)
    assert client.post(f"/api/drafts/{d}/review:start").status_code == 200
    assert _complete(client, d, ZERO).status_code == 409  # 아직 검토 안 함
    assert (
        client.post(f"/api/drafts/{d}/review:request", json={"answers": []}).status_code
        == 200
    )
    assert _complete(client, d, ZERO).json()["draft"]["status"] == "성공"
    assert client.post(f"/api/drafts/{d}:submit").status_code == 200


@pytest.mark.parametrize(
    "body",
    [
        None,
        {},
        {**ZERO, "undecided_privacy": -1},
        {**ZERO, "remaining_required": "0"},
        {**ZERO, "remaining_required": 0.0},
        {**ZERO, "undecided_suggestions": True},
        {k: v for k, v in ZERO.items() if k != "unacknowledged_mismatches"},
    ],
)
def test_complete_invalid_body(client, db, reviewed, body):
    if body is None:
        res = client.post(f"/api/drafts/{reviewed}:complete", content=b"not json")
    else:
        res = _complete(client, reviewed, body)
    assert res.status_code == 400
    assert res.json() == {"detail": {"code": "INVALID_COMPLETE_REQUEST"}}
    assert _row(db, reviewed)["status"] == "수정"


@pytest.mark.parametrize("step", ["writing", "prior_info"])
def test_complete_step_invalid(client, db, seed_user_id, step):
    d = insert_draft(
        db,
        seed_user_id,
        "수정",
        step,
        fields_confirmed_at=CONFIRMED,
        reviewed_at=CONFIRMED,
    )
    res = _complete(client, d, ZERO)
    assert res.status_code == 409
    assert res.json() == {"detail": {"code": "DRAFT_STEP_INVALID"}}


@pytest.mark.parametrize("status", ["반려", "성공", "취소"])
def test_complete_not_editable(client, db, seed_user_id, status):
    d = insert_draft(
        db,
        seed_user_id,
        status,
        "review",
        fields_confirmed_at=CONFIRMED,
        reviewed_at=CONFIRMED,
    )
    res = _complete(client, d, ZERO)
    assert res.status_code == 409
    assert res.json() == {"detail": {"code": "DRAFT_NOT_EDITABLE"}}


def test_complete_other_user(client, db):
    cur = db.execute(
        "INSERT INTO user (google_sub, email, language) VALUES ('other', 'o@example.com', 'vi')"
    )
    d = insert_draft(
        db,
        cur.lastrowid,
        "수정",
        "review",
        fields_confirmed_at=CONFIRMED,
        reviewed_at=CONFIRMED,
    )
    assert _complete(client, d, ZERO).status_code == 403


def test_complete_not_found(client):
    assert _complete(client, 9999, ZERO).status_code == 404


def test_complete_requires_login(anon_client):
    assert anon_client.post("/api/drafts/1:complete", json=ZERO).status_code == 401
