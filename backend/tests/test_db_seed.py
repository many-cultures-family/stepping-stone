import sqlite3

import pytest
from conftest import insert_draft

from app import db as app_db

# input_format은 R2 허용 목록의 단일 출처다 (F-02 리뷰 — 허용 목록이 코드 상수와
# DB에 각각 있으면 어긋난다). 10종이 모두 채워져 있는지 고정해 둔다 (signature는 2026-11-23 추가).
ALLOWED_FORMAT_CODES = {
    "signature",
    "phone",
    "date",
    "email",
    "number",
    "name",
    "address",
    "short_text",
    "long_text",
    "choice",
}


def test_input_format_seed_covers_all_allowed_codes(db):
    rows = db.execute("SELECT code, label, example FROM input_format").fetchall()
    codes = {row["code"] for row in rows}

    assert codes == ALLOWED_FORMAT_CODES
    for row in rows:
        assert row["label"]
        assert row["example"]


# draft 누적 횟수·검토 기록 (REVIEW-PRIVACY-API.md 항목 3, WORD-EXPLAIN-API.md 항목 2)
def test_new_draft_starts_with_zero_counts(db, seed_user_id):
    draft_id = insert_draft(db, seed_user_id, "수정", "field_check")
    row = db.execute(
        "SELECT review_count, reviewed_at, explanation_count FROM draft WHERE id = ?",
        (draft_id,),
    ).fetchone()

    assert row["review_count"] == 0
    assert row["reviewed_at"] is None
    assert row["explanation_count"] == 0


def test_init_db_adds_missing_draft_columns_to_existing_db(tmp_path, monkeypatch):
    """이미 만들어진 로컬 DB(칸 추가 전 draft)에도 새 칸을 채운다. 기존 행은 0·빈 값이 된다."""
    path = tmp_path / "old.db"
    old = sqlite3.connect(path)
    old.executescript(
        """
        CREATE TABLE user (id INTEGER PRIMARY KEY AUTOINCREMENT, google_sub TEXT NOT NULL UNIQUE,
            email TEXT NOT NULL, language TEXT NOT NULL,
            created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP);
        CREATE TABLE draft (id INTEGER PRIMARY KEY AUTOINCREMENT,
            user_id INTEGER NOT NULL REFERENCES user(id), status TEXT NOT NULL, step TEXT NOT NULL,
            fields_confirmed_at TEXT, reanalysis_count INTEGER NOT NULL DEFAULT 0,
            reject_reason TEXT, submitted_at TEXT);
        INSERT INTO user (google_sub, email, language) VALUES ('old-sub', 'old@example.com', 'vi');
        INSERT INTO draft (user_id, status, step) VALUES (1, '수정', 'upload');
        """
    )
    old.commit()
    old.close()
    monkeypatch.setenv("DATABASE_PATH", str(path))

    app_db.init_db()
    app_db.init_db()  # 두 번 불러도 칸을 다시 더하다 실패하지 않는다

    conn = app_db.connect()
    try:
        row = conn.execute(
            "SELECT review_count, reviewed_at, explanation_count FROM draft"
        ).fetchone()
    finally:
        conn.close()
    assert (row["review_count"], row["reviewed_at"], row["explanation_count"]) == (
        0,
        None,
        0,
    )


# 용어 사전·쉬운 풀이 (DATA-MODEL.md 75~82행, F-05)
def test_glossary_term_is_unique_per_term_and_language(db):
    db.execute(
        "INSERT INTO glossary_term (term, language, explanation) VALUES (?, ?, ?)",
        ("수강료", "vi", "설명"),
    )
    db.execute(
        "INSERT INTO glossary_term (term, language, explanation) VALUES (?, ?, ?)",
        ("수강료", "en", "설명"),
    )
    with pytest.raises(sqlite3.IntegrityError):
        db.execute(
            "INSERT INTO glossary_term (term, language, explanation) VALUES (?, ?, ?)",
            ("수강료", "vi", "다른 설명"),
        )


def test_easy_explanation_links_glossary_and_is_unique(db):
    db.execute("PRAGMA foreign_keys = ON")
    term_id = db.execute(
        "INSERT INTO glossary_term (term, language, explanation) VALUES (?, ?, ?)",
        ("감면", "vi", "설명"),
    ).lastrowid
    db.execute(
        "INSERT INTO easy_explanation (selected_text, glossary_term_id, language, explanation) "
        "VALUES (?, ?, ?, ?)",
        ("감면", term_id, "vi", "AI 풀이"),
    )
    # 사전에 없는 단어는 glossary_term_id를 비운다
    db.execute(
        "INSERT INTO easy_explanation (selected_text, language, explanation) VALUES (?, ?, ?)",
        ("수강료 감면 대상", "vi", "AI 풀이"),
    )
    rows = db.execute(
        "SELECT selected_text, glossary_term_id, request_count FROM easy_explanation ORDER BY id"
    ).fetchall()

    assert [tuple(r) for r in rows] == [
        ("감면", term_id, 1),
        ("수강료 감면 대상", None, 1),
    ]
    with pytest.raises(sqlite3.IntegrityError):
        db.execute(
            "INSERT INTO easy_explanation (selected_text, language, explanation) VALUES (?, ?, ?)",
            ("감면", "vi", "다시 만든 풀이"),
        )
    with pytest.raises(sqlite3.IntegrityError):
        db.execute(
            "INSERT INTO easy_explanation (selected_text, glossary_term_id, language, explanation) "
            "VALUES (?, ?, ?, ?)",
            ("없는 단어", 9999, "vi", "AI 풀이"),
        )
