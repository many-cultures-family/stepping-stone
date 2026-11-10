import os
import sqlite3
from pathlib import Path

import pytest
from fastapi.testclient import TestClient

# 세션 서명 키는 app을 불러올 때 한 번 읽으므로 먼저 둔다 (가짜 값)
os.environ.setdefault("SESSION_SECRET_KEY", "test-session-secret")

# 개인정보 없는 가짜 입력 파일 (빈 1페이지 PDF, 흰색 1x1 PNG·JPG)
FIXTURES_DIR = Path(__file__).parent / "fixtures"

CALLBACK_PATH = "/api/auth/google/callback"

# 테스트 전용 Fernet 키 (가짜 값, Fernet.generate_key()로 만듦)
TEST_PRIOR_INFO_ENCRYPTION_KEY = "sHF-vucV46MN5NfW0cc5uCIbaW0OCufavt20j1JuE2Y="

# DATA-MODEL 시드 2번 (가짜 값). db.init_db()가 넣는다
SEED_USERINFO = {
    "sub": "test-sub-0001",
    "email": "tester@example.com",
    "email_verified": True,
}


@pytest.fixture
def anon_client(tmp_path, monkeypatch):
    # 테스트마다 임시 DB·업로드 폴더를 쓴다. Google 설정은 가짜 값
    monkeypatch.setenv("DATABASE_PATH", str(tmp_path / "test.db"))
    monkeypatch.setenv("UPLOAD_DIR", str(tmp_path / "uploads"))
    monkeypatch.setenv("GOOGLE_CLIENT_ID", "test-client-id")
    monkeypatch.setenv("GOOGLE_CLIENT_SECRET", "test-client-secret")
    monkeypatch.setenv(
        "GOOGLE_REDIRECT_URI", "http://localhost:5173/api/auth/google/callback"
    )
    monkeypatch.setenv("PRIOR_INFO_ENCRYPTION_KEY", TEST_PRIOR_INFO_ENCRYPTION_KEY)
    from app.main import app

    with TestClient(app) as c:
        yield c


@pytest.fixture
def login(monkeypatch):
    """Google을 부르지 않고 콜백을 거쳐 로그인한다. 콜백 응답(302)을 돌려준다"""
    from app import auth

    def _login(client, userinfo=None, headers=None, follow_redirects=False):
        info = SEED_USERINFO if userinfo is None else userinfo

        async def fake_fetch(request, client_id, client_secret):
            return info

        monkeypatch.setattr(auth, "fetch_google_userinfo", fake_fetch)
        return client.get(
            CALLBACK_PATH,
            params={"code": "fake-code", "state": "fake-state"},
            headers=headers,
            follow_redirects=follow_redirects,
        )

    return _login


@pytest.fixture
def client(anon_client, login):
    # 시드 사용자로 로그인한 클라이언트 (로그인이 필요한 API 테스트용)
    res = login(anon_client)
    assert res.status_code == 302
    assert res.headers["location"] == "/"
    return anon_client


@pytest.fixture
def db(anon_client, tmp_path):
    conn = sqlite3.connect(tmp_path / "test.db")
    conn.row_factory = sqlite3.Row
    yield conn
    conn.close()


@pytest.fixture
def upload_dir(anon_client, tmp_path):
    return tmp_path / "uploads"


@pytest.fixture
def seed_user_id(db):
    from app.db import SEED_GOOGLE_SUB

    row = db.execute(
        "SELECT id FROM user WHERE google_sub = ?", (SEED_GOOGLE_SUB,)
    ).fetchone()
    return row["id"]


def count_rows(conn, table):
    return conn.execute(f"SELECT COUNT(*) FROM {table}").fetchone()[0]


def insert_draft(conn, user_id, status, step, **fields):
    # F-02·F-08 테스트에서 업로드·추론 흐름 없이 바로 원하는 상태의 작성 건을 만든다
    columns = ["user_id", "status", "step", *fields.keys()]
    placeholders = ", ".join("?" for _ in columns)
    values = [user_id, status, step, *fields.values()]
    cur = conn.execute(
        f"INSERT INTO draft ({', '.join(columns)}) VALUES ({placeholders})",
        values,
    )
    conn.commit()
    return cur.lastrowid


def insert_form_field(conn, draft_id, **overrides):
    # F-02 테스트에서 L1 호출 없이 바로 원하는 입력 항목을 만든다
    import json

    row = {
        "label": "항목",
        "format_code": "name",
        "required": 1,
        "prior_info_key": None,
        "description": "설명",
        "guide_text": None,
        "options": None,
        "bbox": "{}",
        "flagged_wrong": 0,
    }
    row.update(overrides)
    if isinstance(row["bbox"], dict):
        row["bbox"] = json.dumps(row["bbox"])
    if isinstance(row["options"], (list, dict)):
        row["options"] = json.dumps(row["options"])

    columns = ["draft_id", *row.keys()]
    placeholders = ", ".join("?" for _ in columns)
    values = [draft_id, *row.values()]
    cur = conn.execute(
        f"INSERT INTO form_field ({', '.join(columns)}) VALUES ({placeholders})",
        values,
    )
    conn.commit()
    return cur.lastrowid


def insert_field_answer(conn, form_field_id, value, **overrides):
    # F-06 테스트에서 작성(F-04/US-05 API 미구현) 없이 바로 답변 값을 만든다
    row = {"value": value, "mismatch_acknowledged": 0}
    row.update(overrides)
    columns = ["form_field_id", *row.keys()]
    placeholders = ", ".join("?" for _ in columns)
    values = [form_field_id, *row.values()]
    cur = conn.execute(
        f"INSERT INTO field_answer ({', '.join(columns)}) VALUES ({placeholders})",
        values,
    )
    conn.commit()
    return cur.lastrowid


def insert_prior_info(conn, user_id, info_key, format_code, value):
    from app import crypto

    cur = conn.execute(
        "INSERT INTO prior_info (user_id, info_key, format_code, value) "
        "VALUES (?, ?, ?, ?)",
        (user_id, info_key, format_code, crypto.encrypt_value(value)),
    )
    conn.commit()
    return cur.lastrowid


def insert_document(conn, draft_id, masked_text="", **overrides):
    row = {
        "file_path": f"/tmp/fake-{draft_id}.pdf",
        "mime_type": "application/pdf",
        "masked_text": masked_text,
        "page_count": 1,
        "empty_pages": None,
    }
    row.update(overrides)
    columns = ["draft_id", *row.keys()]
    placeholders = ", ".join("?" for _ in columns)
    values = [draft_id, *row.values()]
    cur = conn.execute(
        f"INSERT INTO document ({', '.join(columns)}) VALUES ({placeholders})",
        values,
    )
    conn.commit()
    return cur.lastrowid
