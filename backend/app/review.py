"""F-06 서술형 답변 검토 — 서버 API (REVIEW-PRIVACY-API.md 항목 1·2, US-05).

서술형 답변·감지 결과·검토 제안은 서버에 저장하지 않는다 (no-server-storage-user-input.md).
서버는 이미 있는 것(form_field, draft, user.language)만 읽는다. 요청·응답 본문은 로그에 남기지 않는다.
PR #26(feat/f02-field-check-v2-leehyosang6950)의 review.py는 field_answer를 읽고 제안을 저장해서
명세 "기존 F-06 코드에서 바꿀 것"대로 main에서 다시 만들었다.
"""

from typing import Annotated

from fastapi import APIRouter, Depends, HTTPException

from app import auth, db

router = APIRouter(prefix="/api")


def load_draft(conn, draft_id, user, step):
    """공통 규칙: 401(의존성)/404/403, status가 수정이 아니면 409 DRAFT_NOT_EDITABLE, 단계가 다르면 409 DRAFT_STEP_INVALID"""
    row = conn.execute(
        "SELECT id, user_id, status, step, fields_confirmed_at, review_count, reviewed_at "
        "FROM draft WHERE id = ?",
        (draft_id,),
    ).fetchone()
    if row is None:
        raise HTTPException(status_code=404, detail={"code": "DRAFT_NOT_FOUND"})
    if row["user_id"] != user["id"]:
        raise HTTPException(status_code=403, detail={"code": "FORBIDDEN_DRAFT"})
    if row["status"] != "수정":
        raise HTTPException(status_code=409, detail={"code": "DRAFT_NOT_EDITABLE"})
    if row["step"] != step:
        raise HTTPException(status_code=409, detail={"code": "DRAFT_STEP_INVALID"})
    return row


def long_text_fields(conn, draft_id):
    """검토 대상: format_code가 long_text(서술형)인 칸만, form_field id 순"""
    return conn.execute(
        "SELECT id, label, guide_text, description FROM form_field "
        "WHERE draft_id = ? AND format_code = 'long_text' ORDER BY id",
        (draft_id,),
    ).fetchall()


@router.post("/drafts/{draft_id}/review:start")
def start_review(draft_id: int, user: Annotated[dict, Depends(auth.current_user)]):
    """항목 1. writing → review. 입력 항목을 확정한 작성 건만. reviewed_at을 비운다"""
    conn = db.connect()
    try:
        draft = load_draft(conn, draft_id, user, "writing")
        if not draft["fields_confirmed_at"]:
            raise HTTPException(
                status_code=409, detail={"code": "FIELDS_NOT_CONFIRMED"}
            )
        # 동시 호출: 조건이 있는 UPDATE 하나로 확인과 반영을 한 번에 한다 (writing:start와 같은 방식)
        with conn:
            updated = conn.execute(
                "UPDATE draft SET step = 'review', reviewed_at = NULL "
                "WHERE id = ? AND step = 'writing' AND status = '수정' "
                "AND fields_confirmed_at IS NOT NULL",
                (draft_id,),
            )
            if updated.rowcount == 0:
                raise HTTPException(
                    status_code=409, detail={"code": "DRAFT_STEP_INVALID"}
                )
    finally:
        conn.close()
    return {"draft": {"id": draft_id, "status": "수정", "step": "review"}}


@router.get("/drafts/{draft_id}/review")
def get_review(draft_id: int, user: Annotated[dict, Depends(auth.current_user)]):
    """항목 2. 서술형 칸 목록. 답변은 서버에 없으므로 넣지 않는다 (화면이 칸 id로 짝짓는다)"""
    conn = db.connect()
    try:
        load_draft(conn, draft_id, user, "review")
        rows = long_text_fields(conn, draft_id)
    finally:
        conn.close()
    return {
        "fields": [
            {
                "id": row["id"],
                "label": row["label"],
                # guide_text가 없으면 description (기존 review.py 규칙)
                "guide": row["guide_text"] or row["description"],
            }
            for row in rows
        ]
    }
