"""F-05 쉬운 풀이 요청 — '이해하지 못함' (WORD-EXPLAIN-API.md 항목 2, 03 3-4 L2).

`easy_explanation.selected_text`는 서버에 저장되고 사용자 사이에 같이 쓰므로(R5), 개인정보가 들어가지 않게
두 단계로 막는다: ① 이 작성 건의 이미 가린 문서 글자 안에 그대로 있는 말만 받는다 ② 그래도 detect_pii로 다시 검사한다.
"""

import json
import logging
import re
from typing import Annotated

from fastapi import APIRouter, Depends, HTTPException, Request

from app import auth, db, llm, privacy
from app.glossary import parse_masked_text

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/api")

# 입력 상한: input_format short_text 상한 100자에 맞춤
MAX_TEXT_LENGTH = 100
# 작성 건 하나에 새로 L2를 부르는 횟수 (저장된 풀이를 돌려주는 경우는 세지 않는다)
MAX_EXPLANATION_COUNT = 20
# 전제 상태: 가상 작성·검토 단계 (VIRTUAL-FORM-API.md 항목 1 GET .../form과 같음)
EXPLAIN_STEPS = {"writing", "review"}

_SPACES = re.compile(r"\s+")


def _squash(text):
    # 화면은 고른 글자의 공백을 하나로 줄여 보낸다. 비교도 같은 모양으로 한다
    return _SPACES.sub(" ", text or "").strip()


def _document_texts(conn, draft_id, masked_text):
    """화면이 실제로 받아 보여 주는 가린 글자들: 문서 본문 줄, 칸 이름·설명·선택지, 서술형 안내 문구"""
    texts = [" ".join(line["text"] for line in parse_masked_text(masked_text or ""))]
    rows = conn.execute(
        "SELECT label, description, options, guide_text FROM form_field WHERE draft_id = ?",
        (draft_id,),
    ).fetchall()
    for row in rows:
        texts += [row["label"], row["description"], row["guide_text"]]
        if row["options"]:
            try:
                options = json.loads(row["options"])
            except ValueError:
                options = []
            if isinstance(options, list):
                texts += [o for o in options if isinstance(o, str)]
    return [_squash(t) for t in texts if t]


async def _read_selected_text(request):
    try:
        body = await request.json()
    except ValueError:
        body = None
    value = body.get("selected_text") if isinstance(body, dict) else None
    text = _squash(value) if isinstance(value, str) else ""
    if not text:
        raise HTTPException(status_code=400, detail={"code": "TEXT_REQUIRED"})
    if len(text) > MAX_TEXT_LENGTH:
        raise HTTPException(status_code=400, detail={"code": "TEXT_TOO_LONG"})
    return text


def _response(selected_text, explanation):
    return {"selected_text": selected_text, "explanation": explanation, "source": "ai"}


@router.post("/drafts/{draft_id}/explanations")
async def request_explanation(
    draft_id: int,
    request: Request,
    user: Annotated[dict, Depends(auth.current_user)],
):
    language = user["language"]
    conn = db.connect()
    try:
        draft = conn.execute(
            "SELECT d.user_id, d.status, d.step, d.explanation_count, doc.masked_text "
            "FROM draft d LEFT JOIN document doc ON doc.draft_id = d.id WHERE d.id = ?",
            (draft_id,),
        ).fetchone()
        if draft is None:
            raise HTTPException(status_code=404, detail={"code": "DRAFT_NOT_FOUND"})
        if draft["user_id"] != user["id"]:
            raise HTTPException(status_code=403, detail={"code": "FORBIDDEN_DRAFT"})
        if draft["status"] != "수정":
            raise HTTPException(status_code=409, detail={"code": "DRAFT_NOT_EDITABLE"})
        if draft["step"] not in EXPLAIN_STEPS:
            raise HTTPException(status_code=409, detail={"code": "DRAFT_STEP_INVALID"})

        selected_text = await _read_selected_text(request)
        # ① 가린 문서 글자 안에 있는 말만 (사용자가 쓴 값·가리기 전 글자는 여기 없다)
        if not any(
            selected_text in t
            for t in _document_texts(conn, draft_id, draft["masked_text"])
        ):
            raise HTTPException(
                status_code=400, detail={"code": "TEXT_NOT_IN_DOCUMENT"}
            )
        # ② 서버 재검사 (서술형과 같은 규칙 한 벌)
        if privacy.detect_pii(selected_text):
            raise HTTPException(status_code=422, detail={"code": "PII_REMAINING"})

        # 저장된 풀이가 있으면 L2를 부르지 않는다 (R5 "같은 질문에 같은 설명"). 횟수 제한에 세지 않는다
        with conn:
            saved = conn.execute(
                "UPDATE easy_explanation SET request_count = request_count + 1 "
                "WHERE selected_text = ? AND language = ? RETURNING explanation",
                (selected_text, language),
            ).fetchone()
        if saved is not None:
            return _response(selected_text, saved["explanation"])

        if draft["explanation_count"] >= MAX_EXPLANATION_COUNT:
            raise HTTPException(
                status_code=409, detail={"code": "EXPLANATION_LIMIT_EXCEEDED"}
            )
        term = conn.execute(
            "SELECT id, explanation FROM glossary_term WHERE term = ? AND language = ?",
            (selected_text, language),
        ).fetchone()
    finally:
        conn.close()

    # L2 호출은 DB 연결 밖에서 한다 (느린 외부 호출 동안 잠그지 않는다)
    try:
        explanation = llm.explain_text(
            selected_text, language, term["explanation"] if term else None
        )
    except llm.LLMCallError as exc:
        logger.warning("L2 호출 실패 (draft %s): %s", draft_id, exc)
        raise HTTPException(
            status_code=502, detail={"code": "LLM_CALL_FAILED"}
        ) from None

    conn = db.connect()
    try:
        with conn:
            # 같은 글자를 동시에 요청해 먼저 저장된 풀이가 있으면 그것을 쓴다 (모두 같은 풀이를 받게)
            conn.execute(
                "INSERT INTO easy_explanation "
                "(selected_text, glossary_term_id, language, explanation, request_count) "
                "VALUES (?, ?, ?, ?, 1) ON CONFLICT (selected_text, language) "
                "DO UPDATE SET request_count = request_count + 1",
                (selected_text, term["id"] if term else None, language, explanation),
            )
            conn.execute(
                "UPDATE draft SET explanation_count = explanation_count + 1 WHERE id = ?",
                (draft_id,),
            )
            stored = conn.execute(
                "SELECT explanation FROM easy_explanation WHERE selected_text = ? AND language = ?",
                (selected_text, language),
            ).fetchone()
    finally:
        conn.close()
    return _response(selected_text, stored["explanation"])
