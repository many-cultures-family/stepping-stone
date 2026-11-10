# 로그인 API (docs/api/LOGIN-API.md 항목 1~5, US-01·US-02 권한)
# Google 로그인만 쓴다. Google과 주고받는 일은 서버만 하고, Google 토큰은 저장하지 않는다.
import logging
import os
from typing import Annotated

from authlib.integrations.starlette_client import OAuth
from fastapi import APIRouter, Depends, HTTPException, Request, Response
from fastapi.responses import RedirectResponse

from app import db

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/api/auth")

# 사용 언어 목록 (DATA-MODEL.md user.language). 목록이 바뀌면 여기만 고친다
ALLOWED_LANGUAGES = ("ko", "vi", "zh", "en")
DEFAULT_LANGUAGE = "ko"

GOOGLE_METADATA_URL = "https://accounts.google.com/.well-known/openid-configuration"
# R8 최소 수집: 이름·프로필 사진은 받지 않는다
GOOGLE_SCOPE = "openid email"

_google_clients = {}


def get_google_config():
    """GOOGLE_CLIENT_ID·SECRET·REDIRECT_URI. 하나라도 비면 None"""
    client_id = os.environ.get("GOOGLE_CLIENT_ID")
    client_secret = os.environ.get("GOOGLE_CLIENT_SECRET")
    redirect_uri = os.environ.get("GOOGLE_REDIRECT_URI")
    if not (client_id and client_secret and redirect_uri):
        return None
    return client_id, client_secret, redirect_uri


def google_client(client_id, client_secret):
    # 환경변수를 요청 때 읽으므로, 값이 바뀌면 새 클라이언트를 만든다
    key = (client_id, client_secret)
    if key not in _google_clients:
        oauth = OAuth()
        oauth.register(
            name="google",
            client_id=client_id,
            client_secret=client_secret,
            server_metadata_url=GOOGLE_METADATA_URL,
            client_kwargs={"scope": GOOGLE_SCOPE},
        )
        _google_clients[key] = oauth.google
    return _google_clients[key]


async def fetch_google_userinfo(request, client_id, client_secret):
    """state 확인 + code 교환 + ID 토큰 검증 뒤 userinfo(sub·email·email_verified)만 돌려준다.
    토큰은 이 함수 밖으로 내보내지 않는다. 테스트는 이 함수를 바꿔 Google을 부르지 않는다"""
    token = await google_client(client_id, client_secret).authorize_access_token(
        request
    )
    return token.get("userinfo")


def pick_language(accept_language):
    """Accept-Language에서 사용 언어 목록에 있는 첫 언어 (q값 높은 순). 없으면 ko"""
    candidates = []
    for index, part in enumerate((accept_language or "").split(",")):
        pieces = part.strip().split(";")
        tag = pieces[0].strip().lower()
        if not tag:
            continue
        q = 1.0
        for param in pieces[1:]:
            name, _, value = param.strip().partition("=")
            if name.strip() == "q":
                try:
                    q = float(value)
                except ValueError:
                    q = 0.0
        candidates.append((-q, index, tag.split("-")[0]))
    for neg_q, _, primary in sorted(candidates):
        if neg_q < 0 and primary in ALLOWED_LANGUAGES:
            return primary
    return DEFAULT_LANGUAGE


def login_error(code):
    return RedirectResponse(f"/?login_error={code}", status_code=302)


def user_body(user):
    # id·google_sub는 응답에 넣지 않는다 (R8)
    return {"user": {"email": user["email"], "language": user["language"]}}


def current_user(request: Request):
    """로그인이 필요한 API의 의존성. 세션이 없거나 사용자가 없으면 401 LOGIN_REQUIRED"""
    user_id = request.session.get("user_id")
    user = None
    if user_id is not None:
        conn = db.connect()
        try:
            user = conn.execute(
                "SELECT id, email, language FROM user WHERE id = ?", (user_id,)
            ).fetchone()
        finally:
            conn.close()
    if user is None:
        request.session.clear()
        raise HTTPException(status_code=401, detail={"code": "LOGIN_REQUIRED"})
    return dict(user)


CurrentUser = Annotated[dict, Depends(current_user)]


@router.get("/google/login")
async def google_login(request: Request):
    config = get_google_config()
    if config is None:
        raise HTTPException(status_code=500, detail={"code": "LOGIN_NOT_CONFIGURED"})
    client_id, client_secret, redirect_uri = config
    # state·nonce는 Authlib가 만들어 세션에 저장한다
    return await google_client(client_id, client_secret).authorize_redirect(
        request, redirect_uri
    )


@router.get("/google/callback")
async def google_callback(request: Request):
    if request.query_params.get("error"):
        return login_error("GOOGLE_LOGIN_CANCELED")
    config = get_google_config()
    if config is None:
        return login_error("GOOGLE_LOGIN_FAILED")
    client_id, client_secret, _ = config

    try:
        userinfo = await fetch_google_userinfo(request, client_id, client_secret)
    except Exception:
        # state 없음·불일치, code 교환 실패, Google 응답 오류 모두 같은 코드
        logger.warning("Google 로그인 콜백 실패", exc_info=True)
        return login_error("GOOGLE_LOGIN_FAILED")
    if not userinfo or not userinfo.get("sub") or not userinfo.get("email"):
        return login_error("GOOGLE_LOGIN_FAILED")
    if userinfo.get("email_verified") is not True:
        return login_error("GOOGLE_EMAIL_NOT_VERIFIED")

    google_sub = userinfo["sub"]
    email = userinfo["email"]
    conn = db.connect()
    try:
        with conn:
            row = conn.execute(
                "SELECT id FROM user WHERE google_sub = ?", (google_sub,)
            ).fetchone()
            if row is None:
                language = pick_language(request.headers.get("accept-language"))
                user_id = conn.execute(
                    "INSERT INTO user (google_sub, email, language) VALUES (?, ?, ?)",
                    (google_sub, email, language),
                ).lastrowid
            else:
                user_id = row["id"]
                conn.execute("UPDATE user SET email = ? WHERE id = ?", (email, user_id))
    finally:
        conn.close()

    # 로그인 중에 쓴 state 등은 지우고 user.id만 남긴다
    request.session.clear()
    request.session["user_id"] = user_id
    return RedirectResponse("/", status_code=302)


@router.get("/me")
def get_me(user: CurrentUser):
    return user_body(user)


@router.patch("/me")
async def update_me(request: Request, user: CurrentUser):
    # 본문 검사를 직접 해서 422 대신 400 LANGUAGE_NOT_ALLOWED로 돌려준다
    try:
        body = await request.json()
    except ValueError:
        body = None
    language = body.get("language") if isinstance(body, dict) else None
    if language not in ALLOWED_LANGUAGES:
        raise HTTPException(status_code=400, detail={"code": "LANGUAGE_NOT_ALLOWED"})

    conn = db.connect()
    try:
        with conn:
            conn.execute(
                "UPDATE user SET language = ? WHERE id = ?", (language, user["id"])
            )
    finally:
        conn.close()
    return user_body({**user, "language": language})


@router.post("/logout", status_code=204)
def logout(request: Request):
    # 이미 로그아웃 상태여도 204. 세션이 비면 SessionMiddleware가 쿠키를 만료시킨다
    request.session.clear()
    return Response(status_code=204)
