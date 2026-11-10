# 작성 건 API (docs/API.md 항목 1, US-01 #1 / DRAFT-STATUS-API.md F-08). 로그인 필요
import io
import logging
import os
import uuid
from pathlib import Path
from typing import Annotated

from fastapi import APIRouter, Depends, File, HTTPException, UploadFile
from pypdf import PdfReader
from pypdf.errors import PyPdfError

from app import auth, db

router = APIRouter(prefix="/api")
logger = logging.getLogger(__name__)

# GET /api/drafts의 status 쿼리에 쓸 수 있는 값 (DRAFT-STATUS-API.md 항목 1, 취소는 뺀다)
LISTABLE_STATUSES = {"수정", "반려", "성공"}

# status·step → next_action 코드 (DRAFT-STATUS-API.md 항목 1 next_action 표)
STEP_NEXT_ACTION = {
    "upload": "UPLOAD",
    "field_check": "FIELD_CHECK",
    "prior_info": "PRIOR_INFO",
    "writing": "WRITING",
    "review": "REVIEW",
}

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
    except (PyPdfError, AttributeError, KeyError, IndexError, TypeError, ValueError):
        # 서명만 PDF이고 읽을 수 없는 파일. 깨진 PDF는 PdfReadError 말고도
        # AttributeError 등을 내므로 500 대신 415로 돌려준다
        raise HTTPException(status_code=415, detail={"code": "FILE_TYPE_NOT_ALLOWED"})


@router.post("/drafts", status_code=201)
async def create_draft(
    user: Annotated[dict, Depends(auth.current_user)],
    file: Annotated[UploadFile | None, File()] = None,
):
    # 로그인하지 않은 사용자는 올릴 수 없다 (US-01 권한, LOGIN-API.md) → 401 LOGIN_REQUIRED
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
                (user["id"], status, step),
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


def next_action(status, step, submitted_at):
    if status == "반려":
        return "REJECTED"
    if status == "성공":
        return "DONE" if submitted_at else "SUBMIT"
    return STEP_NEXT_ACTION[step]


@router.get("/drafts")
def list_drafts(
    user: Annotated[dict, Depends(auth.current_user)], status: str | None = None
):
    if status is not None and status not in LISTABLE_STATUSES:
        raise HTTPException(status_code=400, detail={"code": "STATUS_NOT_ALLOWED"})

    conn = db.connect()
    try:
        if status is None:
            rows = conn.execute(
                "SELECT id, status, step, reject_reason, submitted_at FROM draft "
                "WHERE user_id = ? AND status != '취소' ORDER BY id",
                (user["id"],),
            ).fetchall()
        else:
            rows = conn.execute(
                "SELECT id, status, step, reject_reason, submitted_at FROM draft "
                "WHERE user_id = ? AND status = ? ORDER BY id",
                (user["id"], status),
            ).fetchall()
    finally:
        conn.close()

    return {
        "drafts": [
            {
                "id": row["id"],
                "status": row["status"],
                "step": row["step"],
                "reject_reason": row["reject_reason"],
                "submitted_at": db.to_iso_z(row["submitted_at"]),
                "next_action": next_action(
                    row["status"], row["step"], row["submitted_at"]
                ),
            }
            for row in rows
        ]
    }


def _load_owned_draft(conn, draft_id, user):
    row = conn.execute(
        "SELECT user_id, status, submitted_at FROM draft WHERE id = ?", (draft_id,)
    ).fetchone()
    if row is None:
        raise HTTPException(status_code=404, detail={"code": "DRAFT_NOT_FOUND"})
    if row["user_id"] != user["id"]:
        raise HTTPException(status_code=403, detail={"code": "FORBIDDEN_DRAFT"})
    return row


@router.post("/drafts/{draft_id}:submit")
def submit_draft(draft_id: int, user: Annotated[dict, Depends(auth.current_user)]):
    conn = db.connect()
    try:
        row = _load_owned_draft(conn, draft_id, user)
        # 완성본 최종 확인(R9) 전이면 제출할 수 없다 (US-06 "유효하지 않은 신청 건")
        if row["status"] != "성공":
            raise HTTPException(status_code=409, detail={"code": "DRAFT_NOT_READY"})

        # 중복 제출 동시 요청을 막는다: 조건이 있는 UPDATE 하나로 확인과 반영을
        # 한 번에 한다. 이미 다른 요청이 먼저 제출을 마쳤다면(rowcount 0) 409
        with conn:
            updated = conn.execute(
                "UPDATE draft SET submitted_at = CURRENT_TIMESTAMP "
                "WHERE id = ? AND submitted_at IS NULL",
                (draft_id,),
            )
            if updated.rowcount == 0:
                raise HTTPException(
                    status_code=409, detail={"code": "ALREADY_SUBMITTED"}
                )

        result = conn.execute(
            "SELECT status, submitted_at FROM draft WHERE id = ?", (draft_id,)
        ).fetchone()
    finally:
        conn.close()

    # status는 바꾸지 않는다 — 제출은 기록으로만 남긴다 (R10)
    return {
        "id": draft_id,
        "status": result["status"],
        "submitted_at": db.to_iso_z(result["submitted_at"]),
    }


@router.post("/drafts/{draft_id}:cancel")
def cancel_draft(draft_id: int, user: Annotated[dict, Depends(auth.current_user)]):
    conn = db.connect()
    try:
        _load_owned_draft(conn, draft_id, user)

        # 제출 후에도 취소를 허용한다 — submitted_at 유무와 상관없이 수정·반려·성공
        # 어느 상태에서든 취소할 수 있다 (R1·R8·T3 파기 취지, DRAFT-STATUS-API.md 항목 3).
        # backlog.md US-07의 "제출 전이라면" 문구와는 다른 해석이지만, 팀 투표로 이 쪽
        # (A안: 제출 후에도 허용)이 확정됐다
        existing_document = conn.execute(
            "SELECT file_path FROM document WHERE draft_id = ?", (draft_id,)
        ).fetchone()

        # 중복 취소 동시 요청을 막는다: 조건이 있는 UPDATE 하나로 확인과 반영을
        # 한 번에 한다. 이미 다른 요청이 먼저 취소를 마쳤다면(rowcount 0) 409
        with conn:
            updated = conn.execute(
                "UPDATE draft SET status = '취소' WHERE id = ? AND status != '취소'",
                (draft_id,),
            )
            if updated.rowcount == 0:
                raise HTTPException(
                    status_code=409, detail={"code": "ALREADY_CANCELED"}
                )
            conn.execute(
                "DELETE FROM field_answer WHERE form_field_id IN "
                "(SELECT id FROM form_field WHERE draft_id = ?)",
                (draft_id,),
            )
            conn.execute("DELETE FROM form_field WHERE draft_id = ?", (draft_id,))
            conn.execute("DELETE FROM document WHERE draft_id = ?", (draft_id,))
            # TODO(F-06·F-07): review_suggestion, privacy_detection 삭제. 두 테이블이
            # 아직 스키마에 없어서(F-06·F-07 미구현) 여기 자리만 남겨 둔다 (T3)
            # prior_info는 다른 작성 건이 같이 쓰므로 지우지 않는다 (T3)
    finally:
        conn.close()

    if existing_document is not None:
        try:
            Path(existing_document["file_path"]).unlink(missing_ok=True)
        except OSError:
            # DB 트랜잭션은 이미 커밋됐으므로 롤백하지 않고 로그만 남긴다 (DRAFT-STATUS-API.md 항목 3)
            logger.exception("취소된 작성 건(%s)의 업로드 파일 삭제 실패", draft_id)

    return {"id": draft_id, "status": "취소"}
