# F-04 가상 작성 (VIRTUAL-FORM-API.md 항목 1·2) + 원본 페이지 이미지(명세에 없음, 아래 설명). 로그인·소유자 확인 필요
#
# 입력값·사전 정보는 서버에 저장하지 않는다 (no-server-storage-user-input.md). 이 파일의 API는
# 칸 정보·형식 규칙·원본 이미지만 내려 주고, 값을 받는 API는 없다. 형식 검사는 브라우저 규칙 엔진이 한다 (R3).
import json
from pathlib import Path
from typing import Annotated

from fastapi import APIRouter, Depends, HTTPException
from fastapi.responses import FileResponse, Response

from app import auth, db, layout

router = APIRouter(prefix="/api")

# 가상 작성 화면을 열 수 있는 단계 (VIRTUAL-FORM-API.md 항목 1 "검토 중에도 답변을 고칠 수 있어야 한다")
FORM_STEPS = {"writing", "review"}
# 페이지 이미지 해상도. 화면에 칸을 겹쳐 그리는 용도라 OCR(200dpi)보다 낮게 둔다
PAGE_IMAGE_DPI = 130
# 원본은 본인 개인 문서다. 브라우저·중간 캐시에 남기지 않는다
NO_STORE = {"Cache-Control": "no-store"}


def _load_owned(conn, draft_id, user):
    row = conn.execute(
        "SELECT id, user_id, status, step FROM draft WHERE id = ?", (draft_id,)
    ).fetchone()
    if row is None:
        raise HTTPException(status_code=404, detail={"code": "DRAFT_NOT_FOUND"})
    if row["user_id"] != user["id"]:
        raise HTTPException(status_code=403, detail={"code": "FORBIDDEN_DRAFT"})
    return row


def _check_state(row, allowed_steps):
    # 공통 규칙: status가 수정이 아니면 DRAFT_NOT_EDITABLE, 단계가 맞지 않으면 DRAFT_STEP_INVALID
    if row["status"] != "수정":
        raise HTTPException(status_code=409, detail={"code": "DRAFT_NOT_EDITABLE"})
    if row["step"] not in allowed_steps:
        raise HTTPException(status_code=409, detail={"code": "DRAFT_STEP_INVALID"})


@router.get("/drafts/{draft_id}/form")
def get_form(draft_id: int, user: Annotated[dict, Depends(auth.current_user)]):
    """항목 1. 값 없이 칸 정보와 형식 규칙(pattern)만 준다.

    명세 응답에 더한 것 (명세 반영 필요):
    - 칸마다 `bbox`: L1이 고른 위치(F-02 `form_field.bbox`와 같은 값). 표 안 칸이면 라벨 자리다
    - 칸마다 원본에서 찾은 '실제로 적는 자리'(layout.py). 못 찾으면 null → 화면이 bbox로 어림한다
      - `input_bbox`: 값 칸·밑줄 위·라벨 뒤 빈자리, 서명 칸이면 '(인)' 자리
      - `option_bboxes`: choice의 □ 상자들 (options와 같은 순서)
      - `part_bboxes`: 날짜줄의 {year, month, day} 빈자리
    - `document.page_count`: 그릴 페이지 수
    """
    conn = db.connect()
    try:
        draft = _load_owned(conn, draft_id, user)
        _check_state(draft, FORM_STEPS)
        rows = conn.execute(
            "SELECT f.id, f.label, f.format_code, f.required, f.prior_info_key, "
            "f.description, f.options, f.bbox, "
            "i.label AS format_label, i.example AS format_example, i.pattern "
            "FROM form_field f LEFT JOIN input_format i ON i.code = f.format_code "
            "WHERE f.draft_id = ? ORDER BY f.id",
            (draft_id,),
        ).fetchall()
        document = conn.execute(
            "SELECT file_path, mime_type, page_count FROM document WHERE draft_id = ?",
            (draft_id,),
        ).fetchone()
    finally:
        conn.close()

    bboxes = [json.loads(row["bbox"]) for row in rows]
    options = [json.loads(row["options"]) if row["options"] else None for row in rows]
    empty = {"input_bbox": None, "option_bboxes": None, "part_bboxes": None}
    spots = [dict(empty) for _ in rows]
    if document is not None and Path(document["file_path"]).exists():
        # 서명 칸도 자리는 찾는다 (값은 받지 않고 '여기에 직접 서명' 표시만, R10)
        spots = layout.writing_spots(
            document["file_path"],
            document["mime_type"],
            [
                {
                    "format_code": row["format_code"],
                    "bbox": bboxes[i],
                    "options": options[i],
                }
                for i, row in enumerate(rows)
            ],
        )

    return {
        "draft": {"id": draft["id"], "status": draft["status"], "step": draft["step"]},
        "document": {"page_count": document["page_count"] if document else 0},
        "fields": [
            {
                "field_id": row["id"],
                "label": row["label"],
                "format_code": row["format_code"],
                "format_label": row["format_label"],
                "format_example": row["format_example"],
                # long_text·choice·signature는 input_format.pattern이 NULL이라 null
                "pattern": row["pattern"],
                "required": bool(row["required"])
                if row["required"] is not None
                else None,
                "prior_info_key": row["prior_info_key"],
                "description": row["description"],
                "options": options[i],
                "bbox": bboxes[i],
                **spots[i],
            }
            for i, row in enumerate(rows)
        ],
    }


