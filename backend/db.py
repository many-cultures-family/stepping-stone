# SQLite 연결과 테이블. 필드 이름은 docs/DATA-MODEL.md와 똑같이 쓴다.
import os
import sqlite3
from pathlib import Path

BACKEND_DIR = Path(__file__).resolve().parent

# 로그인(US-01 #4) 전까지 모든 작성 건의 주인으로 쓰는 시드 사용자 (DATA-MODEL 시드 2번, 가짜 값)
SEED_GOOGLE_SUB = "test-sub-0001"
SEED_EMAIL = "tester@example.com"
SEED_LANGUAGE = "vi"

SCHEMA = """
CREATE TABLE IF NOT EXISTS user (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    google_sub TEXT NOT NULL UNIQUE,
    email TEXT NOT NULL,
    language TEXT NOT NULL,
    created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE TABLE IF NOT EXISTS draft (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id INTEGER NOT NULL REFERENCES user(id),
    status TEXT NOT NULL,
    step TEXT NOT NULL,
    fields_confirmed_at TEXT,
    reanalysis_count INTEGER NOT NULL DEFAULT 0,
    reject_reason TEXT,
    submitted_at TEXT
);
CREATE TABLE IF NOT EXISTS document (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    draft_id INTEGER NOT NULL UNIQUE REFERENCES draft(id),
    file_path TEXT NOT NULL,
    mime_type TEXT NOT NULL,
    masked_text TEXT,
    page_count INTEGER NOT NULL,
    empty_pages TEXT
);
"""


def get_db_path():
    # 호출할 때마다 읽어서 테스트가 임시 경로로 바꿀 수 있게 한다
    return os.environ.get("DATABASE_PATH", str(BACKEND_DIR / "didimdol.db"))


def connect():
    conn = sqlite3.connect(get_db_path())
    conn.row_factory = sqlite3.Row
    conn.execute("PRAGMA foreign_keys = ON")
    return conn


def init_db():
    conn = connect()
    try:
        conn.executescript(SCHEMA)
        conn.execute(
            "INSERT OR IGNORE INTO user (google_sub, email, language) VALUES (?, ?, ?)",
            (SEED_GOOGLE_SUB, SEED_EMAIL, SEED_LANGUAGE),
        )
        conn.commit()
    finally:
        conn.close()


def get_seed_user_id(conn):
    row = conn.execute(
        "SELECT id FROM user WHERE google_sub = ?", (SEED_GOOGLE_SUB,)
    ).fetchone()
    return row["id"]
