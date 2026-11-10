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
