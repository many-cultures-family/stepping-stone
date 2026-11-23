# L1 입력 항목 추론 (03-rules-states-llm.md 3-4 L1). Gemini 호출은 서버 코드 중 이 파일에서만 한다
# (CLAUDE.md "LLM은 FastAPI 서버에서만 호출한다"). 모델명은 .env(GEMINI_MODEL)에서만 읽는다.
import json
import os
import urllib.error
import urllib.request

GEMINI_URL_TEMPLATE = (
    "https://generativelanguage.googleapis.com/v1beta/models/{model}:generateContent"
)

# Gemini가 고를 수 있는 입력 형식(R2)·사전 정보 종류(US-04). L1 응답 스키마에 그대로 쓴다
FORMAT_CODES = [
    "phone",
    "date",
    "email",
    "number",
    "name",
    "address",
    "short_text",
    "long_text",
    "choice",
    "signature",
]
PRIOR_INFO_KEYS = ["name", "birth_date", "phone", "address"]

# generationConfig.responseSchema — Gemini가 코드 펜스(```json)로 감싸거나 스키마에
# 안 맞는 응답을 주지 않도록 강제한다 (F-02 리뷰 — responseMimeType 없이는 응답이
# 마크다운으로 감싸져 json.loads가 항상 실패했다)
RESPONSE_SCHEMA = {
    "type": "ARRAY",
    "items": {
        "type": "OBJECT",
        "properties": {
            "label": {"type": "STRING"},
            "format_code": {"type": "STRING", "enum": FORMAT_CODES},
            "required": {"type": "BOOLEAN"},
            "prior_info_key": {
                "type": "STRING",
                "enum": PRIOR_INFO_KEYS,
                "nullable": True,
            },
            "description": {"type": "STRING"},
            # choice의 보기. 스키마에 없으면 Gemini가 아예 돌려주지 않아 선택형 보기가 늘 비었다
            "options": {"type": "ARRAY", "items": {"type": "STRING"}, "nullable": True},
            "bbox": {
                "type": "OBJECT",
                "properties": {
                    "page": {"type": "INTEGER"},
                    "x": {"type": "NUMBER"},
                    "y": {"type": "NUMBER"},
                    "w": {"type": "NUMBER"},
                    "h": {"type": "NUMBER"},
                },
                "required": ["page", "x", "y", "w", "h"],
            },
        },
        "required": ["label", "format_code", "required", "description", "bbox"],
    },
}


class LLMCallError(Exception):
    """L1 호출 실패(설정 누락·타임아웃·오류 응답·형식이 다른 응답). 재시도는 하지 않는다
    (FIELD-CHECK-API.md "L1 호출 실패 응답" [제안] — 호출부가 502 LLM_CALL_FAILED로 바꾼다)"""


def infer_fields(masked_text, language, existing_fields=None, flagged_field_ids=None):
    """L1을 호출해 입력 항목 목록을 추론한다.

    보내는 것: masked_text(개인정보를 가린 OCR 텍스트), language, 재분석이면
    existing_fields(기존 항목 전체)·flagged_field_ids만 추가로 보낸다.
    보내지 않는 것: 원본 파일, 가리기 전 OCR 텍스트, 사전 정보, 사용자가 입력한 값
    (DATA-MODEL.md "LLM에 보내지 않을 정보").

    반환: [{"label", "format_code", "required", "prior_info_key", "description", "bbox"}, ...]
    L1 출력은 신뢰하지 않고 형식을 검사한다. 재분석이면 응답 개수가 기존 항목
    개수와 같은지도 확인한다 — 다르면 표시 안 한 항목이 사라진 것이므로 거절한다
    (F-02 리뷰 — 프롬프트만 믿으면 L1이 표시한 항목만 돌려줘 나머지가 지워질 수 있다)
    """
    prompt = _build_prompt(masked_text, language, existing_fields, flagged_field_ids)
    response_text = _call_gemini(prompt)
    try:
        fields = json.loads(response_text)
    except ValueError as exc:
        raise LLMCallError(f"L1 응답이 JSON이 아님: {exc}") from exc
    if not isinstance(fields, list):
        raise LLMCallError("L1 응답이 배열이 아님")
    for item in fields:
        _validate_field_shape(item)
        _fill_consent_options(item)
    if flagged_field_ids and len(fields) != len(existing_fields or []):
        raise LLMCallError(
            f"재분석 응답 개수({len(fields)})가 기존 항목 개수"
            f"({len(existing_fields or [])})와 다름 — 항목이 사라졌을 수 있다"
        )
    return fields


