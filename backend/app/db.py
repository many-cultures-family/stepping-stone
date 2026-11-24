# SQLite 연결과 테이블. 필드 이름은 docs/DATA-MODEL.md와 똑같이 쓴다.
import os
import sqlite3
from pathlib import Path

from app.glossary_seed import GLOSSARY_LANGUAGE, SEED_GLOSSARY

BACKEND_DIR = Path(__file__).resolve().parent.parent

# 테스트·시연용 시드 사용자 (DATA-MODEL 시드 2번, 가짜 값). 테스트는 이 google_sub로 로그인한다
SEED_GOOGLE_SUB = "test-sub-0001"
SEED_EMAIL = "tester@example.com"
SEED_LANGUAGE = "vi"

# input_format = R2 허용 목록의 단일 출처. DATA-MODEL.md의 9종을 모두 채운다
# (F-02 리뷰 — 허용 목록을 코드 상수와 DB에 각각 두면 어긋난다. 이 테이블이 유일한 출처다)
SEED_INPUT_FORMATS = [
    ("phone", "전화번호", r"^010-\d{4}-\d{4}$", "010-0000-0000"),
    ("date", "날짜", r"^\d{4}\.\d{2}\.\d{2}$", "YYYY.MM.DD"),
    ("email", "이메일", r"^[^@\s]+@[^@\s]+\.[^@\s]+$", "example@email.com"),
    ("number", "숫자", r"^\d+$", "123"),
    ("name", "이름", r"^.{1,50}$", "홍길동"),
    ("address", "주소", r"^.{1,200}$", "○○시 ○○구 ○○로 00"),
    ("short_text", "짧은 글", r"^.{1,100}$", "간단히 입력"),
    ("long_text", "서술형", None, "자유롭게 작성"),
    ("choice", "선택형", None, "보기 중 선택"),
    # 서명·날인 칸 ("(인)", "(서명 또는 인)"). R10: 서명은 사용자가 실제 서류·공식 사이트에서 직접 한다.
    # 서비스는 값을 받지 않고 '여기에 직접 서명' 안내만 한다 (2026-11-23 추가, DATA-MODEL.md 반영 필요)
    ("signature", "서명", None, "직접 서명 또는 도장"),
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
    submitted_at TEXT,
    review_count INTEGER NOT NULL DEFAULT 0,
    reviewed_at TEXT,
    explanation_count INTEGER NOT NULL DEFAULT 0
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
-- 용어 사전 (DATA-MODEL.md 75~77행, F-05 R5). 팀이 검증해 넣는다.
-- (term, language)가 정확히 같은 행을 찾으므로 그 둘을 UNIQUE로 둔다 (WORD-EXPLAIN-API.md 항목 1)
CREATE TABLE IF NOT EXISTS glossary_term (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    term TEXT NOT NULL,
    language TEXT NOT NULL,
    explanation TEXT NOT NULL,
    UNIQUE (term, language)
);
-- 쉬운 풀이 (DATA-MODEL.md 78~82행, F-05 L2). 사용자 사이에 같이 쓰므로 user_id·draft_id가 없다.
-- (selected_text, language)가 같은 요청은 저장된 풀이를 쓴다 (R5 "같은 질문에 같은 설명")
CREATE TABLE IF NOT EXISTS easy_explanation (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    selected_text TEXT NOT NULL,
    glossary_term_id INTEGER REFERENCES glossary_term(id),
    language TEXT NOT NULL,
    explanation TEXT NOT NULL,
    request_count INTEGER NOT NULL DEFAULT 1,
    UNIQUE (selected_text, language)
);
"""

# 이미 만들어진 로컬 DB(didimdol.db)의 draft 테이블에 없는 칸을 채운다.
# CREATE TABLE IF NOT EXISTS는 기존 테이블에 칸을 더하지 않기 때문이다.
# review_count·reviewed_at: REVIEW-PRIVACY-API.md 항목 3 / explanation_count: WORD-EXPLAIN-API.md 항목 2
# (DATA-MODEL.md 반영은 PM)
DRAFT_ADDED_COLUMNS = [
    ("review_count", "INTEGER NOT NULL DEFAULT 0"),
    ("reviewed_at", "TEXT"),
    ("explanation_count", "INTEGER NOT NULL DEFAULT 0"),
]


def add_missing_draft_columns(conn):
    existing = {row["name"] for row in conn.execute("PRAGMA table_info(draft)")}
    for name, definition in DRAFT_ADDED_COLUMNS:
        if name not in existing:
            conn.execute(f"ALTER TABLE draft ADD COLUMN {name} {definition}")


# 사전 정보·입력값은 서버에 저장하지 않는다 (AI-plan docs/decisions/no-server-storage-user-input.md,
# 2026-11-17 결정). 브라우저에만 둔다. form_field.prior_info_key는 브라우저의 사전 정보와
# 칸을 잇는 이름이라 남긴다. 예전에 만든 로컬 DB에 남은 두 테이블(가짜 시드 값)은 지운다
REMOVED_TABLES = ["field_answer", "prior_info"]


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
        add_missing_draft_columns(conn)
        for table in REMOVED_TABLES:
            conn.execute(f"DROP TABLE IF EXISTS {table}")
        conn.execute(
            "INSERT OR IGNORE INTO user (google_sub, email, language) VALUES (?, ?, ?)",
            (SEED_GOOGLE_SUB, SEED_EMAIL, SEED_LANGUAGE),
        )
        conn.executemany(
            "INSERT OR IGNORE INTO input_format (code, label, pattern, example) "
            "VALUES (?, ?, ?, ?)",
            SEED_INPUT_FORMATS,
        )
        # 용어 사전 (WORD-EXPLAIN-API.md "운영 방식"). 시드가 사전의 출처라 이미 있는 용어는 설명을 바꾼다
        conn.executemany(
            "INSERT INTO glossary_term (term, language, explanation) VALUES (?, ?, ?) "
            "ON CONFLICT (term, language) DO UPDATE SET explanation = excluded.explanation",
            [(term, GLOSSARY_LANGUAGE, text) for term, text in SEED_GLOSSARY],
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
