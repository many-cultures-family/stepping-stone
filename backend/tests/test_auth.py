# 로그인 API (docs/api/LOGIN-API.md 항목 1~5). Google은 실제로 부르지 않는다
from urllib.parse import parse_qs, urlparse

import pytest
from conftest import CALLBACK_PATH, count_rows

from app import auth

LOGIN_PATH = "/api/auth/google/login"
ME_PATH = "/api/auth/me"
LOGOUT_PATH = "/api/auth/logout"

NEW_USERINFO = {
    "sub": "test-sub-0002",
    "email": "new@example.com",
    "email_verified": True,
}

# Google OIDC 메타데이터 (가짜). login 테스트가 네트워크를 쓰지 않게 한다
FAKE_METADATA = {
    "issuer": "https://accounts.google.com",
    "authorization_endpoint": "https://accounts.google.com/o/oauth2/v2/auth",
    "token_endpoint": "https://oauth2.googleapis.com/token",
    "jwks_uri": "https://www.googleapis.com/oauth2/v3/certs",
}


def user_row(db, google_sub):
    return db.execute(
        "SELECT * FROM user WHERE google_sub = ?", (google_sub,)
    ).fetchone()


def session_cookie_header(res):
    return next(
        v
        for k, v in res.headers.multi_items()
        if k == "set-cookie" and v.startswith("didimdol_session=")
    )


# 항목 1: 로그인 시작
def test_login_redirects_to_google_with_state(anon_client, monkeypatch):
    google = auth.google_client("test-client-id", "test-client-secret")

    async def fake_metadata():
        return FAKE_METADATA

    monkeypatch.setattr(google, "load_server_metadata", fake_metadata)

    res = anon_client.get(LOGIN_PATH, follow_redirects=False)

    assert res.status_code == 302
    location = urlparse(res.headers["location"])
    assert location.netloc == "accounts.google.com"
    query = parse_qs(location.query)
    assert query["client_id"] == ["test-client-id"]
    assert query["redirect_uri"] == ["http://localhost:5173/api/auth/google/callback"]
    assert query["scope"] == ["openid email"]
    assert query["state"][0]
    assert "didimdol_session=" in res.headers["set-cookie"]


@pytest.mark.parametrize(
    "missing", ["GOOGLE_CLIENT_ID", "GOOGLE_CLIENT_SECRET", "GOOGLE_REDIRECT_URI"]
)
def test_login_without_config_is_500(anon_client, monkeypatch, missing):
    monkeypatch.delenv(missing)

    res = anon_client.get(LOGIN_PATH, follow_redirects=False)

    assert res.status_code == 500
    assert res.json() == {"detail": {"code": "LOGIN_NOT_CONFIGURED"}}


# 항목 2: 로그인 콜백
def test_callback_creates_user_and_sets_session_cookie(anon_client, db, login):
    res = login(
        anon_client, NEW_USERINFO, headers={"Accept-Language": "vi-VN,vi;q=0.9"}
    )

    assert res.status_code == 302
    assert res.headers["location"] == "/"
    row = user_row(db, "test-sub-0002")
    assert row["email"] == "new@example.com"
    assert row["language"] == "vi"

    cookie = session_cookie_header(res).lower()
    assert "httponly" in cookie
    assert "samesite=lax" in cookie
    assert "path=/" in cookie
    assert f"max-age={14 * 24 * 60 * 60}" in cookie
    assert "secure" not in cookie


def test_callback_existing_user_updates_email_only(anon_client, db, login):
    login(anon_client, NEW_USERINFO, headers={"Accept-Language": "en"})
    before = count_rows(db, "user")

    login(
        anon_client,
        {**NEW_USERINFO, "email": "changed@example.com"},
        headers={"Accept-Language": "zh"},
    )

    assert count_rows(db, "user") == before
    row = user_row(db, "test-sub-0002")
    assert row["email"] == "changed@example.com"
    assert row["language"] == "en"


@pytest.mark.parametrize(
    ("accept_language", "expected"),
    [
        ("zh-CN,zh;q=0.9,en;q=0.8", "zh"),
        ("ja,en-US;q=0.7", "en"),
        ("en;q=0.5,vi;q=0.8", "vi"),
        ("ja,fr", "ko"),
        (None, "ko"),
    ],
)
def test_callback_picks_language_from_accept_language(
    anon_client, db, login, accept_language, expected
):
    headers = {"Accept-Language": accept_language} if accept_language else None
    login(anon_client, NEW_USERINFO, headers=headers)

    assert user_row(db, "test-sub-0002")["language"] == expected


def test_callback_canceled(anon_client, db):
    before = count_rows(db, "user")

    res = anon_client.get(
        CALLBACK_PATH, params={"error": "access_denied"}, follow_redirects=False
    )

    assert res.status_code == 302
    assert res.headers["location"] == "/?login_error=GOOGLE_LOGIN_CANCELED"
    assert count_rows(db, "user") == before
    assert anon_client.get(ME_PATH).status_code == 401