@router.post("/drafts/{draft_id}/writing:start")
def start_writing(draft_id: int, user: Annotated[dict, Depends(auth.current_user)]):
    """항목 2. prior_info → writing. 사전 정보는 브라우저에만 있어 다 입력됐는지는 화면이 확인한 뒤 부른다."""
    conn = db.connect()
    try:
        draft = _load_owned(conn, draft_id, user)
        _check_state(draft, {"prior_info"})
        # 동시 호출: 조건이 있는 UPDATE 하나로 확인과 반영을 한 번에 한다 (drafts.py 제출·취소와 같은 방식)
        with conn:
            updated = conn.execute(
                "UPDATE draft SET step = 'writing' "
                "WHERE id = ? AND step = 'prior_info' AND status = '수정'",
                (draft_id,),
            )
            if updated.rowcount == 0:
                raise HTTPException(
                    status_code=409, detail={"code": "DRAFT_STEP_INVALID"}
                )
    finally:
        conn.close()
    return {"draft": {"id": draft_id, "status": "수정", "step": "writing"}}


@router.get("/drafts/{draft_id}/document/pages/{page}")
def get_page_image(
    draft_id: int, page: int, user: Annotated[dict, Depends(auth.current_user)]
):
    """원본 한 페이지를 이미지로 준다 (page는 1부터). **명세에 없는 API다.**

    FIELD-CHECK-API.md·DOC-UPLOAD-API.md "아직 없는 항목: 원본 파일 보기 API"를 가상 작성 화면에 필요한 만큼만 채운다.
    PDF는 서버(pymupdf)가 PNG로 그려 주므로 화면에 PDF 뷰어(pdf.js) 의존성이 필요 없다. 이미지는 원본 그대로 준다.
    올린 본인만, 취소되지 않은 작성 건만 (취소하면 문서가 지워진다).
    """
    conn = db.connect()
    try:
        draft = _load_owned(conn, draft_id, user)
        document = conn.execute(
            "SELECT file_path, mime_type, page_count FROM document WHERE draft_id = ?",
            (draft_id,),
        ).fetchone()
    finally:
        conn.close()

    if draft["status"] == "취소" or document is None:
        raise HTTPException(status_code=404, detail={"code": "DOCUMENT_NOT_FOUND"})
    if page < 1 or page > document["page_count"]:
        raise HTTPException(status_code=404, detail={"code": "PAGE_NOT_FOUND"})
    file_path = Path(document["file_path"])
    if not file_path.exists():
        raise HTTPException(status_code=404, detail={"code": "DOCUMENT_NOT_FOUND"})

    if document["mime_type"] != "application/pdf":
        return FileResponse(
            file_path, media_type=document["mime_type"], headers=NO_STORE
        )

    import pymupdf

    with pymupdf.open(file_path) as pdf:
        png = pdf[page - 1].get_pixmap(dpi=PAGE_IMAGE_DPI).tobytes("png")
    return Response(content=png, media_type="image/png", headers=NO_STORE)
