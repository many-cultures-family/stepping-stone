import sqlite3
from pathlib import Path

import pytest
from fastapi.testclient import TestClient

# 개인정보 없는 가짜 입력 파일 (빈 1페이지 PDF, 흰색 1x1 PNG·JPG)
FIXTURES_DIR = Path(__file__).parent / "fixtures"


@pytest.fixture
def client(tmp_path, monkeypatch):
    # 테스트마다 임시 DB·업로드 폴더를 쓴다
    monkeypatch.setenv("DATABASE_PATH", str(tmp_path / "test.db"))
    monkeypatch.setenv("UPLOAD_DIR", str(tmp_path / "uploads"))
    from app.main import app

    with TestClient(app) as c:
        yield c


@pytest.fixture
def db(client, tmp_path):
    conn = sqlite3.connect(tmp_path / "test.db")
    conn.row_factory = sqlite3.Row
    yield conn
    conn.close()


@pytest.fixture
def upload_dir(client, tmp_path):
    return tmp_path / "uploads"


def count_rows(conn, table):
    return conn.execute(f"SELECT COUNT(*) FROM {table}").fetchone()[0]
