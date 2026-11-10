# L1 호출 함수 단위 테스트 (app/llm.py). 실제 Gemini를 부르지 않는다 (CLAUDE.md 111행)
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
    monkeypatch.setattr(
        llm, "_call_gemini", lambda prompt: __import__("json").dumps(fake_fields)
    )

    result = llm.infer_fields(masked_text="문서 내용", language="vi")

    assert result == fake_fields
