import os
import sqlite3
import tempfile
from pathlib import Path

import pytest
from fastapi.testclient import TestClient

# 테스트용 DB는 임시 폴더에 만든다 (SETUP-PLAN.md 3절에 예약된 DATABASE_PATH).
# 서버가 import 시점에 환경변수를 읽어도 적용되도록, 테스트 모듈이 main을 불러오기 전에 정한다.
_TEST_DB_DIR = tempfile.mkdtemp(prefix="didimdol-test-")
os.environ["DATABASE_PATH"] = str(Path(_TEST_DB_DIR) / "test.db")

FIXTURES_DIR = Path(__file__).parent / "fixtures"


@pytest.fixture
def client():
    from main import app

    return TestClient(app)


@pytest.fixture
def db_path():
    return Path(os.environ["DATABASE_PATH"])


def count_rows(db_path, table):
    """table의 행 수. DB 파일이나 테이블이 아직 없으면 0."""
    if not db_path.exists():
        return 0
    with sqlite3.connect(db_path) as conn:
        exists = conn.execute(
            "SELECT 1 FROM sqlite_master WHERE type = 'table' AND name = ?", (table,)
        ).fetchone()
        if exists is None:
            return 0
        return conn.execute(f"SELECT COUNT(*) FROM {table}").fetchone()[0]


def fetch_one(db_path, sql, params):
    """한 행을 dict로 돌려준다. 없으면 None."""
    with sqlite3.connect(db_path) as conn:
        conn.row_factory = sqlite3.Row
        row = conn.execute(sql, params).fetchone()
        return dict(row) if row is not None else None
