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


# 서술형 답변 검토(L3, F-06)가 낼 수 있는 제안 종류. frontend/src/mocks/review.js의
# DATA-MODEL.md review_suggestion.kind 주석과 같다
REVIEW_KINDS = ["맞춤법", "문법", "질문 의도", "보충"]

REVIEW_RESPONSE_SCHEMA = {
    "type": "ARRAY",
    "items": {
        "type": "OBJECT",
        "properties": {
            "field_answer_id": {"type": "INTEGER"},
            "kind": {"type": "STRING", "enum": REVIEW_KINDS},
            "suggested_text": {"type": "STRING", "nullable": True},
            "explanation": {"type": "STRING"},
        },
        "required": ["field_answer_id", "kind", "explanation"],
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
    if flagged_field_ids and len(fields) != len(existing_fields or []):
        raise LLMCallError(
            f"재분석 응답 개수({len(fields)})가 기존 항목 개수"
            f"({len(existing_fields or [])})와 다름 — 항목이 사라졌을 수 있다"
        )
    return fields


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
        "format_code(phone/date/email/number/name/address/short_text/long_text/choice 중 하나), "
        "required(참거짓), prior_info_key(name/birth_date/phone/address 중 연결되는 것, 없으면 null), "
        f"description({language} 언어로 쓴 사용자용 설명), "
        'bbox({"page":1,"x":0~1,"y":0~1,"w":0~1,"h":0~1}).'
    )
    parts = [
        (
            "다음은 신청서 양식에서 개인정보를 가린 뒤 추출한 텍스트다. "
            "이 문서의 입력 항목을 모두 찾아 JSON 배열로만 답하라."
        ),
        f"각 항목은 다음 키를 가진다: {field_keys}",
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


def review_answers(answers, language):
    """L3을 호출해 서술형 답변의 맞춤법·문법과 질문 의도 대비 적합성을 검토한다 (F-06, US-05).

    보내는 것: answers = [{"field_answer_id", "label", "guide_text", "value"}, ...]
    (field_answer id, 항목명, 질문 안내문, 사용자가 쓴 답변). 호출부가 보내기 전에
    답변 속 개인정보를 가리는 일은 L1의 masked_text와 마찬가지로 이 함수 밖의 책임이다.

    반환: [{"field_answer_id", "kind", "suggested_text", "explanation"}, ...]
    L1과 같은 이유로 L1 출력을 신뢰하지 않는다 — kind가 허용 목록 밖이거나
    field_answer_id가 보낸 답변에 없는 제안은 거절한다 (존재하지 않는 답변을 가리켜
    화면이 엉뚱한 곳에 제안을 붙이는 일을 막는다).
    """
    if not answers:
        return []
    known_ids = {a["field_answer_id"] for a in answers}
    prompt = _build_review_prompt(answers, language)
    response_text = _call_gemini(prompt, response_schema=REVIEW_RESPONSE_SCHEMA)
    try:
        suggestions = json.loads(response_text)
    except ValueError as exc:
        raise LLMCallError(f"L3 응답이 JSON이 아님: {exc}") from exc
    if not isinstance(suggestions, list):
        raise LLMCallError("L3 응답이 배열이 아님")
    for item in suggestions:
        _validate_suggestion_shape(item, known_ids)
    return suggestions


def _validate_suggestion_shape(item, known_ids):
    if not isinstance(item, dict):
        raise LLMCallError(f"L3 항목이 객체가 아님: {item!r}")
    field_answer_id = item.get("field_answer_id")
    if not isinstance(field_answer_id, int) or field_answer_id not in known_ids:
        raise LLMCallError(
            f"L3 항목의 field_answer_id가 올바르지 않음: {field_answer_id!r}"
        )
    if item.get("kind") not in REVIEW_KINDS:
        raise LLMCallError(f"L3 항목의 kind가 허용 목록 밖임: {item.get('kind')!r}")
    suggested_text = item.get("suggested_text")
    if suggested_text is not None and not isinstance(suggested_text, str):
        raise LLMCallError(
            f"L3 항목의 suggested_text가 문자열이 아님: {suggested_text!r}"
        )
    explanation = item.get("explanation")
    if not isinstance(explanation, str) or not explanation.strip():
        raise LLMCallError(f"L3 항목의 explanation이 비어 있음: {explanation!r}")


def _build_review_prompt(answers, language):
    kinds = "/".join(REVIEW_KINDS)
    parts = [
        (
            "다음은 신청서 서술형 입력 항목에 사용자가 쓴 답변 목록이다. "
            "각 답변의 맞춤법·문법을 검토하고, 질문 의도에 비해 답변이 부족하거나 "
            "어긋나는 곳이 있으면 짚어라. 고칠 곳이 없으면 그 답변은 건너뛴다."
        ),
        (
            f"제안 종류(kind)는 다음 중 하나다: {kinds}. "
            "맞춤법·문법은 틀린 부분을 고친 전체 문장을 suggested_text에 담고, "
            "질문 의도·보충은 suggested_text를 null로 두고 explanation에만 설명한다."
        ),
        (
            "응답은 각 제안이 다음 키를 가진 JSON 배열로만 답하라: "
            "field_answer_id(아래 id 중 하나), kind, suggested_text(없으면 null), "
            f"explanation({language} 언어로 쓴 사용자용 설명)."
        ),
        f"사용 언어 코드: {language}",
        "답변 목록:\n"
        + json.dumps(
            [
                {
                    "field_answer_id": a["field_answer_id"],
                    "label": a.get("label"),
                    "guide_text": a.get("guide_text"),
                    "value": a["value"],
                }
                for a in answers
            ],
            ensure_ascii=False,
        ),
    ]
    return "\n\n".join(parts)


def _call_gemini(prompt, response_schema=RESPONSE_SCHEMA):
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
                "responseSchema": response_schema,
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
