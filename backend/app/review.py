# 서술형 답변 검토 (F-06, US-05, L3). [제안] — F-06 API 명세(docs/api)가 아직 없어서
# 경로·응답 모양은 frontend/src/api/review.js의 주석([제안])을 그대로 따른다.
# 명세가 나오면 이 파일만 고친다. 로그인·소유자 확인 필요(F-02와 같은 패턴).
from typing import Annotated

from fastapi import APIRouter, Depends, HTTPException, Request

from app import auth, db, llm, prior_info

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


def _mask_known_prior_info(text, prior_info_values):
    """L3(Gemini)에 보내기 전, 이 사용자가 이미 저장해 둔 사전 정보(이름·생년월일·연락처·
    주소)와 정확히 일치하는 부분을 가린다 (팀 리뷰 — 답변 원문이 마스킹 없이 L3로 전송되던
    문제). L1의 masked_text는 OCR 단계에서 일반 PII를 탐지해 가리지만, 그 마스킹 로직은
    이 저장소에 없다(다른 서비스가 문서를 가린 뒤 masked_text로 넘겨준다). 대신 L3는 이미
    로그인한 사용자 본인의 저장된 사전 정보 값을 알고 있으므로, 그 값과 정확히 일치하는
    문자열만 치환한다. 사전 정보에 없는 값(예: 제3자 이름, 저장 안 한 다른 연락처)은
    가리지 못하는 알려진 한계가 있다."""
    masked = text
    # 긴 값부터 바꿔서 짧은 값이 긴 값의 일부를 먼저 지워버리는 일이 없게 한다
    for info_key, value in sorted(
        prior_info_values.items(), key=lambda item: len(item[1] or ""), reverse=True
    ):
        if value and value.strip():
            masked = masked.replace(value, f"[{info_key}]")
    return masked


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

        prior_info_values = prior_info.fetch_prior_info_values(conn, user["id"])
        try:
            llm_suggestions = llm.review_answers(
                answers=[
                    {
                        "field_answer_id": row["field_answer_id"],
                        "label": row["label"],
                        "guide_text": row["guide_text"] or row["description"],
                        "value": _mask_known_prior_info(
                            row["value"], prior_info_values
                        ),
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
