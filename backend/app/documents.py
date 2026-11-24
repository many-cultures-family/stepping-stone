# F-01 문서 인식·개인정보 가림 (OCR-API.md 항목 1, US-01 인수 조건 2·3·4번), 반려 건 다시 올리기. 로그인·소유자 확인 필요
#
# 가리기 전 OCR 원문은 저장하지 않고 로그에도 남기지 않는다 (R8, DATA-MODEL.md 87행).
# 이 함수 안에서만 다루고 mask_ocr_lines를 거친 텍스트만 저장한다. 이 API는 LLM을 부르지 않는다.
import json
import logging
import uuid
from pathlib import Path
from typing import Annotated

from fastapi import APIRouter, Depends, File, HTTPException, UploadFile

from app import auth, db, drafts, ocr, privacy

router = APIRouter(prefix="/api")
logger = logging.getLogger(__name__)


def format_masked_text(lines):
    """`@p<페이지> x,y,w,h | 가린 글자` 줄들 (OCR-API.md "masked_text 모양").

    위치 표기에는 대괄호를 쓰지 않는다 — 대괄호는 개인정보 토큰([이름]) 전용이다.
    """
    out = []
    for line in lines:
        b = line.bbox or {"x": 0, "y": 0, "w": 0, "h": 0}
        out.append(
            f"@p{line.page} {b['x']:.2f},{b['y']:.2f},{b['w']:.2f},{b['h']:.2f} | {line.text}"
        )
    return "\n".join(out)


def _load_draft_for_recognize(conn, draft_id, user):
    row = conn.execute(
        "SELECT id, user_id, status, step FROM draft WHERE id = ?", (draft_id,)
    ).fetchone()
    if row is None:
        raise HTTPException(status_code=404, detail={"code": "DRAFT_NOT_FOUND"})
    if row["user_id"] != user["id"]:
        raise HTTPException(status_code=403, detail={"code": "FORBIDDEN_DRAFT"})
    if row["step"] != "upload":
        raise HTTPException(status_code=409, detail={"code": "DRAFT_STEP_INVALID"})
    if row["status"] != "수정":
        raise HTTPException(status_code=409, detail={"code": "DRAFT_NOT_EDITABLE"})
    return row


def _run_ocr_and_mask(file_path, mime_type):
    """(실패 사유 코드 또는 None, 저장할 masked_text, empty_pages).

    원문 줄(raw_lines)은 이 함수 밖으로 나가지 않는다.
    """
    try:
        raw_lines, empty_pages = ocr.recognize(file_path, mime_type)
    except ocr.OcrError:
        return "OCR_FAILED", None, []

    if not any(line.text.strip() for line in raw_lines):
        return "OCR_FAILED", None, empty_pages
    if empty_pages:
        return "PAGE_MISSING", None, empty_pages

    result = privacy.mask_ocr_lines(raw_lines)
    del raw_lines
    if result.residual:
        return "PII_REMAINING", None, empty_pages
    return None, format_masked_text(result.lines), empty_pages


@router.post("/drafts/{draft_id}/document:recognize")
def recognize_document(
    draft_id: int, user: Annotated[dict, Depends(auth.current_user)]
):
    # 동기 처리 (OCR-API.md "동기·비동기"). def 함수라 FastAPI가 스레드풀에서 돌려 서버가 멈추지 않는다
    conn = db.connect()
    try:
        _load_draft_for_recognize(conn, draft_id, user)
        document = conn.execute(
            "SELECT file_path, mime_type, page_count FROM document WHERE draft_id = ?",
            (draft_id,),
        ).fetchone()
    finally:
        conn.close()

    if document is None:
        # 업로드는 draft와 document를 한 트랜잭션으로 만들므로 정상 흐름에서는 없다
        reason, masked_text, empty_pages = "OCR_FAILED", None, []
    else:
        reason, masked_text, empty_pages = _run_ocr_and_mask(
            document["file_path"], document["mime_type"]
        )

    # OCR(몇 초)을 도는 동안 취소·중복 호출이 있었을 수 있다. 조건이 있는 UPDATE 하나로
    # 확인과 반영을 한 번에 한다 (drafts.py 제출·취소와 같은 방식)
    conn = db.connect()
    try:
        with conn:
            if reason is None:
                updated = conn.execute(
                    "UPDATE draft SET step = 'field_check' "
                    "WHERE id = ? AND step = 'upload' AND status = '수정'",
                    (draft_id,),
                )
            else:
                updated = conn.execute(
                    "UPDATE draft SET status = '반려', reject_reason = ? "
                    "WHERE id = ? AND step = 'upload' AND status = '수정'",
                    (reason, draft_id),
                )
            if updated.rowcount == 0:
                raise HTTPException(
                    status_code=409, detail={"code": "DRAFT_STEP_INVALID"}
                )
            if document is not None:
                # 실패면 masked_text는 저장하지 않는다 (OCR-API.md "실패와 상태")
                conn.execute(
                    "UPDATE document SET masked_text = ?, empty_pages = ? WHERE draft_id = ?",
                    (masked_text, json.dumps(empty_pages), draft_id),
                )
    finally:
        conn.close()

    if reason is not None:
        # 로그에는 작성 건 번호와 사유 코드만 남긴다
        logger.info("작성 건(%s) 문서 인식 반려: %s", draft_id, reason)
        return {
            "draft": {
                "id": draft_id,
                "status": "반려",
                "step": "upload",
                "reject_reason": reason,
            }
        }

    return {
        "draft": {"id": draft_id, "status": "수정", "step": "field_check"},
        "document": {"page_count": document["page_count"], "empty_pages": empty_pages},
    }


