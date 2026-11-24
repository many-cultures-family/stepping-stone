// 단어·문장 설명 API (F-05, R5, L2). 명세: AI-plan docs/api/WORD-EXPLAIN-API.md 항목 1~3.
// LLM·번역 API 는 서버에서만 부른다.
// - 단어를 누르면 서버 용어 사전 설명을 먼저 보여 준다 (항목 1, R5). 사전은 (단어, 사용 언어)가 정확히 같은 것만 찾는다.
// - 사용자가 '이해하지 못함'을 고를 때만 AI 쉬운 풀이(L2)를 요청하고, 'AI 풀이'로 표시한다 (항목 2, R5).
// - L2에 보내는 것은 문서 속 글자(사용자가 고른 단어·문장)뿐이다. 서버도 '가린 문서 글자 안에 있는지'를 다시 본다
//   (400 TEXT_NOT_IN_DOCUMENT). 사용자가 쓴 값·사전 정보는 보내지 않는다 (03 3-4 L2).
import { request } from './client.js'

/** 용어 사전 조회 글자 수 상한 (항목 1, 서버 400 TERM_TOO_LONG) */
export const TERM_MAX_LENGTH = 50
/** AI 쉬운 풀이 요청 글자 수 상한 (항목 2, 서버 400 TEXT_TOO_LONG) */
export const EXPLAIN_MAX_LENGTH = 100

/**
 * 항목 1. 기본 설명 조회 GET /api/glossary?term=
 * 언어는 서버가 로그인한 사용자의 user.language 로 정한다.
 * → { found: true, term, explanation, source: 'glossary' } | { found: false, term }
 * 실패: 400 TERM_REQUIRED · TERM_TOO_LONG, 401 LOGIN_REQUIRED
 */
export function lookupTerm(term) {
  return request(`/glossary?term=${encodeURIComponent(term)}`)
}

/**
 * 항목 2. AI 쉬운 풀이 요청 POST /api/drafts/{id}/explanations (L2)
 * (selected_text, 사용 언어)가 같은 요청은 서버가 저장해 둔 풀이를 그대로 준다 (R5 "같은 질문에 같은 설명").
 * → { selected_text, explanation, source: 'ai' }
 * 실패: 400 TEXT_REQUIRED · TEXT_TOO_LONG · TEXT_NOT_IN_DOCUMENT, 422 PII_REMAINING,
 *       409 EXPLANATION_LIMIT_EXCEEDED · DRAFT_STEP_INVALID · DRAFT_NOT_EDITABLE, 502 LLM_CALL_FAILED
 */
export function requestEasyExplanation(draftId, selectedText) {
  return request(`/drafts/${draftId}/explanations`, {
    method: 'POST',
    body: { selected_text: selectedText },
  })
}

/**
 * 항목 3. 가린 문서 글자 조회 GET /api/drafts/{id}/document/text
 * → { lines: [{ page, bbox: { x, y, w, h }, text }] } — 개인정보는 [이름] 같은 토큰으로 가려져 있다
 * 실패: 422 DOCUMENT_NOT_READY, 409 DRAFT_STEP_INVALID · DRAFT_NOT_EDITABLE, 403, 404
 */
export function getDocumentText(draftId) {
  return request(`/drafts/${draftId}/document/text`)
}
