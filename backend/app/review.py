"""F-06 서술형 답변 검토 — 서버 API (REVIEW-PRIVACY-API.md 항목 1·2·3, US-05).

서술형 답변·감지 결과·검토 제안은 서버에 저장하지 않는다 (no-server-storage-user-input.md).
서버는 이미 있는 것(form_field, draft, user.language)만 읽는다. 요청·응답 본문은 로그에 남기지 않는다.
PR #26(feat/f02-field-check-v2-leehyosang6950)의 review.py는 field_answer를 읽고 제안을 저장해서
명세 "기존 F-06 코드에서 바꿀 것"대로 main에서 다시 만들었다.
"""

import logging
import re
from typing import Annotated

from fastapi import APIRouter, Depends, HTTPException, Request

from app import auth, db, llm, privacy

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/api")

# 작성 건 하나에 L3를 부르는 횟수 (항목 3 "호출 횟수 제한"). 재검사 거절·L3 실패는 세지 않는다
MAX_REVIEW_COUNT = 5
# 브라우저가 쓰는 토큰 모양 [종류N]·[가림N] (l3-masking.md 4절). 종류 이름은 서버 마스킹 토큰과 같다
_TOKEN_KINDS = [t.strip("[]") for t in privacy.TOKENS.values()] + ["가림"]
TOKEN_RE = re.compile(
    r"\[(?:" + "|".join(map(re.escape, _TOKEN_KINDS)) + r")[1-9]\d*\]"
)
# 제안 속 토큰처럼 보이는 것 (⑦ 검사용): 대괄호로 감싼 글자 전부
_BRACKETED = re.compile(r"\[[^\[\]]*\]")


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


def _bad_request():
    return HTTPException(status_code=400, detail={"code": "INVALID_REVIEW_REQUEST"})


async def _read_answers(request):
    """항목 3 입력 ③: 본문 모양과 토큰 이름 검사. 틀리면 400 INVALID_REVIEW_REQUEST"""
    try:
        body = await request.json()
    except ValueError:
        raise _bad_request() from None
    answers = body.get("answers") if isinstance(body, dict) else None
    if not isinstance(answers, list):
        raise _bad_request()
    for a in answers:
        if not isinstance(a, dict):
            raise _bad_request()
        field_id, text, tokens = (
            a.get("form_field_id"),
            a.get("masked_text"),
            a.get("tokens"),
        )
        if not isinstance(field_id, int) or isinstance(field_id, bool):
            raise _bad_request()
        if not isinstance(text, str) or not isinstance(tokens, list):
            raise _bad_request()
        if not all(isinstance(t, str) and TOKEN_RE.fullmatch(t) for t in tokens):
            raise _bad_request()
    return answers


def _has_pii(masked_text):
    """⑤ 토큰을 지운 답변에 값 모양 규칙(privacy._PATTERNS)을 돌린다.

    브라우저 감지(①)가 GET /api/privacy-rules로 받는 규칙과 같은 한 벌이다 (항목 4 '규칙 한 벌').
    detect_pii의 라벨 규칙('주소'·'이름'·'연락처' 뒤 글자)은 OCR 문서용이라 쓰지 않는다 — 브라우저는 그 규칙을
    받지 않으므로, 쓰면 '이름은 [이름1]이고'처럼 바르게 가린 답변도 이유 없이 거절된다.
    """
    text = TOKEN_RE.sub(" ", masked_text)
    return any(pattern.search(text) for _, pattern in privacy._PATTERNS)


def _keep_suggestion(suggestion, tokens_by_field):
    """⑦ 제안의 고친 문장에 보낸 목록에 없는 토큰이 있거나 토큰 글자가 바뀌었으면 버린다. 토큰이 빠진 것은 둔다"""
    text = suggestion["suggested_text"]
    if not text:
        return True
    sent = tokens_by_field[suggestion["form_field_id"]]
    return all(t in sent for t in _BRACKETED.findall(text))


