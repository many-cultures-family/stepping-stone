# F-02 입력 항목 추론·확정 (FIELD-CHECK-API.md, US-02·US-03). 로그인·소유자 확인 필요
import json
from typing import Annotated

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel

from app import auth, crypto, db, llm

router = APIRouter(prefix="/api")

# 작성 건 하나에 재분석 3회까지 (DATA-MODEL.md 44행 [제안])
MAX_REANALYSIS_COUNT = 3


class InferRequest(BaseModel):
    flagged_field_ids: list[int] | None = None


def _load_draft_for_field_check(conn, draft_id, user):
    row = conn.execute(
        "SELECT id, user_id, status, step, fields_confirmed_at, reanalysis_count "
        "FROM draft WHERE id = ?",
        (draft_id,),
    ).fetchone()
    if row is None:
        raise HTTPException(status_code=404, detail={"code": "DRAFT_NOT_FOUND"})
    if row["user_id"] != user["id"]:
        raise HTTPException(status_code=403, detail={"code": "FORBIDDEN_DRAFT"})
    if row["step"] != "field_check":
        raise HTTPException(status_code=409, detail={"code": "DRAFT_STEP_INVALID"})
    if row["status"] != "수정":
        raise HTTPException(status_code=409, detail={"code": "DRAFT_NOT_EDITABLE"})
    return row


def _row_to_field(row, input_formats, prior_info_values):
    fmt = input_formats.get(row["format_code"])
    required = row["required"]
    return {
        "id": row["id"],
        "label": row["label"],
        "format_code": row["format_code"],
        "format_label": fmt["label"] if fmt else None,
        "format_example": fmt["example"] if fmt else None,
        "required": bool(required) if required is not None else None,
        "prior_info_key": row["prior_info_key"],
        # 사전 정보 재사용(US-04): 이 항목이 사전 정보에 매핑돼 있고 사용자가 이미
        # 저장해 둔 값이 있으면 자동 입력 값으로 돌려준다. 없으면 null — 화면이 직접 입력받는다
        "prior_info_value": prior_info_values.get(row["prior_info_key"]),
        "description": row["description"],
        "bbox": json.loads(row["bbox"]),
        "flagged_wrong": bool(row["flagged_wrong"]),
    }


def _allowed_format_codes(conn):
    # input_format이 R2 허용 목록의 단일 출처다 (F-02 리뷰 — 코드 상수와 DB가 따로
    # 있으면 어긋난다). 상수로 중복해서 들고 있지 않는다
    return {row["code"] for row in conn.execute("SELECT code FROM input_format")}


def compute_errors(fields, allowed_format_codes):
    """저장하지 않고 조회·확정 때마다 그 자리에서 계산한다
    (FIELD-CHECK-API.md, DATA-MODEL.md 86행과 같은 방식). 한 항목에 오류는 최대 1개."""
    errors = []
    for field in fields:
        if field["format_code"] not in allowed_format_codes:
            errors.append({"field_id": field["id"], "code": "FORMAT_CODE_INVALID"})
        elif field["required"] is None:
            errors.append({"field_id": field["id"], "code": "REQUIRED_MISSING"})
    return errors


def _fetch_prior_info_values(conn, user_id):
    rows = conn.execute(
        "SELECT info_key, value FROM prior_info WHERE user_id = ?", (user_id,)
    ).fetchall()
    return {row["info_key"]: crypto.decrypt_value(row["value"]) for row in rows}


def _fetch_fields(conn, draft_id, user_id):
    input_formats = {
        row["code"]: row for row in conn.execute("SELECT * FROM input_format")
    }
    prior_info_values = _fetch_prior_info_values(conn, user_id)
    rows = conn.execute(
        "SELECT * FROM form_field WHERE draft_id = ? ORDER BY id", (draft_id,)
    ).fetchall()
    return [_row_to_field(row, input_formats, prior_info_values) for row in rows]


def _to_int_bool(value):
    if value is None:
        return None
    return 1 if value else 0


