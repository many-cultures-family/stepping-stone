# US-01 #2·#3·#4: 문서 인식·개인정보 가림 (OCR-API.md 항목 1)
# OCR 엔진은 부르지 않고 ocr.recognize를 가짜로 바꾼다. 모든 값은 가짜 데이터다.
import json
import logging

import pytest
from conftest import SEED_USERINFO, insert_document, insert_draft

from app import ocr
from app.privacy import OcrLine

FAKE_NAME = "홍길동"
FAKE_PHONE = "010-0000-1234"


def recognize(client, draft_id):
    return client.post(f"/api/drafts/{draft_id}/document:recognize")


def line(text, y, page=1):
    return OcrLine(text=text, page=page, bbox={"x": 0.1, "y": y, "w": 0.3, "h": 0.02})


@pytest.fixture
def fake_ocr(monkeypatch):
    """ocr.recognize가 돌려줄 (줄 목록, empty_pages)을 정한다."""
    state = {"lines": [], "empty_pages": [], "error": False, "calls": 0}

    def _recognize(file_path, mime_type):
        state["calls"] += 1
        if state["error"]:
            raise ocr.OcrError("PdfError")
        return [OcrLine(l.text, l.page, dict(l.bbox)) for l in state["lines"]], state[
            "empty_pages"
        ]

    monkeypatch.setattr(ocr, "recognize", _recognize)
    return state


@pytest.fixture
def uploaded(db, seed_user_id):
    draft_id = insert_draft(db, seed_user_id, "수정", "upload")
    insert_document(db, draft_id, masked_text=None)
    return draft_id


def draft_row(db, draft_id):
    return db.execute(
        "SELECT status, step, reject_reason FROM draft WHERE id = ?", (draft_id,)
    ).fetchone()


def document_row(db, draft_id):
    return db.execute(
        "SELECT masked_text, empty_pages FROM document WHERE draft_id = ?", (draft_id,)
    ).fetchone()


# US-01 #2 (정상): 인식하고 가린 텍스트만 저장, step upload → field_check
def test_us01_recognize_saves_masked_text_and_moves_to_field_check(
    client, db, uploaded, fake_ocr
):
    fake_ocr["lines"] = [
        line("보육료 지원 신청서", 0.05),
        line(f"성명(한글) {FAKE_NAME}", 0.15),
        line(f"휴대전화 {FAKE_PHONE}", 0.37),
        line("신청일 2026-11-23", 0.11),
    ]

    res = recognize(client, uploaded)

    assert res.status_code == 200
    assert res.json() == {
        "draft": {"id": uploaded, "status": "수정", "step": "field_check"},
        "document": {"page_count": 1, "empty_pages": []},
    }
    row = draft_row(db, uploaded)
    assert (row["status"], row["step"], row["reject_reason"]) == (
        "수정",
        "field_check",
        None,
    )
    doc = document_row(db, uploaded)
    assert doc["masked_text"] == (
        "@p1 0.10,0.05,0.30,0.02 | 보육료 지원 신청서\n"
        "@p1 0.10,0.15,0.30,0.02 | 성명(한글) [이름]\n"
        "@p1 0.10,0.37,0.30,0.02 | 휴대전화 [전화번호]\n"
        "@p1 0.10,0.11,0.30,0.02 | 신청일 2026-11-23"
    )
    assert json.loads(doc["empty_pages"]) == []


# R8: 가리기 전 원문은 DB·응답·로그 어디에도 남지 않는다
def test_r8_raw_text_not_stored_or_logged(client, db, uploaded, fake_ocr, caplog):
    fake_ocr["lines"] = [
        line(f"성명 {FAKE_NAME}", 0.1),
        line(f"전화 {FAKE_PHONE}", 0.2),
    ]

    with caplog.at_level(logging.DEBUG):
        res = recognize(client, uploaded)

    assert res.status_code == 200
    dump = json.dumps(
        [dict(r) for r in db.execute("SELECT * FROM document")], ensure_ascii=False
    )
    for raw in (FAKE_NAME, FAKE_PHONE):
        assert raw not in dump
        assert raw not in res.text
        assert raw not in caplog.text


# OCR 오인식(2026-11-23 EasyOCR 실측)도 가린 뒤 저장한다
def test_us01_ocr_misread_values_are_masked(client, db, uploaded, fake_ocr):
    fake_ocr["lines"] = [
        line("휴대전화 O1O-0000-1234", 0.1),
        line("이메일 test user@example com", 0.2),
        line("생년원일 1990.0101", 0.3),
    ]

    res = recognize(client, uploaded)

    assert res.json()["draft"]["step"] == "field_check"
    masked = document_row(db, uploaded)["masked_text"]
    assert "O1O" not in masked and "example" not in masked and "1990" not in masked


