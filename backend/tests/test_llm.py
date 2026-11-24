# L1 호출 함수 단위 테스트 (app/llm.py). 실제 Gemini를 부르지 않는다 (CLAUDE.md 111행)
import json

import pytest

from app import llm


def test_llm_infer_fields_raises_when_env_not_configured(monkeypatch):
    monkeypatch.delenv("GEMINI_API_KEY", raising=False)
    monkeypatch.delenv("GEMINI_MODEL", raising=False)

    with pytest.raises(llm.LLMCallError):
        llm.infer_fields(masked_text="문서 내용", language="vi")


def test_llm_infer_fields_raises_on_non_json_response(monkeypatch):
    monkeypatch.setattr(llm, "_call_gemini", lambda prompt: "이건 JSON이 아니다")

    with pytest.raises(llm.LLMCallError):
        llm.infer_fields(masked_text="문서 내용", language="vi")


def test_llm_infer_fields_returns_parsed_list(monkeypatch):
    fake_fields = [
        {
            "label": "보호자 연락처",
            "format_code": "phone",
            "required": True,
            "prior_info_key": "phone",
            "description": "보호자 전화번호를 적습니다",
            "bbox": {"page": 1, "x": 0.1, "y": 0.3, "w": 0.4, "h": 0.04},
        }
    ]
    monkeypatch.setattr(llm, "_call_gemini", lambda prompt: json.dumps(fake_fields))

    result = llm.infer_fields(masked_text="문서 내용", language="vi")

    assert result == fake_fields


# F-02 리뷰: L1 출력을 믿지 말고 검증한다
def test_llm_infer_fields_rejects_non_dict_item(monkeypatch):
    monkeypatch.setattr(llm, "_call_gemini", lambda prompt: json.dumps(["문자열 항목"]))

    with pytest.raises(llm.LLMCallError):
        llm.infer_fields(masked_text="문서 내용", language="vi")


def test_llm_infer_fields_rejects_required_as_string(monkeypatch):
    fake_fields = [
        {
            "label": "이름",
            "format_code": "name",
            "required": "false",  # 참거짓이 아닌 문자열 — truthy라 True로 오저장될 뻔했다
            "description": "이름을 적습니다",
            "bbox": {"page": 1, "x": 0, "y": 0, "w": 0.1, "h": 0.1},
        }
    ]
    monkeypatch.setattr(llm, "_call_gemini", lambda prompt: json.dumps(fake_fields))

    with pytest.raises(llm.LLMCallError):
        llm.infer_fields(masked_text="문서 내용", language="vi")


def test_llm_infer_fields_rejects_options_not_a_list(monkeypatch):
    fake_fields = [
        {
            "label": "선택형",
            "format_code": "choice",
            "required": True,
            "description": "하나를 고르세요",
            "options": "보기1,보기2",
            "bbox": {"page": 1, "x": 0, "y": 0, "w": 0.1, "h": 0.1},
        }
    ]
    monkeypatch.setattr(llm, "_call_gemini", lambda prompt: json.dumps(fake_fields))

    with pytest.raises(llm.LLMCallError):
        llm.infer_fields(masked_text="문서 내용", language="vi")


# F-02 리뷰: 재분석 때 표시 안 한 항목이 응답에서 빠지면(= 사라지면) 거절한다
def test_llm_infer_fields_rejects_reanalysis_response_with_dropped_items(monkeypatch):
    existing_fields = [
        {"id": 1, "label": "항목1"},
        {"id": 2, "label": "항목2"},
    ]
    # L1이 flagged 항목 하나만 돌려주고 나머지를 빠뜨린 경우
    short_response = [
        {
            "label": "항목1(재추론)",
            "format_code": "name",
            "required": True,
            "description": "설명",
            "bbox": {"page": 1, "x": 0, "y": 0, "w": 0.1, "h": 0.1},
        }
    ]
    monkeypatch.setattr(llm, "_call_gemini", lambda prompt: json.dumps(short_response))

    with pytest.raises(llm.LLMCallError):
        llm.infer_fields(
            masked_text="문서 내용",
            language="vi",
            existing_fields=existing_fields,
            flagged_field_ids=[1],
        )


def test_llm_call_gemini_requests_json_response_format(monkeypatch):
    monkeypatch.setenv("GEMINI_API_KEY", "fake-key")
    monkeypatch.setenv("GEMINI_MODEL", "fake-model")
    captured = {}

    class FakeResponse:
        def __enter__(self):
            return self

        def __exit__(self, *args):
            return False

        def read(self):
            return json.dumps(
                {"candidates": [{"content": {"parts": [{"text": "[]"}]}}]}
            ).encode()

    def fake_urlopen(request, timeout=None):
        captured["body"] = json.loads(request.data)
        return FakeResponse()

    monkeypatch.setattr("app.llm.urllib.request.urlopen", fake_urlopen)

    llm._call_gemini("프롬프트")

    assert (
        captured["body"]["generationConfig"]["responseMimeType"] == "application/json"
    )
    assert "responseSchema" in captured["body"]["generationConfig"]


# 날짜줄('년 월 일')·서명란('(인)')도 입력 항목으로 잡게 지시한다 (2026-11-23 실측: 지시 없이는 L1이 버림)
def test_prompt_asks_for_date_line_and_signature_fields(monkeypatch):
    captured = {}

    def fake_call(prompt):
        captured["prompt"] = prompt
        return "[]"

    monkeypatch.setattr(llm, "_call_gemini", fake_call)
    llm.infer_fields(masked_text="@p1 0.45,0.40,0.24,0.02 | 년 월 일", language="vi")

    prompt = captured["prompt"]
    assert "'년 월 일'" in prompt and "date" in prompt
    assert "(인)" in prompt and "signature" in prompt
    assert (
        "signature" in llm.RESPONSE_SCHEMA["items"]["properties"]["format_code"]["enum"]
    )