def _insert_fields(conn, draft_id, llm_fields):
    # llm.infer_fields가 이미 항목별 타입을 검사했으므로(app/llm.py _validate_field_shape)
    # 여기서는 저장 형식(JSON 문자열 등)으로 바꾸기만 한다
    for item in llm_fields:
        conn.execute(
            "INSERT INTO form_field (draft_id, label, format_code, required, "
            "prior_info_key, description, guide_text, options, bbox, flagged_wrong) "
            "VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 0)",
            (
                draft_id,
                item.get("label") or "",
                item.get("format_code"),
                _to_int_bool(item.get("required")),
                item.get("prior_info_key"),
                item.get("description") or "",
                item.get("guide_text"),
                json.dumps(item["options"]) if item.get("options") else None,
                json.dumps(item.get("bbox") or {}),
            ),
        )


def _delete_fields(conn, draft_id):
    conn.execute(
        "DELETE FROM field_answer WHERE form_field_id IN "
        "(SELECT id FROM form_field WHERE draft_id = ?)",
        (draft_id,),
    )
    conn.execute("DELETE FROM form_field WHERE draft_id = ?", (draft_id,))


def _draft_response(draft_row):
    return {
        "id": draft_row["id"],
        "status": draft_row["status"],
        "step": draft_row["step"],
        "fields_confirmed_at": db.to_iso_z(draft_row["fields_confirmed_at"]),
        "reanalysis_count": draft_row["reanalysis_count"],
    }


def _fields_response(draft_row, fields, allowed_format_codes):
    response = {"draft": _draft_response(draft_row), "fields": fields}
    errors = compute_errors(fields, allowed_format_codes)
    if errors:
        response["errors"] = errors
    return response


@router.get("/drafts/{draft_id}/fields")
def get_fields(draft_id: int, user: Annotated[dict, Depends(auth.current_user)]):
    conn = db.connect()
    try:
        draft = _load_draft_for_field_check(conn, draft_id, user)
        fields = _fetch_fields(conn, draft_id, user["id"])
        allowed_format_codes = _allowed_format_codes(conn)
    finally:
        conn.close()

    return _fields_response(draft, fields, allowed_format_codes)


