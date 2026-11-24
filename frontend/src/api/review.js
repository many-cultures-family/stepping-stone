// 서술형 답변 검토 API (F-06, US-05, L3). 기준: 제안서 L3 · 상태 전이(작성중 → 검토완료 → 작성완료).
// 효상 님 명세(REVIEW-PRIVACY-API.md)가 아직 서버에 없다. 아래 경로·응답 모양은 [제안]이고, 명세가 나오면 이 파일과 mocks/review.js 만 고친다.
// VITE_USE_MOCK=true 에서는 src/mocks/review.js 가 응답한다. LLM 은 서버에서만 부른다.
// - 사용자 답변·제안 결정은 서버에 저장하지 않는다 (서버 미저장 결정). 그래서 답변은 검토를 요청할 때 본문으로 보낸다.
// - R8: 서버는 제안 위치(start·end)만 준다. 고칠 원문은 돌려주지 않으므로 화면이 자기가 보낸 답변에서 잘라 보여 준다.
// - 작성 건마다 AI 검토는 review_limit(5)번까지다. 횟수는 서버가 센다(draft.review_count).
import { request, USE_MOCK } from './client.js'
import * as mock from '../mocks/review.js'

/**
 * 검토 시작 POST /api/drafts/{id}/review:start [제안]
 * 작성중 → 검토 단계로 넘긴다. 가상 작성 화면에서 '검토하러 가기'를 누를 때 부른다.
 * → { id, step: 'review', review_count, review_limit }
 * 실패: 401 LOGIN_REQUIRED, 403 FORBIDDEN_DRAFT, 404 DRAFT_NOT_FOUND, 409 DRAFT_STEP_INVALID
 */
export function startReview(draftId) {
  if (USE_MOCK) return mock.startReview(draftId)
  return request(`/drafts/${draftId}/review:start`, { method: 'POST', body: {} })
}

/**
 * 검토 화면 정보 GET /api/drafts/{id}/review [제안]
 * → { answers: [{ id(칸 id), label, guide, value }], review_count, review_limit }
 *   answers.value 는 서버에 없을 수 있다(서버 미저장). 그때는 브라우저 보관 값을 채워 쓴다.
 * 실패: 401 LOGIN_REQUIRED, 403 FORBIDDEN_DRAFT, 404 DRAFT_NOT_FOUND, 409 DRAFT_STEP_INVALID
 */
export function getReview(draftId) {
  if (USE_MOCK) return mock.getReview(draftId)
  return request(`/drafts/${draftId}/review`)
}

/**
 * 검토 요청 POST /api/drafts/{id}/review:request [제안] (L3)
 * 본문 { answers: [{ id, value }] } — 개인정보 결정을 마친 답변. '검토 제외'로 고른 부분은 같은 길이의 '*'로 가려서 보낸다
 *   (길이가 같아야 서버가 준 위치가 화면의 답변 위치와 맞는다).
 * → { suggestions: [{ id, field_answer_id, kind, start, end, suggested_text, explanation }], review_count, review_limit }
 *   start·end: 보낸 value 안의 위치. 답변 전체에 대한 제안('질문 의도' 등)은 null 이다 (R8, 원문은 주지 않음)
 *   kind: 맞춤법 · 문법 · 질문 의도 · 보충
 * 실패: 400 ANSWER_EMPTY, 401, 404, 409 DRAFT_STEP_INVALID,
 *       422 PII_REMAINING(가리지 않은 개인정보가 남음), 429 REVIEW_LIMIT_EXCEEDED(5번 다 씀), 502 LLM_CALL_FAILED
 */
export function requestReview(draftId, answers) {
  if (USE_MOCK) return mock.requestReview(draftId, answers)
  return request(`/drafts/${draftId}/review:request`, { method: 'POST', body: { answers } })
}

/**
 * 검토 마치기 POST /api/drafts/{id}:complete [제안] (검토완료 → 작성완료)
 * 완성 조건은 브라우저가 센 숫자만 보낸다 (값은 보내지 않는다).
 * 본문 { remaining_required, unacknowledged_mismatches, undecided_suggestions, undecided_privacy }
 * → { id, status, step }
 * 실패: 409 REVIEW_NOT_DONE, 400 INVALID_COMPLETE_REQUEST
 */
export function finishReview(draftId, counts) {
  if (USE_MOCK) return mock.finishReview(draftId, counts)
  return request(`/drafts/${draftId}:complete`, { method: 'POST', body: counts })
}
