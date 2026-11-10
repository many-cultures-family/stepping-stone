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


def count_rows(conn, table):
    return conn.execute(f"SELECT COUNT(*) FROM {table}").fetchone()[0]
