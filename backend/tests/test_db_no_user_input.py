"""사전 정보·입력값 서버 미저장 (AI-plan docs/decisions/no-server-storage-user-input.md)."""

import sqlite3

from app import db as app_db


# 사전 정보·입력값은 서버에 저장하지 않는다 (no-server-storage-user-input.md, 2026-11-17 결정)
def test_user_input_tables_are_not_created(db):
    tables = {
        row["name"]
        for row in db.execute("SELECT name FROM sqlite_master WHERE type = 'table'")
    }

    assert "prior_info" not in tables
    assert "field_answer" not in tables


def test_init_db_drops_user_input_tables_left_in_old_db(tmp_path, monkeypatch):
    """예전에 만든 로컬 DB에 남은 prior_info·field_answer(가짜 시드 값)를 지운다."""
    path = tmp_path / "old.db"
    old = sqlite3.connect(path)
    old.executescript(
        """
        CREATE TABLE prior_info (id INTEGER PRIMARY KEY, user_id INTEGER NOT NULL,
            info_key TEXT NOT NULL, format_code TEXT NOT NULL, value TEXT NOT NULL);
        INSERT INTO prior_info (user_id, info_key, format_code, value)
            VALUES (1, 'phone', 'phone', '010-0000-1234');
        CREATE TABLE field_answer (id INTEGER PRIMARY KEY, form_field_id INTEGER NOT NULL,
            value TEXT);
        INSERT INTO field_answer (form_field_id, value) VALUES (1, '가짜 값');
        """
    )
    old.commit()
    old.close()
    monkeypatch.setenv("DATABASE_PATH", str(path))

    app_db.init_db()
    app_db.init_db()

    conn = app_db.connect()
    try:
        tables = {
            row["name"]
            for row in conn.execute(
                "SELECT name FROM sqlite_master WHERE type = 'table'"
            )
        }
    finally:
        conn.close()
    assert "prior_info" not in tables
    assert "field_answer" not in tables