@router.post("/drafts/{draft_id}/document:reupload")
async def reupload_document(
    draft_id: int,
    user: Annotated[dict, Depends(auth.current_user)],
    file: Annotated[UploadFile | None, File()] = None,
):
    """반려된 작성 건에 파일만 다시 올린다 [제안 — 명세 없음].

    OCR-API.md·DOC-UPLOAD-API.md "아직 없는 항목: 반려 뒤 다시 올리기"를 채운다.
    - `03` 3-2 "반려 → 수정: 사용자 재업로드", DATA-MODEL.md `document.draft_id`
      "재업로드하면 이전 파일과 그 문서로 만든 입력 항목을 지우고 새 문서로 바꾼다"
    - 파일 검사는 업로드(`POST /api/drafts`)와 같다 (400 FILE_REQUIRED, 415 FILE_TYPE_NOT_ALLOWED)
    - 성공하면 status 수정·step upload로 되돌린다. 화면은 이어서 document:recognize를 부른다
    - 재분석·검토·풀이 횟수는 작성 건마다의 사용 한도라 되돌리지 않는다
    """
    if file is None:
        raise HTTPException(status_code=400, detail={"code": "FILE_REQUIRED"})

    # 파일을 읽기 전에 권한·상태부터 본다 (남의 작성 건이면 파일을 저장하지 않는다)
    conn = db.connect()
    try:
        row = conn.execute(
            "SELECT user_id, status FROM draft WHERE id = ?", (draft_id,)
        ).fetchone()
    finally:
        conn.close()
    if row is None:
        raise HTTPException(status_code=404, detail={"code": "DRAFT_NOT_FOUND"})
    if row["user_id"] != user["id"]:
        raise HTTPException(status_code=403, detail={"code": "FORBIDDEN_DRAFT"})
    if row["status"] != "반려":
        raise HTTPException(status_code=409, detail={"code": "DRAFT_NOT_REJECTED"})

    data = await file.read()
    if not data:
        raise HTTPException(status_code=400, detail={"code": "FILE_REQUIRED"})
    mime_type, ext = drafts.detect_type(data)
    page_count = drafts.count_pages(data, mime_type)

    # 원래 파일 이름은 개인정보일 수 있어 저장 이름에 쓰지 않는다 (업로드와 같음)
    upload_dir = drafts.get_upload_dir()
    upload_dir.mkdir(parents=True, exist_ok=True)
    new_path = upload_dir / f"{uuid.uuid4().hex}{ext}"
    new_path.write_bytes(data)

    old_path = None
    conn = db.connect()
    try:
        with conn:
            # 파일을 받는 사이 취소·중복 요청이 있었을 수 있다. 조건 있는 UPDATE로 확인과 반영을 한 번에 한다
            updated = conn.execute(
                "UPDATE draft SET status = '수정', step = 'upload', reject_reason = NULL, "
                "fields_confirmed_at = NULL, reviewed_at = NULL "
                "WHERE id = ? AND user_id = ? AND status = '반려'",
                (draft_id, user["id"]),
            )
            if updated.rowcount == 0:
                raise HTTPException(
                    status_code=409, detail={"code": "DRAFT_NOT_REJECTED"}
                )
            old = conn.execute(
                "SELECT file_path FROM document WHERE draft_id = ?", (draft_id,)
            ).fetchone()
            if old is None:
                conn.execute(
                    "INSERT INTO document (draft_id, file_path, mime_type, page_count) "
                    "VALUES (?, ?, ?, ?)",
                    (draft_id, str(new_path), mime_type, page_count),
                )
            else:
                old_path = old["file_path"]
                # 이전 문서로 만든 가린 텍스트·빈 쪽 기록은 새 파일과 맞지 않으므로 비운다
                conn.execute(
                    "UPDATE document SET file_path = ?, mime_type = ?, page_count = ?, "
                    "masked_text = NULL, empty_pages = NULL WHERE draft_id = ?",
                    (str(new_path), mime_type, page_count, draft_id),
                )
            # 이전 문서로 만든 입력 항목을 지운다 (DATA-MODEL.md document.draft_id).
            # 입력값은 서버에 저장하지 않으므로 지울 것이 없다 (no-server-storage-user-input.md)
            conn.execute("DELETE FROM form_field WHERE draft_id = ?", (draft_id,))
    except Exception:
        new_path.unlink(missing_ok=True)
        raise
    finally:
        conn.close()

    # 이전 원본 파일은 지운다 (R8 최소 수집, pii-items.md "업로드 원본 파일: 재업로드 때 지움")
    if old_path and old_path != str(new_path):
        Path(old_path).unlink(missing_ok=True)
    logger.info("작성 건(%s) 반려 뒤 다시 올림", draft_id)

    return {
        "draft": {"id": draft_id, "status": "수정", "step": "upload"},
        "document": {"mime_type": mime_type, "page_count": page_count},
    }
