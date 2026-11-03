from contextlib import asynccontextmanager

from fastapi import FastAPI, Request
from fastapi.exception_handlers import request_validation_exception_handler
from fastapi.exceptions import RequestValidationError
from fastapi.responses import JSONResponse

from app import db, drafts


@asynccontextmanager
async def lifespan(app):
    db.init_db()
    yield


app = FastAPI(title="디딤돌", lifespan=lifespan)
app.include_router(drafts.router)


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
    return await request_validation_exception_handler(request, exc)


@app.get("/api/health")
def health():
    return {"status": "ok"}