@router.post("/drafts/{draft_id}/fields:infer")
def infer_fields(
    draft_id: int,
    user: Annotated[dict, Depends(auth.current_user)],
    body: InferRequest | None = None,
):
    # 키 유무를 본문의 model_fields_set으로 구분한다: 키가 아예 없음(최초/중복 호출) /
    # 키는 있지만 빈 배열(거절) / 값이 있음(재분석) — 세 경우를 섞으면 안 된다
    has_flagged_key = body is not None and "flagged_field_ids" in body.model_fields_set
    flagged_field_ids = (body.flagged_field_ids if body else None) or []

    conn = db.connect()
    try:
        draft = _load_draft_for_field_check(conn, draft_id, user)
        existing_fields = _fetch_fields(conn, draft_id, user["id"])
        allowed_format_codes = _allowed_format_codes(conn)

        if has_flagged_key and not flagged_field_ids:
            raise HTTPException(status_code=400, detail={"code": "NO_FIELDS_FLAGGED"})

        is_reanalysis = has_flagged_key and bool(flagged_field_ids)

        if not is_reanalysis:
            # 키 없음: 기존 fields가 있으면 중복 호출이라 L1을 다시 부르지 않는다 (멱등성)
            if existing_fields:
                return _fields_response(draft, existing_fields, allowed_format_codes)
        else:
            known_ids = {f["id"] for f in existing_fields}
            if not set(flagged_field_ids) <= known_ids:
                raise HTTPException(status_code=404, detail={"code": "FIELD_NOT_FOUND"})
            if draft["reanalysis_count"] >= MAX_REANALYSIS_COUNT:
                raise HTTPException(
                    status_code=409, detail={"code": "REANALYSIS_LIMIT_EXCEEDED"}
                )

        document = conn.execute(
            "SELECT masked_text FROM document WHERE draft_id = ?", (draft_id,)
        ).fetchone()
        masked_text = (document["masked_text"] if document else None) or ""
        if not masked_text.strip():
            # OCR이 아직 안 됐거나 실패한 작성 건(DATA-MODEL.md "인식 실패면 비어 있다",
            # R1 반려 OCR_FAILED 대상)이다. 빈 텍스트로 L1을 부르면 없는 항목을
            # 지어내므로 호출 전에 막는다. 팀 확정: 422 DOCUMENT_NOT_READY
            raise HTTPException(status_code=422, detail={"code": "DOCUMENT_NOT_READY"})

        try:
            llm_fields = llm.infer_fields(
                masked_text=masked_text,
                language=user["language"],
                existing_fields=existing_fields if is_reanalysis else None,
                flagged_field_ids=flagged_field_ids if is_reanalysis else None,
            )
        except llm.LLMCallError:
            # 상태·단계는 바꾸지 않고 사용자가 다시 시도할 수 있게 한다 (FIELD-CHECK-API.md)
            raise HTTPException(status_code=502, detail={"code": "LLM_CALL_FAILED"})

        # 동시 호출 레이스 방지: L1 호출(몇 초 걸림)이 끝난 뒤 저장 직전에 다시 한번
        # 확인한다. BEGIN IMMEDIATE로 쓰기 잠금을 먼저 잡아 두 요청이 동시에 이
        # 구간을 통과하지 못하게 한다 (F-02 리뷰 — 안 그러면 버튼을 두 번 누르는
        # 것만으로 항목이 중복 저장되거나 재분석 횟수 한도를 넘길 수 있었다)
        conn.execute("BEGIN IMMEDIATE")
        try:
            if is_reanalysis:
                updated = conn.execute(
                    "UPDATE draft SET reanalysis_count = reanalysis_count + 1, "
                    "fields_confirmed_at = NULL WHERE id = ? AND reanalysis_count < ?",
                    (draft_id, MAX_REANALYSIS_COUNT),
                )
                if updated.rowcount == 0:
                    conn.rollback()
                    raise HTTPException(
                        status_code=409, detail={"code": "REANALYSIS_LIMIT_EXCEEDED"}
                    )
                _delete_fields(conn, draft_id)
                _insert_fields(conn, draft_id, llm_fields)
            else:
                current_count = conn.execute(
                    "SELECT COUNT(*) FROM form_field WHERE draft_id = ?", (draft_id,)
                ).fetchone()[0]
                if current_count == 0:
                    _insert_fields(conn, draft_id, llm_fields)
                # current_count > 0: 그 사이 다른 요청이 이미 저장했다. 중복 삽입 안 함
            conn.commit()
        except HTTPException:
            raise
        except Exception:
            conn.rollback()
            raise

        draft = conn.execute(
            "SELECT id, user_id, status, step, fields_confirmed_at, reanalysis_count "
            "FROM draft WHERE id = ?",
            (draft_id,),
        ).fetchone()
        fields = _fetch_fields(conn, draft_id, user["id"])
    finally:
        conn.close()

    return _fields_response(draft, fields, allowed_format_codes)


@router.post("/drafts/{draft_id}/fields:confirm")
def confirm_fields(draft_id: int, user: Annotated[dict, Depends(auth.current_user)]):
    conn = db.connect()
    try:
        draft = _load_draft_for_field_check(conn, draft_id, user)
        fields = _fetch_fields(conn, draft_id, user["id"])
        allowed_format_codes = _allowed_format_codes(conn)
        errors = compute_errors(fields, allowed_format_codes)
        # 항목이 하나도 없으면(아직 추론 전) 확정할 수 없다 — errors는 비어 있어도 거절한다
        if not fields or errors:
            raise HTTPException(
                status_code=400,
                detail={"code": "FIELDS_INVALID", "errors": errors},
            )

        with conn:
            conn.execute(
                "UPDATE draft SET fields_confirmed_at = CURRENT_TIMESTAMP, "
                "step = 'prior_info' WHERE id = ?",
                (draft_id,),
            )
        draft = conn.execute(
            "SELECT id, user_id, status, step, fields_confirmed_at, reanalysis_count "
            "FROM draft WHERE id = ?",
            (draft_id,),
        ).fetchone()
    finally:
        conn.close()

    return {"draft": _draft_response(draft)}
