// 입력 항목 확인·확정 API (F-02, US-02·US-03). 기준: docs/api/FIELD-CHECK-API.md (경로·응답 모양 그대로, 모두 [제안]).
// 확정(confirm) 검증이 실패해도 작성 건은 '반려'가 아니라 '수정' 상태로 남고, 사용자가 고쳐 다시 확정한다(팀 결정).
// 설명(description)은 서버가 user.language 로 한 번 만든다. 그래서 언어 쿼리를 보내지 않는다.
import { request, USE_MOCK } from './client.js'
import * as mock from '../mocks/fields.js'

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
  if (USE_MOCK) return mock.inferFields(draftId)
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
  if (USE_MOCK) return mock.requestReanalysis(draftId, flaggedIds)
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
  if (USE_MOCK) return mock.confirmFields(draftId)
  return request(`/drafts/${draftId}/fields:confirm`, { method: 'POST' })
}

/**
 * 원본 파일 주소. 원본 파일 보기 API 는 어느 문서에도 아직 없다(FIELD-CHECK-API "아직 없는 항목").
 * 그래서 쓰지 않는다. 업로드 직후에는 메모리의 File 로, 그 뒤에는 샘플 서식(목)이나 안내 문구로 대신한다.
 */
export function documentUrl(draftId) {
  return `/api/drafts/${draftId}/document`
}

// 입력 형식 목록은 한 번 받아 두고 다시 쓴다 (서버 허용 목록은 화면이 떠 있는 동안 바뀌지 않는다). 실패하면 다음에 다시 부른다
let formatsCache = null

/**
 * 입력 형식 목록 GET /api/input-formats (F-03 [제안], 백엔드 PR #36) → { formats: [{ code, label, pattern, example }] }
 * 항목 수정 창의 형식 선택지와 허용 목록 검사에 쓴다. 로그인 필요(401 LOGIN_REQUIRED).
 */
export function getInputFormats() {
  if (!formatsCache) {
    formatsCache = (USE_MOCK ? mock.getInputFormats() : request('/input-formats')).catch((e) => {
      formatsCache = null
      throw e
    })
  }
  return formatsCache
}

// 항목 하나를 고치는 API 가 실서버에 있는지. FIELD-CHECK-API.md "아직 없는 항목"이라 지금은 목 모드에서만 켠다.
// 서버 API 가 나오면 아래 editField 경로·본문을 맞추고 이 값을 true 로 바꾼다 (수정 버튼·창이 실서버에서도 열린다).
export const FIELD_EDIT_AVAILABLE = USE_MOCK

/**
 * 항목 하나 수정. **[가정] `PATCH /api/drafts/{id}/fields/{field_id}`** 본문 { label, required, format_code, options } — 명세 없음.
 * → 다른 항목 API 와 같은 { draft, fields, errors? }. 확정 전(step field_check, status 수정)에만 고칠 수 있다.
 * 오류(가정): 401 · 403 FORBIDDEN_DRAFT · 404 DRAFT_NOT_FOUND / FIELD_NOT_FOUND · 409 DRAFT_STEP_INVALID / DRAFT_NOT_EDITABLE
 *            · 400 FIELDS_INVALID (+errors: LABEL_EMPTY · FORMAT_CODE_INVALID · OPTIONS_EMPTY …)
 */
export function editField(draftId, next) {
  if (USE_MOCK) return mock.editField(draftId, next)
  const { label, required, format_code, options } = next
  return request(`/drafts/${draftId}/fields/${next.id}`, { method: 'PATCH', body: { label, required, format_code, options } })
}
