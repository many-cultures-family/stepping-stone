// 작성 목록·제출 완료·취소 API (F-08, US-06·US-07). 기준: docs/api/DRAFT-STATUS-API.md (경로·응답 모양 그대로, 모두 [제안]).
import { request, USE_MOCK } from './client.js'
import * as mock from '../mocks/drafts.js'

/**
 * 작성 목록 GET /api/drafts (항목 1)
 * → { drafts: [{ id, status, step, reject_reason, submitted_at, next_action }] }
 * status 를 생략하면 '취소'를 뺀 전체. '취소'는 서버가 400 STATUS_NOT_ALLOWED 로 거절한다.
 * next_action: UPLOAD · FIELD_CHECK · PRIOR_INFO · WRITING · REVIEW · REJECTED · SUBMIT · DONE
 */
export function listDrafts(status) {
  if (USE_MOCK) return mock.listDrafts(status)
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
  if (USE_MOCK) return mock.submitDraft(draftId)
  return request(`/drafts/${draftId}:submit`, { method: 'POST' })
}

/**
 * 작성 건 취소 POST /api/drafts/{id}:cancel (항목 3, US-07). 되돌릴 수 없다 (R12)
 * 서버가 업로드 문서·입력 항목·입력값을 지운다 (T3). 사전 정보는 남는다.
 * → { id, status: '취소' }
 * 실패: 401, 403, 404 DRAFT_NOT_FOUND, 409 ALREADY_CANCELED
 */
export function cancelDraft(draftId) {
  if (USE_MOCK) return mock.cancelDraft(draftId)
  return request(`/drafts/${draftId}:cancel`, { method: 'POST' })
}

// 되돌리기 API 가 실서버에 있는지. 효상 님 전이 API 가 아직 없어서 목에서만 버튼을 보인다.
// 서버에 생기면 true 로 바꾼다 (api/documents.js 의 REUPLOAD_AVAILABLE 과 같은 방식).
export const REVERT_AVAILABLE = USE_MOCK

/**
 * 단계 되돌리기 POST /api/drafts/{id}:revert [제안] (제안서 상태 전이 표의 '되돌릴 수 있나')
 * 본문 { to } — 되돌릴 수 있는 것은 세 가지뿐이다.
 *   작성중(writing) → 사전정보입력완료: { to: 'prior_info' }  사전 정보 자체가 틀렸음을 발견했을 때
 *   검토완료(review) → 작성중:          { to: 'writing' }     검토 제안을 반영하거나 내용을 다시 고칠 때
 *   작성완료(status 성공, 제출 전) → 작성중: { to: 'writing' } 제출 전에 다시 고칠 내용을 발견했을 때
 * 가상 작성 입력값은 브라우저에 있으므로 서버는 단계만 바꾼다. 검토·재분석 횟수는 되돌리지 않는다.
 * → { id, status, step, next_action }
 * 실패: 401, 403, 404 DRAFT_NOT_FOUND, 409 ALREADY_SUBMITTED(제출 기록이 있음) / REVERT_NOT_ALLOWED(그 단계에서 갈 수 없는 곳)
 */
export function revertDraft(draftId, to) {
  if (USE_MOCK) return mock.revertDraft(draftId, to)
  return request(`/drafts/${draftId}:revert`, { method: 'POST', body: { to } })
}
