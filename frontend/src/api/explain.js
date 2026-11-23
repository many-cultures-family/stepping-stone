// 단어·문장 설명 API (F-05, R5, L2). 기준: DATA-MODEL.md glossary_term · easy_explanation, 03 3-4 L2.
// F-05 API 명세(docs/api)가 아직 없다. 아래 경로·응답 모양은 모두 [제안]이고, 명세가 나오면 이 파일만 고친다.
// LLM·번역 API 는 서버에서만 부른다.
// - 기본 설명은 항상 서버 용어 사전에서 먼저 보여 준다 (R5).
// - 사용자가 '이해하지 못함'을 고를 때만 AI 쉬운 풀이(L2)를 요청하고, 'AI 풀이'로 표시한다 (R5).
// - L2에 보내는 것은 문서 속 글자(사용자가 고른 단어·문장)뿐이다. 사용자가 쓴 값·사전 정보는 보내지 않는다 (03 3-4 L2).
import { request } from './client.js'

/** 한 번에 풀이를 요청할 수 있는 글자 수 [제안]. 서버도 같은 값으로 막는다 (400 TEXT_TOO_LONG) */
export const EXPLAIN_MAX_LENGTH = 200

/**
 * 용어 사전 GET /api/glossary [제안]
 * 서버는 로그인한 사용자의 사용 언어(user.language)로 설명을 준다.
 * → { language, terms: [{ id, term, explanation }] }
 * 실패: 401 LOGIN_REQUIRED
 */
export function getGlossary() {
  return request('/glossary')
}

/**
 * AI 쉬운 풀이 요청 POST /api/explanations [제안] (L2)
 * 본문 { selected_text, glossary_term_id(사전에 있던 말이면, 없으면 null) }
 * (selected_text, 사용 언어)가 같은 요청은 서버가 저장해 둔 풀이를 그대로 준다 (R5 "같은 질문에 같은 설명").
 * → { id, selected_text, language, explanation }
 * 실패: 400 TEXT_EMPTY · TEXT_TOO_LONG, 401 LOGIN_REQUIRED, 502 LLM_CALL_FAILED
 */
export function requestEasyExplanation(selectedText, glossaryTermId = null) {
  return request('/explanations', {
    method: 'POST',
    body: { selected_text: selectedText, glossary_term_id: glossaryTermId },
  })
}
