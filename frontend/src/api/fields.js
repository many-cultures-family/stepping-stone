// 입력 항목 확인·확정 API (F-02, US-02·US-03). 기준: docs/api/FIELD-CHECK-API.md (경로·응답 모양 그대로, 모두 [제안]).
// 확정(confirm) 검증이 실패해도 작성 건은 '반려'가 아니라 '수정' 상태로 남고, 사용자가 고쳐 다시 확정한다(팀 결정).
// 설명(description)은 서버가 user.language 로 한 번 만든다. 그래서 언어 쿼리를 보내지 않는다.
import { request } from './client.js'

export { REANALYSIS_LIMIT } from './limits.js'

/**
 * 응답 모양 (조회·추론·재분석 공통):
 * { draft: { id, status, step, fields_confirmed_at, reanalysis_count },
 *   fields: [{ id, label, format_code, format_label, format_example, required, prior_info_key,
 *              description, bbox, flagged_wrong }],
 *   errors?: [{ field_id, code: 'FORMAT_CODE_INVALID' | 'REQUIRED_MISSING' }] }
 */

/**
 * 최초 추론 POST /api/drafts/{id}/fields:infer 본문 {} (항목 2).
 * 이미 항목이 있으면 저장된 값을 그대로 돌려주는 멱등 규칙이라 화면 진입 때 불러도 안전하다.
 */
export function inferFields(draftId) {
  return request(`/drafts/${draftId}/fields:infer`, {
    method: 'POST',
    body: {},
  })
}

/**
 * '원본과 달라요'로 표시한 항목으로 재분석 (US-03). POST /api/drafts/{id}/fields:infer 본문 { flagged_field_ids }
 * 응답이 전체 목록 교체이고 id 가 새로 발급된다(flagged_wrong 은 모두 false, fields_confirmed_at 은 비움).
 * 실패: 400 NO_FIELDS_FLAGGED, 400 INVALID_FLAGGED_FIELD_IDS(배열[정수]가 아님), 409 REANALYSIS_LIMIT_EXCEEDED,
 *       404 FIELD_NOT_FOUND, 422 DOCUMENT_NOT_READY(글자 인식 전·실패), 502 LLM_CALL_FAILED
 * 서버는 L1 응답 개수가 기존 항목 개수와 다르면 무조건 거절한다(502 LLM_CALL_FAILED로 내려온다, 팀 결정).
 * 화면은 오류 문구만 보여 주고 기존 목록과 횟수는 그대로 둔다 (횟수는 성공했을 때만 늘어난다).
 */
export function requestReanalysis(draftId, flaggedIds) {
  return request(`/drafts/${draftId}/fields:infer`, {
    method: 'POST',
    body: { flagged_field_ids: flaggedIds },
  })
}

/**
 * '확인했어요' POST /api/drafts/{id}/fields:confirm (본문 없음, 항목 3).
 * → { draft: { id, status, step, fields_confirmed_at } }
 * 실패: 400 FIELDS_INVALID + errors [{ field_id, code }] (ApiError.errors)
 */
export function confirmFields(draftId) {
  return request(`/drafts/${draftId}/fields:confirm`, { method: 'POST' })
}
