# F-06 검토 시작·서술형 칸 목록 (REVIEW-PRIVACY-API.md 항목 1·2, US-05). 가짜 데이터만 쓴다.
import pytest

from tests.conftest import insert_draft, insert_form_field

CONFIRMED = "2026-11-20 10:00:00"


def _other_user_id(db):
    cur = db.execute(
        "INSERT INTO user (google_sub, email, language) VALUES ('other', 'o@example.com', 'vi')"
    )
    db.commit()
    return cur.lastrowid


# ── 항목 1: POST .../review:start ──


def test_review_start_moves_to_review(client, db, seed_user_id):
    d = insert_draft(
        db,
        seed_user_id,
        "수정",
        "writing",
        fields_confirmed_at=CONFIRMED,
        reviewed_at=CONFIRMED,
    )
    res = client.post(f"/api/drafts/{d}/review:start")
    assert res.status_code == 200
    assert res.json() == {"draft": {"id": d, "status": "수정", "step": "review"}}
    row = db.execute(
        "SELECT step, reviewed_at FROM draft WHERE id = ?", (d,)
    ).fetchone()
    assert row["step"] == "review"
    assert row["reviewed_at"] is None  # 다시 검토를 시작하면 이전 검토 기록을 비운다


def test_review_start_requires_confirmed_fields(client, db, seed_user_id):
    d = insert_draft(db, seed_user_id, "수정", "writing")
    res = client.post(f"/api/drafts/{d}/review:start")
    assert res.status_code == 409
    assert res.json() == {"detail": {"code": "FIELDS_NOT_CONFIRMED"}}
    assert (
        db.execute("SELECT step FROM draft WHERE id = ?", (d,)).fetchone()[0]
        == "writing"
    )


@pytest.mark.parametrize("step", ["upload", "field_check", "prior_info", "review"])
def test_review_start_step_invalid(client, db, seed_user_id, step):
    d = insert_draft(db, seed_user_id, "수정", step, fields_confirmed_at=CONFIRMED)
    res = client.post(f"/api/drafts/{d}/review:start")
    assert res.status_code == 409
    assert res.json() == {"detail": {"code": "DRAFT_STEP_INVALID"}}


@pytest.mark.parametrize("status", ["반려", "성공", "취소"])
def test_review_start_not_editable(client, db, seed_user_id, status):
    d = insert_draft(db, seed_user_id, status, "writing", fields_confirmed_at=CONFIRMED)
    res = client.post(f"/api/drafts/{d}/review:start")
    assert res.status_code == 409
    assert res.json() == {"detail": {"code": "DRAFT_NOT_EDITABLE"}}


def test_review_start_other_user(client, db):
    d = insert_draft(
        db, _other_user_id(db), "수정", "writing", fields_confirmed_at=CONFIRMED
    )
    res = client.post(f"/api/drafts/{d}/review:start")
    assert res.status_code == 403
    assert res.json() == {"detail": {"code": "FORBIDDEN_DRAFT"}}


def test_review_start_not_found(client):
    res = client.post("/api/drafts/9999/review:start")
    assert res.status_code == 404
    assert res.json() == {"detail": {"code": "DRAFT_NOT_FOUND"}}


def test_review_start_requires_login(anon_client):
    assert anon_client.post("/api/drafts/1/review:start").status_code == 401


# ── 항목 2: GET .../review ──


def test_get_review_lists_long_text_fields_only(client, db, seed_user_id):
    d = insert_draft(db, seed_user_id, "수정", "review", fields_confirmed_at=CONFIRMED)
    insert_form_field(db, d, label="성명", format_code="name")
    a = insert_form_field(
        db,
        d,
        label="신청 사유",
        format_code="long_text",
        guide_text="이유를 쓰세요",
        description="설명",
    )
    b = insert_form_field(
        db,
        d,
        label="하고 싶은 말",
        format_code="long_text",
        guide_text=None,
        description="자유롭게",
    )
    res = client.get(f"/api/drafts/{d}/review")
    assert res.status_code == 200
    assert res.json() == {
        "fields": [
            {"id": a, "label": "신청 사유", "guide": "이유를 쓰세요"},
            {
                "id": b,
                "label": "하고 싶은 말",
                "guide": "자유롭게",
            },  # guide_text가 없으면 description
        ]
    }


def test_get_review_empty_when_no_long_text(client, db, seed_user_id):
    d = insert_draft(db, seed_user_id, "수정", "review", fields_confirmed_at=CONFIRMED)
    insert_form_field(db, d, label="성명", format_code="name")
    assert client.get(f"/api/drafts/{d}/review").json() == {"fields": []}


def test_get_review_does_not_read_other_drafts_fields(client, db, seed_user_id):
    d = insert_draft(db, seed_user_id, "수정", "review", fields_confirmed_at=CONFIRMED)
    other = insert_draft(
        db, seed_user_id, "수정", "review", fields_confirmed_at=CONFIRMED
    )
    insert_form_field(db, other, label="다른 건", format_code="long_text")
    assert client.get(f"/api/drafts/{d}/review").json() == {"fields": []}


@pytest.mark.parametrize("step", ["writing", "prior_info"])
def test_get_review_step_invalid(client, db, seed_user_id, step):
    d = insert_draft(db, seed_user_id, "수정", step, fields_confirmed_at=CONFIRMED)
    res = client.get(f"/api/drafts/{d}/review")
    assert res.status_code == 409
    assert res.json() == {"detail": {"code": "DRAFT_STEP_INVALID"}}


def test_get_review_not_editable(client, db, seed_user_id):
    d = insert_draft(db, seed_user_id, "성공", "review", fields_confirmed_at=CONFIRMED)
    assert client.get(f"/api/drafts/{d}/review").json() == {
        "detail": {"code": "DRAFT_NOT_EDITABLE"}
    }


def test_get_review_other_user(client, db):
    d = insert_draft(
        db, _other_user_id(db), "수정", "review", fields_confirmed_at=CONFIRMED
    )
    assert client.get(f"/api/drafts/{d}/review").status_code == 403


def test_get_review_not_found(client):
    assert client.get("/api/drafts/9999/review").status_code == 404


def test_get_review_requires_login(anon_client):
    assert anon_client.get("/api/drafts/1/review").status_code == 401
