# 작성 건 API (docs/API.md 항목 1, US-01 #1)
import io
import os
import uuid
from pathlib import Path
from typing import Annotated

from fastapi import APIRouter, File, HTTPException, UploadFile
from pypdf import PdfReader
from pypdf.errors import PyPdfError

from app import db

router = APIRouter(prefix="/api")

# 파일 앞부분 서명 → (mime_type, 저장 확장자). 허용 형식은 DATA-MODEL.md document.mime_type
SIGNATURES = [
    (b"%PDF-", "application/pdf", ".pdf"),
    (b"\x89PNG\r\n\x1a\n", "image/png", ".png"),
    (b"\xff\xd8\xff", "image/jpeg", ".jpg"),
]


def get_upload_dir():
    return Path(os.environ.get("UPLOAD_DIR", str(db.BACKEND_DIR / "uploads")))


def detect_type(data):
    for signature, mime_type, ext in SIGNATURES:
        if data.startswith(signature):
            return mime_type, ext
    raise HTTPException(status_code=415, detail={"code": "FILE_TYPE_NOT_ALLOWED"})


def count_pages(data, mime_type):
    if mime_type != "application/pdf":
        return 1
    try:
        return len(PdfReader(io.BytesIO(data)).pages)
    except PyPdfError, AttributeError, KeyError, IndexError, TypeError, ValueError:
        # 서명만 PDF이고 읽을 수 없는 파일. 깨진 PDF는 PdfReadError 말고도
        # AttributeError 등을 내므로 500 대신 415로 돌려준다
        raise HTTPException(status_code=415, detail={"code": "FILE_TYPE_NOT_ALLOWED"})


@router.post("/drafts", status_code=201)
async def create_draft(file: Annotated[UploadFile | None, File()] = None):
    # 필수 File이면 FastAPI가 422를 주므로 직접 400으로 처리한다.
    # 파일 대신 글자로 보낸 file은 main.py의 검증 오류 처리기가 400으로 바꾼다
    if file is None:
        raise HTTPException(status_code=400, detail={"code": "FILE_REQUIRED"})
    data = await file.read()
    if not data:
        raise HTTPException(status_code=400, detail={"code": "FILE_REQUIRED"})

    mime_type, ext = detect_type(data)
    page_count = count_pages(data, mime_type)

    # 원래 파일 이름은 개인정보일 수 있어 저장 이름에 쓰지 않는다
    upload_dir = get_upload_dir()
    upload_dir.mkdir(parents=True, exist_ok=True)
    file_path = upload_dir / f"{uuid.uuid4().hex}{ext}"
    file_path.write_bytes(data)

    # 처음 상태: backlog '업로드됨' = status 수정 + step upload (DATA-MODEL.md 대응표)
    status, step = "수정", "upload"

    conn = db.connect()
    try:
        with conn:
            cur = conn.execute(
                "INSERT INTO draft (user_id, status, step, reanalysis_count) VALUES (?, ?, ?, 0)",
                (db.get_seed_user_id(conn), status, step),
            )
            draft_id = cur.lastrowid
            conn.execute(
                "INSERT INTO document (draft_id, file_path, mime_type, page_count) VALUES (?, ?, ?, ?)",
                (draft_id, str(file_path), mime_type, page_count),
            )
    except Exception:
        file_path.unlink(missing_ok=True)
        raise
    finally:
        conn.close()

    # file_path는 응답에 넣지 않는다 (API.md 공통 규칙)
    return {
        "draft": {"id": draft_id, "status": status, "step": step},
        "document": {"mime_type": mime_type, "page_count": page_count},
    }
