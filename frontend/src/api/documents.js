// 서류 관련 API.
// 업로드는 docs/api/DOC-UPLOAD-API.md 항목 1 (POST /api/drafts),
// 글자 인식·개인정보 가림은 docs/api/OCR-API.md 항목 1 (POST /api/drafts/{id}/document:recognize). 화면 코드는 이 함수만 쓴다.
import { request, USE_MOCK } from './client.js'
import * as mock from '../mocks/documents.js'

/**
 * 서류 올리기 (US-01 #1, `POST /api/drafts`)
 * → { draft: { id, status, step }, document: { mime_type, page_count } }
 * 성공하면 작성 건이 status=`수정`/step=`upload`(backlog '업로드됨')로 생긴다. 이어서 recognizeDocument 를 부른다.
 */
export function uploadDocument(file) {
  if (USE_MOCK) return mock.uploadDocument(file)
  const form = new FormData()
  form.append('file', file)
  return request('/drafts', { method: 'POST', body: form })
}

/**
 * 글자 인식·개인정보 가림 (US-01 #2·#3·#4, OCR-API.md 항목 1). 업로드 성공 직후 화면이 부른다.
 * 인식이 끝날 때까지 기다린다(동기). 서버를 켠 뒤 첫 요청은 OCR 모델 로딩 때문에 30초쯤 걸릴 수 있다.
 * → 성공: { draft: { id, status: '수정', step: 'field_check' }, document: { page_count, empty_pages } }
 * → 반려: { draft: { id, status: '반려', step: 'upload', reject_reason } }  (요청은 성공이라 200)
 *   reject_reason: OCR_FAILED · PAGE_MISSING · PII_REMAINING
 * 오류: 409 DRAFT_STEP_INVALID(이미 인식함) · 409 DRAFT_NOT_EDITABLE(반려·취소된 건) · 401 · 403 · 404
 */
export function recognizeDocument(draftId) {
  if (USE_MOCK) return mock.recognizeDocument(draftId)
  return request(`/drafts/${draftId}/document:recognize`, { method: 'POST' })
}
