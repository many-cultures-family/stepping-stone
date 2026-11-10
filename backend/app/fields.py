# F-02 입력 항목 추론·확정 (FIELD-CHECK-API.md, US-02·US-03)
import json

from fastapi import APIRouter, HTTPException, Request

from app import db, llm

router = APIRouter(prefix="/api")

# L1이 고를 수 있는 입력 형식 허용 목록 (DATA-MODEL.md input_format.code, R2)
ALLOWED_FORMAT_CODES = {
    "phone",
    "date",
    "email",
    "number",
    "name",
    "address",
    "short_text",
    "long_text",
    "choice",
}

# 작성 건 하나에 재분석 3회까지 (DATA-MODEL.md 44행 [제안])
MAX_REANALYSIS_COUNT = 3


def _load_draft_for_field_check(conn, draft_id):
    row = conn.execute(
        "SELECT id, user_id, status, step, fields_confirmed_at, reanalysis_count "
        "FROM draft WHERE id = ?",
        (draft_id,),
    ).fetchone()
    if row is None:
        raise HTTPException(status_code=404, detail={"code": "DRAFT_NOT_FOUND"})
    if row["step"] != "field_check":
        raise HTTPException(status_code=409, detail={"code": "DRAFT_STEP_INVALID"})
    if row["status"] != "수정":
        raise HTTPException(status_code=409, detail={"code": "DRAFT_NOT_EDITABLE"})
    return row


def _row_to_field(row, input_formats):
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
        "description": row["description"],
        "bbox": json.loads(row["bbox"]),
        "flagged_wrong": bool(row["flagged_wrong"]),
    }


def compute_errors(fields):
    """저장하지 않고 조회·확정 때마다 그 자리에서 계산한다
    (FIELD-CHECK-API.md, DATA-MODEL.md 86행과 같은 방식). 한 항목에 오류는 최대 1개."""
    errors = []
    for field in fields:
        if field["format_code"] not in ALLOWED_FORMAT_CODES:
            errors.append({"field_id": field["id"], "code": "FORMAT_CODE_INVALID"})
        elif field["required"] is None:
            errors.append({"field_id": field["id"], "code": "REQUIRED_MISSING"})
    return errors


def _fetch_fields(conn, draft_id):
    input_formats = {
        row["code"]: row for row in conn.execute("SELECT * FROM input_format")
    }
    rows = conn.execute(
        "SELECT * FROM form_field WHERE draft_id = ? ORDER BY id", (draft_id,)
    ).fetchall()
    return [_row_to_field(row, input_formats) for row in rows]


def _to_int_bool(value):
    if value is None:
        return None
    return 1 if value else 0


def _insert_fields(conn, draft_id, llm_fields):
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


@router.get("/drafts/{draft_id}/fields")
def get_fields(draft_id: int):
    conn = db.connect()
    try:
        draft = _load_draft_for_field_check(conn, draft_id)
        fields = _fetch_fields(conn, draft_id)
    finally:
        conn.close()

    response = {"draft": _draft_response(draft), "fields": fields}
    errors = compute_errors(fields)
    if errors:
        response["errors"] = errors
    return response


async def _read_body(request: Request):
    raw = await request.body()
    if not raw:
        return {}
    try:
        body = json.loads(raw)
    except ValueError:
        return {}
    return body if isinstance(body, dict) else {}


@router.post("/drafts/{draft_id}/fields:infer")
async def infer_fields(draft_id: int, request: Request):
    body = await _read_body(request)
    has_flagged_key = "flagged_field_ids" in body
    flagged_field_ids = body.get("flagged_field_ids") or []

    conn = db.connect()
    try:
        draft = _load_draft_for_field_check(conn, draft_id)
        existing_fields = _fetch_fields(conn, draft_id)

        if has_flagged_key and not flagged_field_ids:
            raise HTTPException(status_code=400, detail={"code": "NO_FIELDS_FLAGGED"})

        is_reanalysis = has_flagged_key and bool(flagged_field_ids)

        if not is_reanalysis:
            # 키 없음: 기존 fields가 있으면 중복 호출이라 L1을 다시 부르지 않는다 (멱등성)
            if existing_fields:
                response = {"draft": _draft_response(draft), "fields": existing_fields}
                errors = compute_errors(existing_fields)
                if errors:
                    response["errors"] = errors
                return response
        else:
            known_ids = {f["id"] for f in existing_fields}
            if not set(flagged_field_ids) <= known_ids:
                raise HTTPException(status_code=404, detail={"code": "FIELD_NOT_FOUND"})
            if draft["reanalysis_count"] >= MAX_REANALYSIS_COUNT:
                raise HTTPException(
                    status_code=409, detail={"code": "REANALYSIS_LIMIT_EXCEEDED"}
                )

        user = conn.execute(
            "SELECT language FROM user WHERE id = ?", (draft["user_id"],)
        ).fetchone()
        document = conn.execute(
            "SELECT masked_text FROM document WHERE draft_id = ?", (draft_id,)
        ).fetchone()

        try:
            llm_fields = llm.infer_fields(
                masked_text=(document["masked_text"] if document else "") or "",
                language=user["language"],
                existing_fields=existing_fields if is_reanalysis else None,
                flagged_field_ids=flagged_field_ids if is_reanalysis else None,
            )
        except llm.LLMCallError:
            # 상태·단계는 바꾸지 않고 사용자가 다시 시도할 수 있게 한다 (FIELD-CHECK-API.md)
            raise HTTPException(status_code=502, detail={"code": "LLM_CALL_FAILED"})

        with conn:
            if is_reanalysis:
                _delete_fields(conn, draft_id)
            _insert_fields(conn, draft_id, llm_fields)
            if is_reanalysis:
                conn.execute(
                    "UPDATE draft SET reanalysis_count = reanalysis_count + 1, "
                    "fields_confirmed_at = NULL WHERE id = ?",
                    (draft_id,),
                )
        draft = conn.execute(
            "SELECT id, user_id, status, step, fields_confirmed_at, reanalysis_count "
            "FROM draft WHERE id = ?",
            (draft_id,),
        ).fetchone()
        fields = _fetch_fields(conn, draft_id)
    finally:
        conn.close()

    response = {"draft": _draft_response(draft), "fields": fields}
    errors = compute_errors(fields)
    if errors:
        response["errors"] = errors
    return response


@router.post("/drafts/{draft_id}/fields:confirm")
def confirm_fields(draft_id: int):
    conn = db.connect()
    try:
        draft = _load_draft_for_field_check(conn, draft_id)
        fields = _fetch_fields(conn, draft_id)
        errors = compute_errors(fields)
        if errors:
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