# 2026-11-23 실측: 스키마에 options가 없어 동의서의 동의 여부 칸 3개가 보기 없이 왔다
def test_schema_has_options_and_prompt_explains_checkboxes(monkeypatch):
    captured = {}

    def fake_call(prompt):
        captured["prompt"] = prompt
        return "[]"

    monkeypatch.setattr(llm, "_call_gemini", fake_call)
    llm.infer_fields(
        masked_text="@p1 0.36,0.29,0.28,0.02 | 동의합니다 다 동의하지 않습니다 n",
        language="ko",
    )
    assert llm.RESPONSE_SCHEMA["items"]["properties"]["options"]["type"] == "ARRAY"
    assert "□" in captured["prompt"] and "options" in captured["prompt"]


def test_consent_choice_without_options_gets_yes_no(monkeypatch):
    fake_fields = [
        {
            "label": "개인정보 수집 이용 동의",
            "format_code": "choice",
            "required": True,
            "description": "동의 여부",
            "options": None,
            "bbox": {"page": 1, "x": 0.36, "y": 0.29, "w": 0.28, "h": 0.02},
        },
        {
            "label": "자녀와의 관계",
            "format_code": "choice",
            "required": True,
            "description": "관계",
            "bbox": {"page": 1, "x": 0.1, "y": 0.1, "w": 0.1, "h": 0.02},
        },
    ]
    monkeypatch.setattr(llm, "_call_gemini", lambda prompt: json.dumps(fake_fields))
    fields = llm.infer_fields(masked_text="문서 내용", language="ko")
    assert fields[0]["options"] == ["동의합니다", "동의하지 않습니다"]
    # 동의가 아닌 선택형은 보기를 지어내지 않는다
    assert fields[1].get("options") is None


# ── L3 서술형 답변 검토 (PR #26 테스트 틀을 form_field_id·masked_text에 맞춤) ──

L3_ANSWERS = [
    {
        "form_field_id": 31,
        "label": "신청 사유",
        "guide_text": "이유를 쓰세요",
        "masked_text": "저는 [이름1]입니다",
    }
]


def _fake_l3(monkeypatch, suggestions, seen=None):
    def fake(prompt, schema=None):
        if seen is not None:
            seen.update(prompt=prompt, schema=schema)
        return (
            json.dumps(suggestions) if not isinstance(suggestions, str) else suggestions
        )

    monkeypatch.setattr(llm, "_call_gemini", fake)


def test_review_answers_returns_empty_without_calling_llm_when_no_answers(monkeypatch):
    def fail_if_called(prompt, schema=None):
        raise AssertionError("답변이 없으면 L3을 부르면 안 된다")

    monkeypatch.setattr(llm, "_call_gemini", fail_if_called)
    assert llm.review_answers([], language="vi") == []


def test_review_answers_returns_parsed_list(monkeypatch):
    fake = [
        {
            "form_field_id": 31,
            "kind": "맞춤법",
            "suggested_text": "고친 답변",
            "explanation": " 설명 ",
        },
        {"form_field_id": 31, "kind": "보충", "explanation": "더 쓰세요"},
    ]
    seen = {}
    _fake_l3(monkeypatch, fake, seen)
    assert llm.review_answers(L3_ANSWERS, language="vi") == [
        {
            "form_field_id": 31,
            "kind": "맞춤법",
            "suggested_text": "고친 답변",
            "explanation": "설명",
        },
        {
            "form_field_id": 31,
            "kind": "보충",
            "suggested_text": None,
            "explanation": "더 쓰세요",
        },
    ]
    assert seen["schema"] == llm.REVIEW_RESPONSE_SCHEMA


def test_review_prompt_sends_masked_answer_and_token_rule(monkeypatch):
    seen = {}
    _fake_l3(monkeypatch, [], seen)
    llm.review_answers(L3_ANSWERS, language="vi")
    prompt = seen["prompt"]
    assert "저는 [이름1]입니다" in prompt and "이유를 쓰세요" in prompt
    assert "토큰은 글자 하나 바꾸지 말고 그대로 둔다" in prompt
    assert "베트남어" in prompt


@pytest.mark.parametrize(
    "item",
    [
        {
            "form_field_id": 999,
            "kind": "맞춤법",
            "explanation": "설명",
        },  # 보내지 않은 id
        {"form_field_id": True, "kind": "맞춤법", "explanation": "설명"},
        {"form_field_id": 31, "kind": "오타", "explanation": "설명"},  # 허용 목록 밖
        {"form_field_id": 31, "kind": "질문 의도", "explanation": ""},
        {
            "form_field_id": 31,
            "kind": "문법",
            "suggested_text": 3,
            "explanation": "설명",
        },
        "문자열 항목",
    ],
)
def test_review_answers_rejects_bad_item(monkeypatch, item):
    _fake_l3(monkeypatch, [item])
    with pytest.raises(llm.LLMCallError):
        llm.review_answers(L3_ANSWERS, language="vi")


@pytest.mark.parametrize("reply", ["not json", '{"a": 1}'])
def test_review_answers_rejects_non_list(monkeypatch, reply):
    _fake_l3(monkeypatch, reply)
    with pytest.raises(llm.LLMCallError):
        llm.review_answers(L3_ANSWERS, language="vi")
