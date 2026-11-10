# 서술형 답변 검토 (F-06, US-05, L3). [제안] — F-06 API 명세(docs/api)가 아직 없어서
# 경로·응답 모양은 frontend/src/api/review.js의 주석([제안])을 그대로 따른다.
# 명세가 나오면 이 파일만 고친다. 로그인·소유자 확인 필요(F-02와 같은 패턴).
from typing import Annotated

from fastapi import APIRouter, Depends, HTTPException, Request

from app import auth, db, llm

router = APIRouter(prefix="/api")

ALLOWED_DECISIONS = {"반영", "무시", "미결정"}


def _load_draft_for_review(conn, draft_id, user):
    row = conn.execute(
        "SELECT id, user_id, status, step FROM draft WHERE id = ?", (draft_id,)
    ).fetchone()
    if row is None:
        raise HTTPException(status_code=404, detail={"code": "DRAFT_NOT_FOUND"})
    if row["user_id"] != user["id"]:
        raise HTTPException(status_code=403, detail={"code": "FORBIDDEN_DRAFT"})
    if row["step"] != "review":
        raise HTTPException(status_code=409, detail={"code": "DRAFT_STEP_INVALID"})
    if row["status"] != "수정":
        raise HTTPException(status_code=409, detail={"code": "DRAFT_NOT_EDITABLE"})
    return row


def _fetch_long_text_answers(conn, draft_id):
    # 서술형(long_text) 항목의 답변만 검토 대상이다 (F-06)
    return conn.execute(
        "SELECT field_answer.id AS field_answer_id, form_field.label, "
        "form_field.guide_text, form_field.description, field_answer.value "
        "FROM field_answer "
        "JOIN form_field ON form_field.id = field_answer.form_field_id "
        "WHERE form_field.draft_id = ? AND form_field.format_code = 'long_text' "
        "ORDER BY field_answer.id",
        (draft_id,),
    ).fetchall()


def _answer_response(row):
    return {
        "id": row["field_answer_id"],
        "label": row["label"],
        "guide": row["guide_text"] or row["description"],
        "value": row["value"] or "",
    }


def _fetch_suggestions(conn, field_answer_ids):
    if not field_answer_ids:
        return []
    placeholders = ", ".join("?" for _ in field_answer_ids)
    rows = conn.execute(
        "SELECT id, field_answer_id, kind, suggested_text, explanation, decision "
        f"FROM review_suggestion WHERE field_answer_id IN ({placeholders}) ORDER BY id",
        field_answer_ids,
    ).fetchall()
    return [dict(row) for row in rows]


def _insert_suggestions(conn, suggestions):
    for item in suggestions:
        conn.execute(
            "INSERT INTO review_suggestion "
            "(field_answer_id, kind, suggested_text, explanation) VALUES (?, ?, ?, ?)",
            (
                item["field_answer_id"],
                item["kind"],
                item.get("suggested_text"),
                item["explanation"],
            ),
        )


@router.get("/drafts/{draft_id}/review")
def get_review(draft_id: int, user: Annotated[dict, Depends(auth.current_user)]):
    conn = db.connect()
    try:
        _load_draft_for_review(conn, draft_id, user)
        rows = _fetch_long_text_answers(conn, draft_id)
    finally:
        conn.close()
    return {"answers": [_answer_response(row) for row in rows]}


@router.post("/drafts/{draft_id}/review:request")
def request_review(draft_id: int, user: Annotated[dict, Depends(auth.current_user)]):
    conn = db.connect()
    try:
        _load_draft_for_review(conn, draft_id, user)
        rows = _fetch_long_text_answers(conn, draft_id)
        if not rows:
            return {"suggestions": []}
        if any(not (row["value"] or "").strip() for row in rows):
            raise HTTPException(status_code=400, detail={"code": "ANSWER_EMPTY"})

        field_answer_ids = [row["field_answer_id"] for row in rows]
        existing = _fetch_suggestions(conn, field_answer_ids)
        if existing:
            # 이미 검토한 적 있으면 L3을 다시 부르지 않는다 (fields:infer와 같은 멱등성)
            return {"suggestions": existing}

        try:
            llm_suggestions = llm.review_answers(
                answers=[
                    {
                        "field_answer_id": row["field_answer_id"],
                        "label": row["label"],
                        "guide_text": row["guide_text"] or row["description"],
                        "value": row["value"],
                    }
                    for row in rows
                ],
                language=user["language"],
            )
        except llm.LLMCallError:
            raise HTTPException(status_code=502, detail={"code": "LLM_CALL_FAILED"})

        # 동시 호출 레이스 방지: F-02 fields:infer와 같은 이유로 저장 직전에 다시 확인한다
        conn.execute("BEGIN IMMEDIATE")
        try:
            existing = _fetch_suggestions(conn, field_answer_ids)
            if not existing:
                _insert_suggestions(conn, llm_suggestions)
            conn.commit()
        except Exception:
            conn.rollback()
            raise
        suggestions = _fetch_suggestions(conn, field_answer_ids)
    finally:
        conn.close()
    return {"suggestions": suggestions}


@router.patch("/drafts/{draft_id}/review/suggestions/{suggestion_id}")
async def decide_suggestion(
    draft_id: int,
    suggestion_id: int,
    request: Request,
    user: Annotated[dict, Depends(auth.current_user)],
):
    try:
        body = await request.json()
    except ValueError:
        body = None
    decision = body.get("decision") if isinstance(body, dict) else None
    if decision not in ALLOWED_DECISIONS:
        raise HTTPException(status_code=400, detail={"code": "DECISION_INVALID"})

    conn = db.connect()
    try:
        _load_draft_for_review(conn, draft_id, user)
        row = conn.execute(
            "SELECT review_suggestion.id FROM review_suggestion "
            "JOIN field_answer ON field_answer.id = review_suggestion.field_answer_id "
            "JOIN form_field ON form_field.id = field_answer.form_field_id "
            "WHERE review_suggestion.id = ? AND form_field.draft_id = ?",
            (suggestion_id, draft_id),
        ).fetchone()
        if row is None:
            raise HTTPException(
                status_code=404, detail={"code": "SUGGESTION_NOT_FOUND"}
            )
        with conn:
            conn.execute(
                "UPDATE review_suggestion SET decision = ? WHERE id = ?",
                (decision, suggestion_id),
            )
    finally:
        conn.close()
    return {"id": suggestion_id, "decision": decision}