CONSENT_OPTIONS = ["동의합니다", "동의하지 않습니다"]


def _fill_consent_options(item):
    """보기 없는 동의 여부 choice에 기본 보기를 넣는다. 동의는 예/아니오 둘 중 하나로 받아야 한다."""
    if (
        item.get("format_code") == "choice"
        and not item.get("options")
        and "동의" in (item.get("label") or "")
    ):
        item["options"] = list(CONSENT_OPTIONS)


def _validate_field_shape(item):
    """항목별 타입만 본다. format_code·required가 허용 목록 안인지(R2)는
    규칙 엔진(app/fields.py compute_errors) 몫이라 여기서 판정하지 않는다."""
    if not isinstance(item, dict):
        raise LLMCallError(f"L1 항목이 객체가 아님: {item!r}")
    for key in ("label", "format_code", "prior_info_key", "description", "guide_text"):
        value = item.get(key)
        if value is not None and not isinstance(value, str):
            raise LLMCallError(f"L1 항목의 {key}가 문자열이 아님: {value!r}")
    required = item.get("required")
    if required is not None and not isinstance(required, bool):
        raise LLMCallError(f"L1 항목의 required가 참거짓이 아님: {required!r}")
    bbox = item.get("bbox")
    if bbox is not None and not isinstance(bbox, dict):
        raise LLMCallError(f"L1 항목의 bbox가 객체가 아님: {bbox!r}")
    options = item.get("options")
    if options is not None and not isinstance(options, list):
        raise LLMCallError(f"L1 항목의 options가 배열이 아님: {options!r}")


