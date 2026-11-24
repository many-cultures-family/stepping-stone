# US-01 반려 건 다시 올리기: POST /api/drafts/{id}/document:reupload [제안 — 명세 없음]
# 03 3-2 "반려 → 수정: 사용자 재업로드", DATA-MODEL.md document.draft_id "재업로드는 이전 파일·입력 항목을 지우고 교체"
from pathlib import Path

from conftest import (
    FIXTURES_DIR,
    count_rows,
    insert_document,
    insert_draft,
    insert_form_field,
)

PDF_BYTES = (FIXTURES_DIR / "blank_1page.pdf").read_bytes()
PNG_BYTES = (FIXTURES_DIR / "blank_1x1.png").read_bytes()
OTHER_USERINFO = {
    "sub": "other-sub-0002",
    "email": "other@example.com",
    "email_verified": True,
}


def path(draft_id):
    return f"/api/drafts/{draft_id}/document:reupload"


def reupload(client, draft_id, data=PNG_BYTES, name="new.png", ctype="image/png"):
    return client.post(path(draft_id), files={"file": (name, data, ctype)})


def rejected_draft(db, user_id, upload_dir, reason="OCR_FAILED"):
    """반려된 작성 건 + 실제로 있는 이전 원본 파일 + 이전 문서로 만든 입력 항목."""
    upload_dir.mkdir(parents=True, exist_ok=True)
    old_file = upload_dir / "old.pdf"
    old_file.write_bytes(PDF_BYTES)
    draft_id = insert_draft(
        db,
        user_id,
        "반려",
        "upload",
        reject_reason=reason,
        reanalysis_count=2,
    )
    insert_document(
        db,
        draft_id,
        masked_text="@p1 0.10,0.10,0.20,0.02 | 성명: [이름]",
        file_path=str(old_file),
        empty_pages="[]",
    )
    insert_form_field(db, draft_id, label="성명")
    return draft_id, old_file


def test_us01_reupload_rejected_draft_replaces_document(
    client, db, seed_user_id, upload_dir
):
    draft_id, old_file = rejected_draft(db, seed_user_id, upload_dir)

    res = reupload(client, draft_id)

    assert res.status_code == 200
    assert res.json() == {
        "draft": {"id": draft_id, "status": "수정", "step": "upload"},
        "document": {"mime_type": "image/png", "page_count": 1},
    }
    draft = db.execute("SELECT * FROM draft WHERE id = ?", (draft_id,)).fetchone()
    assert (draft["status"], draft["step"], draft["reject_reason"]) == (
        "수정",
        "upload",
        None,
    )
    # 재분석 횟수는 작성 건의 사용 한도라 되돌리지 않는다
    assert draft["reanalysis_count"] == 2
    doc = db.execute(
        "SELECT * FROM document WHERE draft_id = ?", (draft_id,)
    ).fetchone()
    assert doc["mime_type"] == "image/png"
    assert doc["masked_text"] is None and doc["empty_pages"] is None
    assert doc["file_path"] != str(old_file)
    # 새 파일은 저장되고 이전 원본은 지워진다 (R8)
    assert Path(doc["file_path"]).read_bytes() == PNG_BYTES
    assert not old_file.exists()
    assert count_rows(db, "document") == 1
    # 이전 문서로 만든 입력 항목은 지운다
    assert (
        db.execute(
            "SELECT COUNT(*) FROM form_field WHERE draft_id = ?", (draft_id,)
        ).fetchone()[0]
        == 0
    )


def test_us01_reupload_then_recognize_runs_again(
    client, db, seed_user_id, upload_dir, monkeypatch
):
    """다시 올린 뒤에는 document:recognize가 처음부터 다시 돈다 (step upload, status 수정)."""
    from app import ocr
    from app.privacy import OcrLine

    draft_id, _ = rejected_draft(db, seed_user_id, upload_dir, reason="PII_REMAINING")
    assert reupload(client, draft_id).status_code == 200

    seen = {}

    def fake_recognize(file_path, mime_type):
        seen["mime_type"] = mime_type
        line = OcrLine(
            text="신청서", page=1, bbox={"x": 0.1, "y": 0.1, "w": 0.2, "h": 0.02}
        )
        return [line], []

    monkeypatch.setattr(ocr, "recognize", fake_recognize)
    res = client.post(f"/api/drafts/{draft_id}/document:recognize")

    assert res.status_code == 200
    assert res.json()["draft"] == {
        "id": draft_id,
        "status": "수정",
        "step": "field_check",
    }
    assert seen["mime_type"] == "image/png"


def test_us01_reupload_not_rejected_is_409(client, db, seed_user_id, upload_dir):
    for status, step in [
        ("수정", "upload"),
        ("수정", "writing"),
        ("성공", "review"),
        ("취소", "upload"),
    ]:
        draft_id = insert_draft(db, seed_user_id, status, step)
        insert_document(db, draft_id)

        res = reupload(client, draft_id)

        assert res.status_code == 409, status
        assert res.json() == {"detail": {"code": "DRAFT_NOT_REJECTED"}}
        row = db.execute(
            "SELECT status, step FROM draft WHERE id = ?", (draft_id,)
        ).fetchone()
        assert (row["status"], row["step"]) == (status, step)
    # 거절하면 파일을 저장하지 않는다
    assert not upload_dir.exists() or list(upload_dir.iterdir()) == []


def test_us01_reupload_other_users_draft_is_403(
    anon_client, login, db, seed_user_id, upload_dir
):
    draft_id, old_file = rejected_draft(db, seed_user_id, upload_dir)
    login(anon_client, userinfo=OTHER_USERINFO)

    res = reupload(anon_client, draft_id)

    assert res.status_code == 403
    assert res.json() == {"detail": {"code": "FORBIDDEN_DRAFT"}}
    row = db.execute("SELECT status FROM draft WHERE id = ?", (draft_id,)).fetchone()
    assert row["status"] == "반려"
    assert old_file.exists()
    assert [p.name for p in upload_dir.iterdir()] == ["old.pdf"]


def test_us01_reupload_requires_login(anon_client, db, seed_user_id, upload_dir):
    draft_id, _ = rejected_draft(db, seed_user_id, upload_dir)
    res = reupload(anon_client, draft_id)
    assert res.status_code == 401
    assert res.json() == {"detail": {"code": "LOGIN_REQUIRED"}}


def test_us01_reupload_missing_draft_is_404(client):
    res = reupload(client, 9999)
    assert res.status_code == 404
    assert res.json() == {"detail": {"code": "DRAFT_NOT_FOUND"}}


def test_us01_reupload_file_checks_same_as_upload(client, db, seed_user_id, upload_dir):
    draft_id, old_file = rejected_draft(db, seed_user_id, upload_dir)

    no_file = client.post(path(draft_id))
    assert no_file.status_code == 400
    assert no_file.json() == {"detail": {"code": "FILE_REQUIRED"}}

    bad_type = reupload(
        client, draft_id, data="가짜 텍스트".encode(), name="a.txt", ctype="text/plain"
    )
    assert bad_type.status_code == 415
    assert bad_type.json() == {"detail": {"code": "FILE_TYPE_NOT_ALLOWED"}}

    # 실패하면 작성 건·이전 파일은 그대로
    row = db.execute("SELECT status FROM draft WHERE id = ?", (draft_id,)).fetchone()
    assert row["status"] == "반려"
    assert old_file.exists()
    assert [p.name for p in upload_dir.iterdir()] == ["old.pdf"]
