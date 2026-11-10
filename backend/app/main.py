import logging
import os
import secrets
from contextlib import asynccontextmanager

from fastapi import FastAPI, Request
from fastapi.exception_handlers import request_validation_exception_handler
from fastapi.exceptions import RequestValidationError
from fastapi.responses import JSONResponse
from starlette.middleware.sessions import SessionMiddleware

from app import auth, db, drafts, fields

logger = logging.getLogger(__name__)

# 로그인 세션 쿠키 (LOGIN-API.md 공통 규칙): didimdol_session, HttpOnly(기본), SameSite=Lax, 14일.
# 로컬 http 시연이라 Secure는 끈다
SESSION_COOKIE = "didimdol_session"
SESSION_MAX_AGE = 14 * 24 * 60 * 60


def get_session_secret():
    secret = os.environ.get("SESSION_SECRET_KEY")
    if not secret:
        logger.warning(
            "SESSION_SECRET_KEY가 없어 임시 키를 씁니다. 서버를 다시 켜면 다시 로그인해야 합니다"
        )
        secret = secrets.token_urlsafe(32)
    return secret


@asynccontextmanager
async def lifespan(app):
    db.init_db()
    yield


app = FastAPI(title="디딤돌", lifespan=lifespan)
app.add_middleware(
    SessionMiddleware,
    secret_key=get_session_secret(),
    session_cookie=SESSION_COOKIE,
    max_age=SESSION_MAX_AGE,
    path="/",
    same_site="lax",
    https_only=False,
)
app.include_router(auth.router)
app.include_router(drafts.router)
app.include_router(fields.router)


@app.exception_handler(RequestValidationError)
async def validation_error(request: Request, exc: RequestValidationError):
    # POST /api/drafts에 file을 파일이 아닌 글자로 보내면 기본 422 대신
    # API.md 오류 형식의 400 FILE_REQUIRED로 돌려준다
    if request.url.path == "/api/drafts" and any(
        tuple(e["loc"]) == ("body", "file") for e in exc.errors()
    ):
        return JSONResponse(
            status_code=400, content={"detail": {"code": "FILE_REQUIRED"}}
        )
    # POST .../fields:infer에 깨진 JSON이나 flagged_field_ids가 배열[정수]가 아닌
    # 값을 보내면 기본 422(키 없음과 구분 안 됨, LLM이 잘못 호출될 수 있음) 대신
    # 400으로 명확히 거절한다 (F-02 리뷰)
    if request.url.path.endswith("/fields:infer"):
        return JSONResponse(
            status_code=400,
            content={"detail": {"code": "INVALID_FLAGGED_FIELD_IDS"}},
        )
    return await request_validation_exception_handler(request, exc)


@app.get("/api/health")
def health():
    return {"status": "ok"}
