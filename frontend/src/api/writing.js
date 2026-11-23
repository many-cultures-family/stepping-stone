// 가상 작성(F-04) API. docs/api/VIRTUAL-FORM-API.md 항목 1·2 (+ 원본 페이지 이미지 주소는 documents.js).
// 입력값·사전 정보는 서버에 보내지 않는다 (no-server-storage-user-input.md). 서버는 칸 정보·형식 규칙·원본 이미지만 준다.
import { request, USE_MOCK } from './client.js'
import * as mock from '../mocks/writing.js'

/**
 * 가상 작성 칸 정보 (항목 1, `GET /api/drafts/{id}/form`). step 이 writing·review 일 때만.
 * → { draft: { id, status, step }, document: { page_count },
 *     fields: [{ field_id, label, format_code, format_label, format_example, pattern, required,
 *                prior_info_key, description, options, bbox }] }
 * bbox·document 는 명세 응답에 더한 값이다 (원본 위에 입력칸을 겹쳐 그리는 데 씀).
 */
export function getForm(draftId) {
  if (USE_MOCK) return mock.getForm(draftId)
  return request(`/drafts/${draftId}/form`)
}

/** 작성 시작 (항목 2, `POST /api/drafts/{id}/writing:start`). prior_info → writing → { draft } */
export function startWriting(draftId) {
  if (USE_MOCK) return mock.startWriting(draftId)
  return request(`/drafts/${draftId}/writing:start`, { method: 'POST' })
}

// 원본 한 페이지 이미지 주소는 F-02 미리보기도 같이 쓰므로 documents.js 에 둔다
export { pageImageUrl } from './documents.js'