@pytest.mark.parametrize(
    ("setup", "reason"),
    [
        pytest.param({"lines": []}, "OCR_FAILED", id="no-text"),
        pytest.param({"lines": [line("   ", 0.1)]}, "OCR_FAILED", id="blank-text"),
        pytest.param({"error": True}, "OCR_FAILED", id="engine-error"),
        pytest.param(
            {"lines": [line("보육료 지원 신청서", 0.1)], "empty_pages": [2]},
            "PAGE_MISSING",
            id="empty-page",
        ),
    ],
)
# US-01 #3·#4 (실패): 수정 → 반려, reject_reason 기록, masked_text 저장 안 함
def test_us01_recognize_failure_rejects_draft(
    client, db, uploaded, fake_ocr, setup, reason
):
    fake_ocr.update(setup)

    res = recognize(client, uploaded)

    assert res.status_code == 200
    assert res.json() == {
        "draft": {
            "id": uploaded,
            "status": "반려",
            "step": "upload",
            "reject_reason": reason,
        }
    }
    row = draft_row(db, uploaded)
    assert (row["status"], row["step"], row["reject_reason"]) == (
        "반려",
        "upload",
        reason,
    )
    assert document_row(db, uploaded)["masked_text"] is None


# US-01 #3: 가린 뒤에도 개인정보가 남으면(residual) 반려 — 마스킹 결과를 가짜로 바꿔 확인한다
def test_us01_pii_remaining_rejects_draft(client, db, uploaded, fake_ocr, monkeypatch):
    from app import privacy

    fake_ocr["lines"] = [line(f"성명 {FAKE_NAME}", 0.1)]
    monkeypatch.setattr(
        privacy,
        "mask_ocr_lines",
        lambda lines: privacy.MaskResult(lines=lines, residual=True),
    )

    res = recognize(client, uploaded)

    assert res.json()["draft"]["reject_reason"] == "PII_REMAINING"
    assert draft_row(db, uploaded)["status"] == "반려"
    assert document_row(db, uploaded)["masked_text"] is None


@pytest.mark.parametrize(
    ("status", "step", "code"),
    [
        ("수정", "field_check", "DRAFT_STEP_INVALID"),
        ("반려", "upload", "DRAFT_NOT_EDITABLE"),
        ("취소", "upload", "DRAFT_NOT_EDITABLE"),
    ],
)
def test_us01_recognize_wrong_state_is_409(
    client, db, seed_user_id, fake_ocr, status, step, code
):
    draft_id = insert_draft(db, seed_user_id, status, step)
    insert_document(db, draft_id, masked_text=None)

    res = recognize(client, draft_id)

    assert res.status_code == 409
    assert res.json() == {"detail": {"code": code}}
    assert fake_ocr["calls"] == 0


# 두 번 부르면 두 번째는 이미 field_check라 409, OCR을 다시 돌리지 않는다
def test_us01_recognize_twice_is_409(client, uploaded, fake_ocr):
    fake_ocr["lines"] = [line("보육료 지원 신청서", 0.1)]
    assert recognize(client, uploaded).status_code == 200

    res = recognize(client, uploaded)

    assert res.status_code == 409
    assert fake_ocr["calls"] == 1


def test_us01_recognize_missing_draft_is_404(client, fake_ocr):
    res = recognize(client, 99999)
    assert res.status_code == 404
    assert res.json() == {"detail": {"code": "DRAFT_NOT_FOUND"}}


# US-01 권한: 올린 본인만
def test_us01_recognize_other_users_draft_is_403(
    anon_client, login, db, uploaded, fake_ocr
):
    other = {**SEED_USERINFO, "sub": "test-sub-other", "email": "other@example.com"}
    assert login(anon_client, userinfo=other).status_code == 302

    res = recognize(anon_client, uploaded)

    assert res.status_code == 403
    assert res.json() == {"detail": {"code": "FORBIDDEN_DRAFT"}}
    assert fake_ocr["calls"] == 0


def test_us01_recognize_without_login_is_401(anon_client, uploaded, fake_ocr):
    res = recognize(anon_client, uploaded)
    assert res.status_code == 401
    assert res.json() == {"detail": {"code": "LOGIN_REQUIRED"}}
