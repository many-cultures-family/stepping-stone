# L1 입력 항목 추론 (03-rules-states-llm.md 3-4 L1). Gemini 호출은 서버 코드 중 이 파일에서만 한다
# (CLAUDE.md "LLM은 FastAPI 서버에서만 호출한다"). 모델명은 .env(GEMINI_MODEL)에서만 읽는다.
import json
import os
import urllib.error
import urllib.request

GEMINI_URL_TEMPLATE = (
    "https://generativelanguage.googleapis.com/v1beta/models/{model}:generateContent"
)


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
    """
    prompt = _build_prompt(masked_text, language, existing_fields, flagged_field_ids)
    response_text = _call_gemini(prompt)
    try:
        fields = json.loads(response_text)
    except ValueError as exc:
        raise LLMCallError(f"L1 응답이 JSON이 아님: {exc}") from exc
    if not isinstance(fields, list):
        raise LLMCallError("L1 응답이 배열이 아님")
    return fields


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
            "다음은 사용자가 '원본과 다름'으로 표시한 기존 항목이다. 이 항목들을 다시 추론하라: "
            f"{json.dumps(existing_fields or [], ensure_ascii=False)}"
        )
        parts.append(f"다시 추론할 항목 id: {flagged_field_ids}")
    return "\n\n".join(parts)


def _call_gemini(prompt):
    api_key = os.environ.get("GEMINI_API_KEY")
    model = os.environ.get("GEMINI_MODEL")
    if not api_key or not model:
        raise LLMCallError("GEMINI_API_KEY 또는 GEMINI_MODEL이 설정되지 않음")

    url = f"{GEMINI_URL_TEMPLATE.format(model=model)}?key={api_key}"
    body = json.dumps({"contents": [{"parts": [{"text": prompt}]}]}).encode("utf-8")
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