@router.post("/drafts/{draft_id}/review:request")
async def request_review(
    draft_id: int,
    request: Request,
    user: Annotated[dict, Depends(auth.current_user)],
):
    """항목 3. 가린 답변을 다시 검사한 뒤 L3에 중계한다. 답변·제안은 저장하지 않는다"""
    conn = db.connect()
    try:
        draft = load_draft(conn, draft_id, user, "review")
        answers = await _read_answers(request)
        fields = {row["id"]: row for row in long_text_fields(conn, draft_id)}
    finally:
        conn.close()

    # ① 이 작성 건의 서술형 칸이 아닌 id
    if any(a["form_field_id"] not in fields for a in answers):
        raise HTTPException(status_code=404, detail={"code": "FIELD_NOT_FOUND"})
    # ② 서술형 칸이 빠짐없이 한 번씩만 (화면이 칸을 빼고 보내 재검사를 건너뛰는 것을 막는다)
    sent_ids = [a["form_field_id"] for a in answers]
    missing = [fid for fid in fields if fid not in sent_ids]
    duplicated = sorted({fid for fid in sent_ids if sent_ids.count(fid) > 1})
    if missing or duplicated:
        raise HTTPException(
            status_code=400,
            detail={"code": "ANSWERS_INCOMPLETE", "field_ids": missing + duplicated},
        )
    if any(not a["masked_text"].strip() for a in answers):
        raise HTTPException(status_code=400, detail={"code": "ANSWER_EMPTY"})

    if not answers:
        # 서술형 칸이 0개인 작성 건: L3 없이 검토를 마친 것으로 본다 (횟수는 세지 않는다)
        _mark_reviewed(draft_id, count=False)
        return {"suggestions": []}

    if draft["review_count"] >= MAX_REVIEW_COUNT:
        raise HTTPException(status_code=409, detail={"code": "REVIEW_LIMIT_EXCEEDED"})

    # ⑤ 다시 검사. 걸린 글자·위치는 돌려주지 않는다
    leaked = [a["form_field_id"] for a in answers if _has_pii(a["masked_text"])]
    if leaked:
        logger.info("검토 요청 재검사 거절 (draft %s, 칸 %d개)", draft_id, len(leaked))
        raise HTTPException(
            status_code=422, detail={"code": "PII_REMAINING", "field_ids": leaked}
        )

    # ⑥ L3: 가린 답변, 칸 label·guide_text(서버 값), user.language
    try:
        suggestions = llm.review_answers(
            [
                {
                    "form_field_id": a["form_field_id"],
                    "label": fields[a["form_field_id"]]["label"],
                    "guide_text": fields[a["form_field_id"]]["guide_text"],
                    "masked_text": a["masked_text"],
                }
                for a in answers
            ],
            user["language"],
        )
    except llm.LLMCallError as exc:
        # 메시지 앞부분(원인 종류)만 남긴다. 뒤에는 L3 응답 글자가 들어 있을 수 있다 (본문은 로그에 남기지 않음)
        logger.warning("L3 호출 실패 (draft %s): %s", draft_id, str(exc).split(":")[0])
        raise HTTPException(
            status_code=502, detail={"code": "LLM_CALL_FAILED"}
        ) from None

    # ⑦ 제안 토큰 검사
    tokens_by_field = {a["form_field_id"]: set(a["tokens"]) for a in answers}
    kept = [s for s in suggestions if _keep_suggestion(s, tokens_by_field)]
    if len(kept) != len(suggestions):
        logger.info(
            "L3 제안 토큰 검사로 버림 (draft %s, %d개)",
            draft_id,
            len(suggestions) - len(kept),
        )

    _mark_reviewed(draft_id, count=True)
    return {"suggestions": kept}


def _mark_reviewed(draft_id, count):
    """reviewed_at 기록(항목 5가 확인), L3를 불렀으면 review_count +1. 그사이 상태가 바뀌었으면 409"""
    conn = db.connect()
    try:
        with conn:
            updated = conn.execute(
                "UPDATE draft SET reviewed_at = CURRENT_TIMESTAMP, "
                "review_count = review_count + ? "
                "WHERE id = ? AND status = '수정' AND step = 'review'",
                (1 if count else 0, draft_id),
            )
            if updated.rowcount == 0:
                raise HTTPException(
                    status_code=409, detail={"code": "DRAFT_STEP_INVALID"}
                )
    finally:
        conn.close()
