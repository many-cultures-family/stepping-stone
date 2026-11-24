// 작성 목록·제출 완료·취소 API (F-08, US-06·US-07). 기준: docs/api/DRAFT-STATUS-API.md (경로·응답 모양 그대로, 모두 [제안]).
import { request } from './client.js'

/**
 * 작성 목록 GET /api/drafts (항목 1)
 * → { drafts: [{ id, status, step, reject_reason, submitted_at, next_action }] }
 * status 를 생략하면 '취소'를 뺀 전체. '취소'는 서버가 400 STATUS_NOT_ALLOWED 로 거절한다.
 * next_action: UPLOAD · FIELD_CHECK · PRIOR_INFO · WRITING · REVIEW · REJECTED · SUBMIT · DONE
 */
export function listDrafts(status) {
  const query = status ? `?status=${encodeURIComponent(status)}` : ''
  return request(`/drafts${query}`)
}

/**
 * 제출 완료 처리 POST /api/drafts/{id}:submit (항목 2, US-06)
 * 사용자가 공식 사이트에서 직접 제출한 뒤 누른다. 디딤돌은 기록(submitted_at)만 남긴다 (R10)
 * → { id, status: '성공', submitted_at }
 * 실패: 401, 403, 404 DRAFT_NOT_FOUND, 409 DRAFT_NOT_READY / ALREADY_SUBMITTED
 */
export function submitDraft(draftId) {
  return request(`/drafts/${draftId}:submit`, { method: 'POST' })
}

/**
 * 작성 건 취소 POST /api/drafts/{id}:cancel (항목 3, US-07). 되돌릴 수 없다 (R12)
 * 서버가 업로드 문서·입력 항목·입력값을 지운다 (T3). 사전 정보는 남는다.
 * → { id, status: '취소' }
 * 실패: 401, 403, 404 DRAFT_NOT_FOUND, 409 ALREADY_CANCELED
 */
export function cancelDraft(draftId) {
  return request(`/drafts/${draftId}:cancel`, { method: 'POST' })
}

// 되돌리기 API 가 서버에 있는지. 백엔드 #78 로 생겨서 켠다 (false 면 작성 목록 카드에 되돌리기 버튼을 숨긴다).
export const REVERT_AVAILABLE = true

/**
 * 단계 되돌리기 POST /api/drafts/{id}:revert [제안] (제안서 상태 전이 표의 '되돌릴 수 있나', 백엔드 #78)
 * 본문 { to } — 지금 서버가 여는 것은 하나뿐이다.
 *   검토완료(review) → 작성중: { to: 'writing' }  검토 제안을 반영하거나 내용을 다시 고칠 때
 * 작성중 → 사전 정보, 작성완료(제출 전) → 작성중은 서버가 409 REVERT_NOT_ALLOWED 를 준다 (R11 연결과 함께 정할 예정)
 * 가상 작성 입력값은 브라우저에 있으므로 서버는 단계만 바꾼다. 검토·재분석 횟수는 되돌리지 않는다.
 * → { id, status, step, next_action }
 * 실패: 401, 403, 404 DRAFT_NOT_FOUND, 409 ALREADY_SUBMITTED(제출 기록이 있음) / REVERT_NOT_ALLOWED(그 단계에서 갈 수 없는 곳)
 */
export function revertDraft(draftId, to) {
  return request(`/drafts/${draftId}:revert`, { method: 'POST', body: { to } })
}
