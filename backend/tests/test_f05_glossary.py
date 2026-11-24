# F-05 기본 설명 조회·가린 문서 글자 조회 (WORD-EXPLAIN-API.md 항목 1·3). 가짜 데이터만 쓴다.
import pytest

from tests.conftest import insert_document, insert_draft

MASKED = (
    "@p1 0.12,0.34,0.30,0.04 | 성명: [이름]\n"
    "@p1 0.12,0.40,0.50,0.04 | 보호자 동의\n"
    "\n"
    "@p2 0.10,0.05,0.20,0.03 | 신청인 (서명 또는 인)"
)


def _other_user_id(db):
    cur = db.execute(
        "INSERT INTO user (google_sub, email, language) VALUES ('other-sub', 'o@example.com', 'vi')"
    )
    db.commit()
    return cur.lastrowid


# ── 항목 1: GET /api/glossary ──


def test_glossary_seed_is_loaded(db):
    from app.glossary_seed import SEED_GLOSSARY

    count = db.execute(
        "SELECT COUNT(*) FROM glossary_term WHERE language = 'vi'"
    ).fetchone()[0]
    assert count == len(SEED_GLOSSARY)


def test_glossary_found(client):
    res = client.get("/api/glossary", params={"term": "보호자"})
    assert res.status_code == 200
    body = res.json()
    assert body["found"] is True
    assert body["term"] == "보호자"
    assert body["source"] == "glossary"
    assert body["explanation"]


def test_glossary_trims_spaces_only(client):
    res = client.get("/api/glossary", params={"term": "  보호자  "})
    assert res.json()["found"] is True
    # 정확히 일치: 조사가 붙으면 찾지 않는다
    res = client.get("/api/glossary", params={"term": "보호자의"})
    assert res.status_code == 200
    assert res.json() == {"found": False, "term": "보호자의"}


def test_glossary_uses_user_language(client, db, seed_user_id):
    # 사용자 언어 설명이 없으면 사전에 없는 것과 같다
    db.execute("UPDATE user SET language = 'ko' WHERE id = ?", (seed_user_id,))
    db.commit()
    res = client.get("/api/glossary", params={"term": "보호자"})
    assert res.json() == {"found": False, "term": "보호자"}


@pytest.mark.parametrize("term", [None, "", "   "])
def test_glossary_term_required(client, term):
    params = {} if term is None else {"term": term}
    res = client.get("/api/glossary", params=params)
    assert res.status_code == 400
    assert res.json() == {"detail": {"code": "TERM_REQUIRED"}}


def test_glossary_term_too_long(client):
    assert client.get("/api/glossary", params={"term": "가" * 50}).status_code == 200
    res = client.get("/api/glossary", params={"term": "가" * 51})
    assert res.status_code == 400
    assert res.json() == {"detail": {"code": "TERM_TOO_LONG"}}


def test_glossary_requires_login(anon_client):
    res = anon_client.get("/api/glossary", params={"term": "보호자"})
    assert res.status_code == 401


def test_seed_rerun_updates_explanation(anon_client, db):
    # 시드가 사전의 출처: 다시 init_db 하면 바뀐 설명이 시드 값으로 돌아온다 (행이 늘지 않는다)
    from app import db as app_db
    from app.glossary_seed import SEED_GLOSSARY

    db.execute("UPDATE glossary_term SET explanation = 'old' WHERE term = '보호자'")
    db.commit()
    app_db.init_db()
    row = db.execute(
        "SELECT explanation FROM glossary_term WHERE term = '보호자'"
    ).fetchone()
    assert row["explanation"] != "old"
    assert db.execute("SELECT COUNT(*) FROM glossary_term").fetchone()[0] == len(
        SEED_GLOSSARY
    )


# ── 항목 3: GET /api/drafts/{id}/document/text ──


@pytest.mark.parametrize("step", ["field_check", "prior_info", "writing", "review"])
def test_document_text_lines(client, db, seed_user_id, step):
    draft_id = insert_draft(db, seed_user_id, "수정", step)
    insert_document(db, draft_id, masked_text=MASKED)
    res = client.get(f"/api/drafts/{draft_id}/document/text")
    assert res.status_code == 200
    assert res.json() == {
        "lines": [
            {
                "page": 1,
                "bbox": {"x": 0.12, "y": 0.34, "w": 0.30, "h": 0.04},
                "text": "성명: [이름]",
            },
            {
                "page": 1,
                "bbox": {"x": 0.12, "y": 0.40, "w": 0.50, "h": 0.04},
                "text": "보호자 동의",
            },
            {
                "page": 2,
                "bbox": {"x": 0.10, "y": 0.05, "w": 0.20, "h": 0.03},
                "text": "신청인 (서명 또는 인)",
            },
        ]
    }


def test_document_text_line_without_position(client, db, seed_user_id):
    draft_id = insert_draft(db, seed_user_id, "수정", "writing")
    insert_document(db, draft_id, masked_text="위치 없는 줄")
    res = client.get(f"/api/drafts/{draft_id}/document/text")
    assert res.json() == {
        "lines": [{"page": None, "bbox": None, "text": "위치 없는 줄"}]
    }


@pytest.mark.parametrize("masked", [None, "", "  \n "])
def test_document_text_not_ready(client, db, seed_user_id, masked):
    draft_id = insert_draft(db, seed_user_id, "수정", "field_check")
    insert_document(db, draft_id, masked_text=masked)
    res = client.get(f"/api/drafts/{draft_id}/document/text")
    assert res.status_code == 422
    assert res.json() == {"detail": {"code": "DOCUMENT_NOT_READY"}}


def test_document_text_no_document_row(client, db, seed_user_id):
    draft_id = insert_draft(db, seed_user_id, "수정", "field_check")
    res = client.get(f"/api/drafts/{draft_id}/document/text")
    assert res.status_code == 422


def test_document_text_step_invalid(client, db, seed_user_id):
    draft_id = insert_draft(db, seed_user_id, "수정", "upload")
    insert_document(db, draft_id, masked_text=MASKED)
    res = client.get(f"/api/drafts/{draft_id}/document/text")
    assert res.status_code == 409
    assert res.json() == {"detail": {"code": "DRAFT_STEP_INVALID"}}


@pytest.mark.parametrize("status", ["반려", "성공", "취소"])
def test_document_text_not_editable(client, db, seed_user_id, status):
    draft_id = insert_draft(db, seed_user_id, status, "writing")
    insert_document(db, draft_id, masked_text=MASKED)
    res = client.get(f"/api/drafts/{draft_id}/document/text")
    assert res.status_code == 409
    assert res.json() == {"detail": {"code": "DRAFT_NOT_EDITABLE"}}


def test_document_text_other_user(client, db):
    draft_id = insert_draft(db, _other_user_id(db), "수정", "writing")
    insert_document(db, draft_id, masked_text=MASKED)
    res = client.get(f"/api/drafts/{draft_id}/document/text")
    assert res.status_code == 403
    assert res.json() == {"detail": {"code": "FORBIDDEN_DRAFT"}}


def test_document_text_not_found(client):
    res = client.get("/api/drafts/9999/document/text")
    assert res.status_code == 404
    assert res.json() == {"detail": {"code": "DRAFT_NOT_FOUND"}}


def test_document_text_requires_login(anon_client):
    assert anon_client.get("/api/drafts/1/document/text").status_code == 401