def test_callback_unverified_email_is_rejected(anon_client, db, login):
    res = login(anon_client, {**NEW_USERINFO, "email_verified": False})

    assert res.headers["location"] == "/?login_error=GOOGLE_EMAIL_NOT_VERIFIED"
    assert user_row(db, "test-sub-0002") is None
    assert anon_client.get(ME_PATH).status_code == 401


def test_callback_without_login_state_fails(anon_client, db):
    # 실제 Authlib 처리: 세션에 state가 없으면 실패 (Google은 부르지 않는다)
    before = count_rows(db, "user")

    res = anon_client.get(
        CALLBACK_PATH,
        params={"code": "fake-code", "state": "forged-state"},
        follow_redirects=False,
    )

    assert res.headers["location"] == "/?login_error=GOOGLE_LOGIN_FAILED"
    assert count_rows(db, "user") == before
    assert anon_client.get(ME_PATH).status_code == 401


def test_callback_google_error_fails(anon_client, monkeypatch):
    async def broken_fetch(request, client_id, client_secret):
        raise RuntimeError("code 교환 실패")

    monkeypatch.setattr(auth, "fetch_google_userinfo", broken_fetch)

    res = anon_client.get(
        CALLBACK_PATH, params={"code": "c", "state": "s"}, follow_redirects=False
    )

    assert res.headers["location"] == "/?login_error=GOOGLE_LOGIN_FAILED"


# 항목 3: 내 정보
def test_me_returns_email_and_language_only(client):
    res = client.get(ME_PATH)

    assert res.status_code == 200
    assert res.json() == {"user": {"email": "tester@example.com", "language": "vi"}}


def test_me_without_login_is_401(anon_client):
    res = anon_client.get(ME_PATH)

    assert res.status_code == 401
    assert res.json() == {"detail": {"code": "LOGIN_REQUIRED"}}


def test_me_with_deleted_user_is_401(anon_client, db, login):
    login(anon_client, NEW_USERINFO)
    with db:
        db.execute("DELETE FROM user WHERE google_sub = ?", ("test-sub-0002",))

    res = anon_client.get(ME_PATH)

    assert res.status_code == 401
    assert res.json() == {"detail": {"code": "LOGIN_REQUIRED"}}


# 항목 4: 사용 언어 바꾸기
def test_patch_me_changes_language(client, db):
    res = client.patch(ME_PATH, json={"language": "en"})

    assert res.status_code == 200
    assert res.json() == {"user": {"email": "tester@example.com", "language": "en"}}
    assert user_row(db, "test-sub-0001")["language"] == "en"
    assert client.get(ME_PATH).json()["user"]["language"] == "en"


@pytest.mark.parametrize("body", [{"language": "ja"}, {}, {"language": None}, []])
def test_patch_me_rejects_unknown_language(client, db, body):
    res = client.patch(ME_PATH, json=body)

    assert res.status_code == 400
    assert res.json() == {"detail": {"code": "LANGUAGE_NOT_ALLOWED"}}
    assert user_row(db, "test-sub-0001")["language"] == "vi"


def test_patch_me_rejects_non_json(client):
    res = client.patch(ME_PATH, content=b"language=en")

    assert res.status_code == 400
    assert res.json() == {"detail": {"code": "LANGUAGE_NOT_ALLOWED"}}


def test_patch_me_without_login_is_401(anon_client):
    res = anon_client.patch(ME_PATH, json={"language": "en"})

    assert res.status_code == 401
    assert res.json() == {"detail": {"code": "LOGIN_REQUIRED"}}


# 항목 5: 로그아웃
def test_logout_ends_session(client):
    res = client.post(LOGOUT_PATH)

    assert res.status_code == 204
    assert res.content == b""
    assert client.get(ME_PATH).status_code == 401


def test_logout_when_logged_out_is_204(anon_client):
    assert anon_client.post(LOGOUT_PATH).status_code == 204


# 다른 API의 권한 규칙: 로그인 없이 업로드 → 401, 작성 건을 만들지 않는다 (US-01 권한)
def test_upload_without_login_is_401_without_rows(anon_client, db, upload_dir):
    res = anon_client.post(
        "/api/drafts",
        files={
            "file": ("sample.png", b"\x89PNG\r\n\x1a\n" + b"\x00" * 16, "image/png")
        },
    )

    assert res.status_code == 401
    assert res.json() == {"detail": {"code": "LOGIN_REQUIRED"}}
    assert count_rows(db, "draft") == 0
    assert count_rows(db, "document") == 0
    assert not upload_dir.exists() or not list(upload_dir.iterdir())


def test_upload_owner_is_logged_in_user(anon_client, db, login):
    login(anon_client, NEW_USERINFO)

    res = anon_client.post(
        "/api/drafts",
        files={
            "file": ("sample.png", b"\x89PNG\r\n\x1a\n" + b"\x00" * 16, "image/png")
        },
    )

    assert res.status_code == 201
    draft = db.execute(
        "SELECT user_id FROM draft WHERE id = ?", (res.json()["draft"]["id"],)
    ).fetchone()
    assert draft["user_id"] == user_row(db, "test-sub-0002")["id"]
