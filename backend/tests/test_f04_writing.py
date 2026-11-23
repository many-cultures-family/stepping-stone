# F-04 가상 작성: 칸 정보 조회·작성 시작 (VIRTUAL-FORM-API.md 항목 1·2) + 원본 페이지 이미지(명세에 없음)
# 모든 값은 가짜 데이터다.
import pytest
from conftest import (
    FIXTURES_DIR,
    SEED_USERINFO,
    insert_document,
    insert_draft,
    insert_form_field,
)

BBOX = {"page": 1, "x": 0.1, "y": 0.2, "w": 0.3, "h": 0.04}


def form(client, draft_id):
    return client.get(f"/api/drafts/{draft_id}/form")


def start(client, draft_id):
    return client.post(f"/api/drafts/{draft_id}/writing:start")


def page(client, draft_id, n=1):
    return client.get(f"/api/drafts/{draft_id}/document/pages/{n}")


# 항목 1 (정상): 값 없이 칸 정보·형식 규칙(pattern)·위치(bbox)를 준다
def test_f04_form_returns_fields_with_pattern_and_bbox(client, db, seed_user_id):
    draft_id = insert_draft(db, seed_user_id, "수정", "writing")
    insert_document(db, draft_id, masked_text="x", page_count=2)
    phone_id = insert_form_field(
        db,
        draft_id,
        label="휴대전화",
        format_code="phone",
        prior_info_key="phone",
        bbox=BBOX,
    )
    sign_id = insert_form_field(
        db, draft_id, label="신청인 서명", format_code="signature", bbox=BBOX
    )
    choice_id = insert_form_field(
        db,
        draft_id,
        label="성별",
        format_code="choice",
        options=["남", "여"],
        bbox=BBOX,
    )

    res = form(client, draft_id)

    assert res.status_code == 200
    body = res.json()
    assert body["draft"] == {"id": draft_id, "status": "수정", "step": "writing"}
    assert body["document"] == {"page_count": 2}
    by_id = {f["field_id"]: f for f in body["fields"]}
    assert by_id[phone_id] == {
        "field_id": phone_id,
        "label": "휴대전화",
        "format_code": "phone",
        "format_label": "전화번호",
        "format_example": "010-0000-0000",
        "pattern": r"^010-\d{4}-\d{4}$",
        "required": True,
        "prior_info_key": "phone",
        "description": "설명",
        "options": None,
        "bbox": BBOX,
        # 원본 파일이 없으면 적는 자리를 못 찾는다 (layout.py, test_layout.py에서 따로 확인)
        "input_bbox": None,
        "option_bboxes": None,
        "part_bboxes": None,
    }
    assert by_id[sign_id]["pattern"] is None
    assert by_id[sign_id]["format_label"] == "서명"
    assert by_id[choice_id]["options"] == ["남", "여"]
    # 값·불일치는 서버에 없다 (no-server-storage-user-input.md)
    assert "value" not in by_id[phone_id] and "mismatch" not in by_id[phone_id]


def test_f04_form_allowed_in_review(client, db, seed_user_id):
    draft_id = insert_draft(db, seed_user_id, "수정", "review")
    insert_document(db, draft_id)
    assert form(client, draft_id).status_code == 200


@pytest.mark.parametrize(
    ("status", "step", "code"),
    [
        ("수정", "prior_info", "DRAFT_STEP_INVALID"),
        ("수정", "field_check", "DRAFT_STEP_INVALID"),
        ("반려", "writing", "DRAFT_NOT_EDITABLE"),
        ("성공", "review", "DRAFT_NOT_EDITABLE"),
    ],
)
def test_f04_form_wrong_state_is_409(client, db, seed_user_id, status, step, code):
    draft_id = insert_draft(db, seed_user_id, status, step)
    res = form(client, draft_id)
    assert res.status_code == 409
    assert res.json() == {"detail": {"code": code}}


def test_f04_form_other_user_is_403(anon_client, login, db, seed_user_id):
    draft_id = insert_draft(db, seed_user_id, "수정", "writing")
    other = {**SEED_USERINFO, "sub": "test-sub-other", "email": "other@example.com"}
    login(anon_client, userinfo=other)
    assert form(anon_client, draft_id).status_code == 403


