// 서술형 답변 검토 API (F-06, US-05). 기준: DATA-MODEL.md (field_answer, review_suggestion).
// F-06 API 명세(docs/api)가 아직 없다. 아래 경로·응답 모양은 모두 [제안]이고, 명세가 나오면 이 파일만 고친다.
// VITE_USE_MOCK=true 에서는 src/mocks/review.js 가 응답한다. LLM 은 서버에서만 부른다.
import { request, USE_MOCK } from './client.js'
import * as mock from '../mocks/review.js'

/**
 * 검토할 서술형 답변 목록 GET /api/drafts/{id}/review [제안]
 * → { answers: [{ id(field_answer id), label, guide, value }] }
 * 실패: 401 LOGIN_REQUIRED, 403, 404 DRAFT_NOT_FOUND
 */
export function getReview(draftId) {
  if (USE_MOCK) return mock.getReview(draftId)
  return request(`/drafts/${draftId}/review`)
}

/**
 * 검토 요청 POST /api/drafts/{id}/review:request [제안] (L3). 답변을 서버가 마스킹한 뒤 LLM 에 보낸다.
 * → { suggestions: [{ id, field_answer_id, kind, suggested_text, explanation, decision: '미결정' }] }
 * 실패: 400 ANSWER_EMPTY(빈 답변), 401, 404, 502 LLM_CALL_FAILED
 */
export function requestReview(draftId) {
  if (USE_MOCK) return mock.requestReview(draftId)
  return request(`/drafts/${draftId}/review:request`, { method: 'POST', body: {} })
}

/**
 * 제안 반영 여부 저장 PATCH /api/drafts/{id}/review/suggestions/{suggestionId} [제안] (R6, R9)
 * 본문 { decision: '반영' | '무시' | '미결정' } → { id, decision }
 */
export function decideSuggestion(draftId, suggestionId, decision) {
  if (USE_MOCK) return mock.decideSuggestion(draftId, suggestionId, decision)
  return request(`/drafts/${draftId}/review/suggestions/${suggestionId}`, { method: 'PATCH', body: { decision } })
}

/** 검토 마치기 [목 전용] 단계 전이(review → 성공) API 는 아직 없다. 목에서만 작성 목록에 반영한다 */
export function finishReview(draftId) {
  if (!USE_MOCK) return Promise.reject(new Error('검토 마치기 API는 아직 없어요'))
  return mock.finishReview(draftId)
}
