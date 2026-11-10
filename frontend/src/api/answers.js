// 가상 작성 API (F-04). 기준: docs/api/VIRTUAL-FORM-API.md (경로·응답 모양 그대로, 모두 [제안]).
// 백엔드에는 아직 구현이 없다(field_answer·prior_info 테이블 없음). VITE_USE_MOCK=true 에서는 src/mocks/answers.js 가 명세 예시대로 응답한다.
// 여기 쓴 값은 실제 기관에 절대 전송하지 않는다 (R4).
import { request, USE_MOCK } from './client.js'
import * as mock from '../mocks/answers.js'

/**
 * 응답 모양:
 * { draft: { id, status, step },
 *   answers: [{ field_id, label, format_code, format_label, format_example, required, prior_info_key,
 *               description, options, value,
 *               mismatch: { has_prior_info: true, prior_value, differs, mismatch_acknowledged } | { has_prior_info: false } }] }
 */

/** GET /api/drafts/{id}/answers (항목 1). 실패: 401 LOGIN_REQUIRED, 403, 404, 409 DRAFT_STEP_INVALID / DRAFT_NOT_EDITABLE */
export function getAnswers(draftId) {
  if (USE_MOCK) return mock.getAnswers(draftId)
  return request(`/drafts/${draftId}/answers`)
}

/**
 * PUT /api/drafts/{id}/answers/{field_id} 본문 { value } (항목 2).
 * → { field_id, value, mismatch }. 값이 바뀌면 mismatch_acknowledged 는 거짓으로 돌아간다.
 * 실패: 400 FORMAT_INVALID, 404 FIELD_NOT_FOUND
 */
export function saveAnswer(draftId, fieldId, value) {
  if (USE_MOCK) return mock.saveAnswer(draftId, fieldId, value)
  return request(`/drafts/${draftId}/answers/${fieldId}`, { method: 'PUT', body: { value } })
}

/**
 * POST /api/drafts/{id}/answers/{field_id}:acknowledge-mismatch (본문 없음, 항목 3).
 * → { field_id, mismatch_acknowledged: true }. 실패: 400 NO_MISMATCH, 404 FIELD_NOT_FOUND
 */
export function acknowledgeMismatch(draftId, fieldId) {
  if (USE_MOCK) return mock.acknowledgeMismatch(draftId, fieldId)
  return request(`/drafts/${draftId}/answers/${fieldId}:acknowledge-mismatch`, { method: 'POST' })
}