def test_f04_form_without_login_is_401(anon_client, db, seed_user_id):
    draft_id = insert_draft(db, seed_user_id, "수정", "writing")
    res = form(anon_client, draft_id)
    assert res.status_code == 401
    assert res.json() == {"detail": {"code": "LOGIN_REQUIRED"}}


# 항목 2 (정상): prior_info → writing
def test_f04_start_writing_moves_step(client, db, seed_user_id):
    draft_id = insert_draft(db, seed_user_id, "수정", "prior_info")

    res = start(client, draft_id)

    assert res.status_code == 200
    assert res.json() == {
        "draft": {"id": draft_id, "status": "수정", "step": "writing"}
    }
    row = db.execute("SELECT step FROM draft WHERE id = ?", (draft_id,)).fetchone()
    assert row["step"] == "writing"


@pytest.mark.parametrize(
    ("status", "step", "code"),
    [
        ("수정", "writing", "DRAFT_STEP_INVALID"),
        ("수정", "field_check", "DRAFT_STEP_INVALID"),
        ("반려", "prior_info", "DRAFT_NOT_EDITABLE"),
    ],
)
def test_f04_start_writing_wrong_state_is_409(
    client, db, seed_user_id, status, step, code
):
    draft_id = insert_draft(db, seed_user_id, status, step)
    res = start(client, draft_id)
    assert res.status_code == 409
    assert res.json() == {"detail": {"code": code}}


def test_f04_start_writing_missing_is_404(client):
    assert start(client, 99999).status_code == 404


# 원본 페이지 이미지 (명세에 없음): PDF는 PNG로 그려 주고, 이미지는 원본 그대로
def test_page_image_renders_pdf_page_as_png(client, db, seed_user_id, upload_dir):
    upload_dir.mkdir(parents=True, exist_ok=True)
    pdf = upload_dir / "a.pdf"
    pdf.write_bytes((FIXTURES_DIR / "blank_1page.pdf").read_bytes())
    draft_id = insert_draft(db, seed_user_id, "수정", "writing")
    insert_document(db, draft_id, file_path=str(pdf), mime_type="application/pdf")

    res = page(client, draft_id, 1)

    assert res.status_code == 200
    assert res.headers["content-type"] == "image/png"
    assert res.headers["cache-control"] == "no-store"
    assert res.content.startswith(b"\x89PNG\r\n\x1a\n")


def test_page_image_returns_original_image(client, db, seed_user_id, upload_dir):
    upload_dir.mkdir(parents=True, exist_ok=True)
    png = upload_dir / "a.png"
    data = (FIXTURES_DIR / "blank_1x1.png").read_bytes()
    png.write_bytes(data)
    draft_id = insert_draft(db, seed_user_id, "수정", "field_check")
    insert_document(db, draft_id, file_path=str(png), mime_type="image/png")

    res = page(client, draft_id, 1)

    assert res.status_code == 200
    assert res.content == data


@pytest.mark.parametrize("n", [0, 2])
def test_page_image_out_of_range_is_404(client, db, seed_user_id, n):
    draft_id = insert_draft(db, seed_user_id, "수정", "writing")
    insert_document(db, draft_id)
    res = page(client, draft_id, n)
    assert res.status_code == 404
    assert res.json() == {"detail": {"code": "PAGE_NOT_FOUND"}}


def test_page_image_canceled_draft_is_404(client, db, seed_user_id):
    draft_id = insert_draft(db, seed_user_id, "취소", "writing")
    res = page(client, draft_id, 1)
    assert res.status_code == 404
    assert res.json() == {"detail": {"code": "DOCUMENT_NOT_FOUND"}}


def test_page_image_other_user_is_403(anon_client, login, db, seed_user_id):
    draft_id = insert_draft(db, seed_user_id, "수정", "writing")
    insert_document(db, draft_id)
    other = {**SEED_USERINFO, "sub": "test-sub-other", "email": "other@example.com"}
    login(anon_client, userinfo=other)
    assert page(anon_client, draft_id).status_code == 403
