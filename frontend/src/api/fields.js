// 입력 항목 확인·확정 API (F-02, US-02·US-03). 경로와 응답 모양은 [제안] — 백엔드와 확정되면 여기만 고친다.
// 데이터 모양은 DATA-MODEL.md `form_field`, `input_format` 을 그대로 따른다.
import { request, USE_MOCK } from './client.js'
import * as mock from '../mocks/fields.js'

/**
 * L1이 추론한 입력 항목 목록 + 허용 형식 목록
 * GET /api/drafts/{id}/fields?lang=
 * → { draft: { id, status, step, reanalysis_count, reanalysis_limit },
 *     formats: [{ code, label, example }],
 *     fields: [{ id, label, format_code, required, description, prior_info_key, options, bbox, flagged_wrong }] }
 */
export function getFields(draftId, lang) {
  if (USE_MOCK) return mock.getFields(draftId, lang)
  return request(`/drafts/${draftId}/fields?lang=${encodeURIComponent(lang)}`)
}

/**
 * 사용자가 확인·수정한 항목 목록을 확정한다 ('확인했어요').
 * POST /api/drafts/{id}/fields/confirm  body { fields: [...] }
 * → { draft: { id, status, step }, fields_confirmed_at }
 * 규칙 검증 실패면 422 { detail: { code: 'FIELD_INVALID', errors: [{ field_id, reason }] } }
 */
export function confirmFields(draftId, fields) {
  const body = { fields: fields.map(toConfirmPayload) }
  if (USE_MOCK) return mock.confirmFields(draftId, body)
  return request(`/drafts/${draftId}/fields/confirm`, { method: 'POST', body })
}

/**
 * '원본과 달라요'로 표시한 항목을 함께 보내 L1 재분석을 요청한다 (US-03).
 * POST /api/drafts/{id}/fields/reanalyze  body { flagged_field_ids: [...] }
 * → getFields 와 같은 모양. 표시 0개면 400 NO_FLAGGED_FIELD, 3회 넘으면 429 REANALYSIS_LIMIT
 */
export function requestReanalysis(draftId, flaggedIds, lang) {
  if (USE_MOCK) return mock.requestReanalysis(draftId, flaggedIds, lang)
  return request(`/drafts/${draftId}/fields/reanalyze?lang=${encodeURIComponent(lang)}`, {
    method: 'POST',
    body: { flagged_field_ids: flaggedIds },
  })
}

/** 원본 파일 주소 (서버가 본인 확인 후 내려준다) */
export function documentUrl(draftId) {
  return `/api/drafts/${draftId}/document`
}

// 확정 때 보내는 구조. description·bbox 는 LLM/OCR 값이라 사용자가 고치지 않으므로 보내지 않는다.
function toConfirmPayload(f) {
  return {
    id: f.id,
    label: f.label.trim(),
    format_code: f.format_code,
    required: f.required,
    prior_info_key: f.prior_info_key ?? null,
    options: f.format_code === 'choice' ? f.options : null,
    flagged_wrong: Boolean(f.flagged_wrong),
  }
}