def _build_prompt(masked_text, language, existing_fields, flagged_field_ids):
    field_keys = (
        "label(항목명), "
        "format_code(phone/date/email/number/name/address/short_text/long_text/choice/signature 중 하나), "
        "required(참거짓), prior_info_key(name/birth_date/phone/address 중 연결되는 것, 없으면 null), "
        f"description({language} 언어로 쓴 사용자용 설명), "
        "options(choice일 때 보기 글자 배열, 문서에 적힌 그대로·순서대로. choice가 아니면 null), "
        'bbox({"page":1,"x":0~1,"y":0~1,"w":0~1,"h":0~1}).'
    )
    parts = [
        (
            "다음은 신청서 양식에서 개인정보를 가린 뒤 추출한 텍스트다. "
            "이 문서의 입력 항목을 모두 찾아 JSON 배열로만 답하라."
        ),
        f"각 항목은 다음 키를 가진다: {field_keys}",
        # masked_text 모양 (OCR-API.md "L1 프롬프트에 넣을 지시")
        (
            "각 줄 앞 `@p<페이지> x,y,w,h |`는 그 줄의 위치 데이터다. 항목의 bbox는 이 값에서 고른다. "
            "대괄호 [이름]·[전화번호] 등은 가린 개인정보 토큰이므로 값을 짐작하지 말고, "
            "항목 이름·설명에 옮겨 쓰지 않는다."
        ),
        # 표 밖에 있는 칸도 입력 항목이다. 지시가 없으면 L1이 날짜줄·서명란을 항목으로 보지 않고 버렸다
        # (2026-11-23 실측: 표 안 4칸만 돌려줌)
        (
            "표 안의 칸뿐 아니라 문서 아래쪽의 칸도 입력 항목이다. "
            "'년 월 일'처럼 숫자 자리가 비어 있는 날짜 줄은 format_code를 date로 하는 항목이다. "
            "label은 앞뒤 문맥으로 정하고(예: 신청일, 작성일), 문맥이 없으면 '작성일'로 한다. "
            "'(인)', '(서명 또는 인)', '서명', '날인'이 있는 자리는 format_code를 signature로 하는 항목이다. "
            "label은 같은 줄의 사람 이름 칸을 붙여 정한다(예: 신청인 서명, 보호자 서명). "
            "'작성자 성명: ____ (인)'처럼 이름을 쓰는 빈칸과 서명 표시가 한 줄에 있으면 "
            "이름 칸(format_code name, label 예: 작성자 성명)과 서명 칸(signature, label 예: 작성자 서명) 두 항목으로 나누고, "
            "둘 다 그 줄의 위치 데이터를 bbox로 쓴다. "
            "signature 항목의 description에는 이 칸은 사용자가 실제 서류에 직접 서명하거나 도장을 찍는 칸이라고 쓴다. "
            "bbox는 그 줄의 위치 데이터에서 고른다."
        ),
        # 동의 여부 줄. □가 OCR에서 '다'·'n'·'더' 같은 글자로 읽히고, 보기 없이 choice만 오면
        # 화면이 고를 것을 못 보여 준다 (2026-11-23 실측: 동의서 3칸 모두 options 없음)
        (
            "체크 상자(□)는 OCR에서 '다', 'n', '더', 'ㅁ', '口', 'O' 같은 글자로 잘못 읽힐 수 있다. "
            "'동의합니다 □ 동의하지 않습니다 □'처럼 보기 뒤나 앞에 상자가 있는 줄은 하나의 choice 항목이다. "
            'options에는 상자 글자를 뺀 보기만 줄에 나온 순서대로 넣는다(예: ["동의합니다", "동의하지 않습니다"]). '
            "label은 그 줄 위의 제목으로 정한다(예: 개인정보 수집·이용 동의). "
            "예/아니오, 있음/없음, 남/여처럼 보기를 고르는 줄도 같다. 동의 여부 항목은 required를 true로 한다."
        ),
        f"사용 언어 코드: {language}",
        f"문서 텍스트:\n{masked_text}",
    ]
    if flagged_field_ids:
        parts.append(
            "다음은 지금까지 추론한 입력 항목 전체 목록이다: "
            f"{json.dumps(existing_fields or [], ensure_ascii=False)}"
        )
        parts.append(
            "사용자가 이 중 일부를 '원본과 다름'으로 표시했다. 표시한 항목 id: "
            f"{flagged_field_ids}. "
            "응답에는 표시하지 않은 항목도 모두 포함해 반드시 전체 목록(개수까지 동일)을 "
            "돌려주되, 표시한 항목만 내용을 고쳐서 다시 추론하라. "
            "표시하지 않은 항목은 받은 그대로 돌려준다."
        )
    return "\n\n".join(parts)


def _call_gemini(prompt):
    api_key = os.environ.get("GEMINI_API_KEY")
    model = os.environ.get("GEMINI_MODEL")
    if not api_key or not model:
        raise LLMCallError("GEMINI_API_KEY 또는 GEMINI_MODEL이 설정되지 않음")

    url = f"{GEMINI_URL_TEMPLATE.format(model=model)}?key={api_key}"
    body = json.dumps(
        {
            "contents": [{"parts": [{"text": prompt}]}],
            "generationConfig": {
                "responseMimeType": "application/json",
                "responseSchema": RESPONSE_SCHEMA,
            },
        }
    ).encode("utf-8")
    request = urllib.request.Request(
        url, data=body, headers={"Content-Type": "application/json"}, method="POST"
    )
    try:
        with urllib.request.urlopen(request, timeout=20) as response:
            payload = json.loads(response.read())
    except (urllib.error.URLError, TimeoutError, ValueError, OSError) as exc:
        raise LLMCallError(f"Gemini 호출 실패: {exc}") from exc

    try:
        return payload["candidates"][0]["content"]["parts"][0]["text"]
    except (KeyError, IndexError, TypeError) as exc:
        raise LLMCallError(f"Gemini 응답 형식이 다름: {exc}") from exc
