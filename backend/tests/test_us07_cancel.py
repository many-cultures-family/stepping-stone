# US-07: 작성 건 취소 (DRAFT-STATUS-API.md 항목 3)
from conftest import insert_draft


def cancel(client, draft_id):
    return client.post(f"/api/drafts/{draft_id}:cancel")


# US-07 (정상)
def test_us07_cancel_marks_status_canceled(client, db, seed_user_id):
    draft_id = insert_draft(db, seed_user_id, "수정", "field_check")

    res = cancel(client, draft_id)

    assert res.status_code == 200
    assert res.json() == {"id": draft_id, "status": "취소"}
    row = db.execute("SELECT status FROM draft WHERE id = ?", (draft_id,)).fetchone()
    assert row["status"] == "취소"


# 제출 후에도 취소를 허용한다 — 팀 투표로 A안(허용) 확정 (DRAFT-STATUS-API.md 항목 3,
# 03-rules-states-llm.md·DATA-MODEL.md 123행엔 제출 조건이 없고 R1·R8·T3 취지상 파기 경로가 필요함)
def test_us07_cancel_allowed_after_submit(client, db, seed_user_id):
    draft_id = insert_draft(
        db, seed_user_id, "성공", "review", submitted_at="2026-01-01 00:00:00"
    )

    res = cancel(client, draft_id)

    assert res.status_code == 200
    assert res.json()["status"] == "취소"


# US-07 (실패·거절): 이미 취소된 건
def test_us07_cancel_already_canceled_is_409(client, db, seed_user_id):
    draft_id = insert_draft(db, seed_user_id, "취소", "upload")

    res = cancel(client, draft_id)

    assert res.status_code == 409
    assert res.json() == {"detail": {"code": "ALREADY_CANCELED"}}


# US-07 (실패·거절): 없는 작성 건
def test_us07_cancel_missing_draft_is_404(client):
    res = cancel(client, 99999)

    assert res.status_code == 404
    assert res.json() == {"detail": {"code": "DRAFT_NOT_FOUND"}}


# US-07 (정상): 취소 때 업로드 문서·입력 항목·입력값을 지우되 사전 정보는 남긴다 (T3)
def test_us07_cancel_deletes_document_and_fields_but_keeps_prior_info(
    client, db, upload_dir, seed_user_id
):
    draft_id = insert_draft(db, seed_user_id, "수정", "field_check")
    upload_dir.mkdir(parents=True, exist_ok=True)
    file_path = upload_dir / "fake.pdf"
    file_path.write_bytes(b"%PDF-1.4 fake")
    db.execute(
        "INSERT INTO document (draft_id, file_path, mime_type, page_count) "
        "VALUES (?, ?, 'application/pdf', 1)",
        (draft_id, str(file_path)),
    )
    field_cur = db.execute(
        "INSERT INTO form_field (draft_id, label, format_code, required, "
        "description, bbox) VALUES (?, '이름', 'name', 1, '설명', '{}')",
        (draft_id,),
    )
    db.commit()
    field_id = field_cur.lastrowid
    db.execute(
        "INSERT INTO field_answer (form_field_id, value) VALUES (?, '홍길동')",
        (field_id,),
    )
    db.commit()

    res = cancel(client, draft_id)

    assert res.status_code == 200
    assert not file_path.exists()
    assert (
        db.execute(
            "SELECT COUNT(*) FROM document WHERE draft_id = ?", (draft_id,)
        ).fetchone()[0]
        == 0
    )
    assert (
        db.execute(
            "SELECT COUNT(*) FROM form_field WHERE draft_id = ?", (draft_id,)
        ).fetchone()[0]
        == 0
    )
    assert (
        db.execute(
            "SELECT COUNT(*) FROM field_answer WHERE form_field_id = ?", (field_id,)
        ).fetchone()[0]
        == 0
    )
    # 사전 정보는 다른 작성 건이 같이 쓰므로 지우지 않는다 (T3)
    assert db.execute("SELECT COUNT(*) FROM prior_info").fetchone()[0] > 0


# US-07 (권한): 다른 사용자의 작성 건은 취소할 수 없다
def test_us07_cancel_forbidden_for_other_users_draft(client, db):
    other_user_id = db.execute(
        "INSERT INTO user (google_sub, email, language) VALUES (?, ?, ?)",
        ("other-sub-0001", "other@example.com", "ko"),
    ).lastrowid
    db.commit()
    draft_id = insert_draft(db, other_user_id, "수정", "field_check")

    res = cancel(client, draft_id)

    assert res.status_code == 403
    assert res.json() == {"detail": {"code": "FORBIDDEN_DRAFT"}}


def test_us07_cancel_without_login_is_401(anon_client, db, seed_user_id):
    draft_id = insert_draft(db, seed_user_id, "수정", "field_check")

    res = cancel(anon_client, draft_id)

    assert res.status_code == 401
    assert res.json() == {"detail": {"code": "LOGIN_REQUIRED"}}
