# 사전 정보 조회·저장 (F-03, US-04). [제안] — F-03 API 명세(docs/api)가 아직 없어서
# 경로·응답 모양은 frontend/src/api/review.js와 같은 방식으로 [제안]을 달아 둔다.
# 명세가 나오면 이 파일과 frontend/src/api 아래 새 클라이언트만 고친다.
# 로그인 필요. 값은 crypto.py로 암·복호화해 DB에는 암호문만 남긴다 (개인정보 암호화 저장).
import re
from typing import Annotated

from fastapi import APIRouter, Depends, HTTPException, Request

from app import auth, crypto, db, llm

router = APIRouter(prefix="/api")

# info_key → input_format.code. input_format이 R2 허용 목록의 단일 출처이듯,
# 사전 정보 종류는 llm.PRIOR_INFO_KEYS가 단일 출처다 (F-02 리뷰와 같은 이유로 중복 상수를 두지 않음)
INFO_KEY_FORMAT_CODE = {
    "name": "name",
    "birth_date": "date",
    "phone": "phone",
    "address": "address",
}
assert set(INFO_KEY_FORMAT_CODE) == set(llm.PRIOR_INFO_KEYS)


def _allowed_format_codes(conn):
    return {
        row["code"]: row
        for row in conn.execute(
            "SELECT code, pattern, example FROM input_format WHERE code IN ({})".format(
                ", ".join("?" for _ in INFO_KEY_FORMAT_CODE.values())
            ),
            list(INFO_KEY_FORMAT_CODE.values()),
        )
    }


def _fetch_prior_info(conn, user_id):
    rows = conn.execute(
        "SELECT info_key, value, updated_at FROM prior_info WHERE user_id = ?",
        (user_id,),
    ).fetchall()
    return {row["info_key"]: row for row in rows}


def _prior_info_response(conn, user_id):
    saved = _fetch_prior_info(conn, user_id)
    result = {}
    for info_key, format_code in INFO_KEY_FORMAT_CODE.items():
        row = saved.get(info_key)
        result[info_key] = {
            "value": crypto.decrypt_value(row["value"]) if row else None,
            "format_code": format_code,
            "updated_at": db.to_iso_z(row["updated_at"]) if row else None,
        }
    return {"prior_info": result}


def compute_prior_info_errors(values, input_formats):
    """저장하지 않고 요청마다 그 자리에서 계산한다 (FIELD-CHECK-API.md compute_errors와 같은 방식).
    한 항목에 오류는 최대 1개. 빈 값(공백만 있는 값 포함)은 REQUIRED_MISSING으로 거절한다 —
    저장된 사전 정보는 다음 작성 건에서도 자동 입력으로 쓰이므로 빈 값을 저장해 두지 않는다."""
    errors = []
    for info_key, raw_value in values.items():
        value = (raw_value or "").strip()
        format_code = INFO_KEY_FORMAT_CODE[info_key]
        fmt = input_formats.get(format_code)
        if not value:
            errors.append({"info_key": info_key, "code": "REQUIRED_MISSING"})
        elif fmt and fmt["pattern"] and not re.match(fmt["pattern"], value):
            errors.append({"info_key": info_key, "code": "FORMAT_INVALID"})
    return errors


@router.get("/prior-info")
def get_prior_info(user: Annotated[dict, Depends(auth.current_user)]):
    conn = db.connect()
    try:
        response = _prior_info_response(conn, user["id"])
    finally:
        conn.close()
    return response


@router.put("/prior-info")
async def update_prior_info(
    request: Request, user: Annotated[dict, Depends(auth.current_user)]
):
    try:
        body = await request.json()
    except ValueError:
        body = None
    values = body.get("values") if isinstance(body, dict) else None
    if not isinstance(values, dict) or not values:
        raise HTTPException(status_code=400, detail={"code": "VALUES_REQUIRED"})
    if not set(values) <= set(INFO_KEY_FORMAT_CODE):
        raise HTTPException(status_code=400, detail={"code": "INFO_KEY_INVALID"})

    conn = db.connect()
    try:
        input_formats = _allowed_format_codes(conn)
        errors = compute_prior_info_errors(values, input_formats)
        if errors:
            raise HTTPException(
                status_code=400,
                detail={"code": "PRIOR_INFO_INVALID", "errors": errors},
            )

        with conn:
            for info_key, raw_value in values.items():
                value = raw_value.strip()
                conn.execute(
                    "INSERT INTO prior_info (user_id, info_key, format_code, value) "
                    "VALUES (?, ?, ?, ?) "
                    "ON CONFLICT (user_id, info_key) DO UPDATE SET "
                    "value = excluded.value, updated_at = CURRENT_TIMESTAMP",
                    (
                        user["id"],
                        info_key,
                        INFO_KEY_FORMAT_CODE[info_key],
                        crypto.encrypt_value(value),
                    ),
                )
        response = _prior_info_response(conn, user["id"])
    finally:
        conn.close()
    return response
