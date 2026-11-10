# SQLite 연결과 테이블. 필드 이름은 docs/DATA-MODEL.md와 똑같이 쓴다.
import os
import sqlite3
from pathlib import Path

BACKEND_DIR = Path(__file__).resolve().parent.parent

# 테스트·시연용 시드 사용자 (DATA-MODEL 시드 2번, 가짜 값). 테스트는 이 google_sub로 로그인한다
SEED_GOOGLE_SUB = "test-sub-0001"
SEED_EMAIL = "tester@example.com"
SEED_LANGUAGE = "vi"

# input_format 허용 목록 중 서버가 미리 채워 두는 예시 (DATA-MODEL.md 시드 데이터 1번)
SEED_INPUT_FORMATS = [
    ("phone", "전화번호", r"^010-\d{4}-\d{4}$", "010-0000-0000"),
    ("date", "날짜", r"^\d{4}\.\d{2}\.\d{2}$", "YYYY.MM.DD"),
    ("name", "이름", r"^.{1,50}$", "홍길동"),
    ("long_text", "서술형", None, "자유롭게 작성"),
]

# 시드 사용자의 사전 정보 (DATA-MODEL.md 시드 데이터 2번, 가짜 값)
SEED_PRIOR_INFO = [
    ("name", "name", "테스트 사용자"),
    ("birth_date", "date", "1990.01.01"),
    ("phone", "phone", "010-0000-1234"),
]

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
CREATE TABLE IF NOT EXISTS input_format (
    code TEXT PRIMARY KEY,
    label TEXT NOT NULL,
    pattern TEXT,
    example TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS prior_info (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id INTEGER NOT NULL REFERENCES user(id),
    info_key TEXT NOT NULL,
    format_code TEXT NOT NULL REFERENCES input_format(code),
    value TEXT NOT NULL,
    updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
    UNIQUE (user_id, info_key)
);
CREATE TABLE IF NOT EXISTS form_field (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    draft_id INTEGER NOT NULL REFERENCES draft(id),
    label TEXT NOT NULL,
    format_code TEXT,
    required INTEGER,
    prior_info_key TEXT,
    description TEXT NOT NULL,
    guide_text TEXT,
    options TEXT,
    bbox TEXT NOT NULL,
    flagged_wrong INTEGER NOT NULL DEFAULT 0
);
CREATE TABLE IF NOT EXISTS field_answer (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    form_field_id INTEGER NOT NULL UNIQUE REFERENCES form_field(id),
    value TEXT,
    mismatch_acknowledged INTEGER NOT NULL DEFAULT 0
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
        conn.executemany(
            "INSERT OR IGNORE INTO input_format (code, label, pattern, example) "
            "VALUES (?, ?, ?, ?)",
            SEED_INPUT_FORMATS,
        )
        # get_seed_user_id는 로그인(PR #17)이 들어오며 지워졌다. 시드 사용자 id는
        # 여기서만 필요하므로 바로 조회한다
        seed_user = conn.execute(
            "SELECT id FROM user WHERE google_sub = ?", (SEED_GOOGLE_SUB,)
        ).fetchone()
        conn.executemany(
            "INSERT OR IGNORE INTO prior_info (user_id, info_key, format_code, value) "
            "VALUES (?, ?, ?, ?)",
            [
                (seed_user["id"], key, fmt, value)
                for key, fmt, value in SEED_PRIOR_INFO
            ],
        )
        conn.commit()
    finally:
        conn.close()


def to_iso_z(value):
    # SQLite CURRENT_TIMESTAMP는 "YYYY-MM-DD HH:MM:SS"(UTC, 표기 없음)로 저장된다.
    # 응답에서는 ISO 8601 + Z로 바꾼다 (API 문서 공통 규칙)
    if value is None:
        return None
    return value.replace(" ", "T") + "Z"
