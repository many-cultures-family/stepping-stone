"""F-05 단어·문장 설명 — 기본 설명 조회와 가린 문서 글자 조회 (WORD-EXPLAIN-API.md 항목 1·3).

항목 2(쉬운 풀이 POST .../explanations, L2)는 이 파일에 없다.
"""

import re
from typing import Annotated

from fastapi import APIRouter, Depends, HTTPException

from app import auth, db

router = APIRouter(prefix="/api")

# 항목 1 입력 상한: input_format name 상한 50자에 맞춤
MAX_TERM_LENGTH = 50
# 항목 3 전제 상태: field_check 이후 단계
TEXT_STEPS = {"field_check", "prior_info", "writing", "review"}
# masked_text 한 줄: "@p<페이지> x,y,w,h | 가린 글자" (OCR-API.md "masked_text 모양", documents.format_masked_text)
_LINE = re.compile(r"^@p(\d+) (\d*\.?\d+),(\d*\.?\d+),(\d*\.?\d+),(\d*\.?\d+) \| (.*)$")


@router.get("/glossary")
def get_glossary(
    user: Annotated[dict, Depends(auth.current_user)], term: str | None = None
):
    """항목 1. (term, user.language)가 정확히 같은 행을 찾는다. LLM을 부르지 않는다 (R5)"""
    term = (term or "").strip()
    if not term:
        raise HTTPException(status_code=400, detail={"code": "TERM_REQUIRED"})
    if len(term) > MAX_TERM_LENGTH:
        raise HTTPException(status_code=400, detail={"code": "TERM_TOO_LONG"})
    conn = db.connect()
    try:
        row = conn.execute(
            "SELECT term, explanation FROM glossary_term WHERE term = ? AND language = ?",
            (term, user["language"]),
        ).fetchone()
    finally:
        conn.close()
    if row is None:
        # 사전에 없거나 이 언어 설명이 없음 → 200 found:false (화면은 '이해하지 못함'만 보여 준다)
        return {"found": False, "term": term}
    return {
        "found": True,
        "term": row["term"],
        "explanation": row["explanation"],
        "source": "glossary",
    }


def parse_masked_text(masked_text):
    """masked_text를 줄 목록으로 푼다. 위치 표기가 없는 줄(이전 모양)은 page·bbox를 null로 둔다"""
    lines = []
    for raw in masked_text.splitlines():
        if not raw.strip():
            continue
        m = _LINE.match(raw)
        if m is None:
            lines.append({"page": None, "bbox": None, "text": raw})
            continue
        page, x, y, w, h, text = m.groups()
        lines.append(
            {
                "page": int(page),
                "bbox": {"x": float(x), "y": float(y), "w": float(w), "h": float(h)},
                "text": text,
            }
        )
    return lines


@router.get("/drafts/{draft_id}/document/text")
def get_document_text(draft_id: int, user: Annotated[dict, Depends(auth.current_user)]):
    """항목 3. 저장된 가린 글자만 돌려준다. 가리기 전 글자는 서버에 없다"""
    conn = db.connect()
    try:
        draft = conn.execute(
            "SELECT d.user_id, d.status, d.step, doc.masked_text FROM draft d "
            "LEFT JOIN document doc ON doc.draft_id = d.id WHERE d.id = ?",
            (draft_id,),
        ).fetchone()
    finally:
        conn.close()
    if draft is None:
        raise HTTPException(status_code=404, detail={"code": "DRAFT_NOT_FOUND"})
    if draft["user_id"] != user["id"]:
        raise HTTPException(status_code=403, detail={"code": "FORBIDDEN_DRAFT"})
    if draft["status"] != "수정":
        raise HTTPException(status_code=409, detail={"code": "DRAFT_NOT_EDITABLE"})
    if draft["step"] not in TEXT_STEPS:
        raise HTTPException(status_code=409, detail={"code": "DRAFT_STEP_INVALID"})
    masked_text = draft["masked_text"] or ""
    if not masked_text.strip():
        raise HTTPException(status_code=422, detail={"code": "DOCUMENT_NOT_READY"})
    return {"lines": parse_masked_text(masked_text)}
