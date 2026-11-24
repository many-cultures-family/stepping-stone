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

// 반려된 작성 건에 다른 파일을 다시 올리는 API 가 실서버에 있는지.
// 서버 API 는 백엔드 PR #38(w8/t01) `document:reupload` 다. 그 PR 이 main 에 들어가기 전에는 실서버에서 404 가 난다.
// 서버를 되돌려야 하면 이 값을 USE_MOCK 으로 바꾸면 화면이 '새로 올리기' 안내로 돌아간다.
export const REUPLOAD_AVAILABLE = true

/**
 * 반려된 작성 건에 문서 다시 올리기 `POST /api/drafts/{id}/document:reupload` (multipart `file`, 백엔드 PR #38 [명세 없음, 제안]).
 * 반려 건이면 단계와 상관없이 받는다. 서버가 상태·단계·사유와 확정 시각을 비우고, 옛 원본과 그 문서로 만든 입력 항목을 지운다.
 * DATA-MODEL.md 규칙: 작성 건 하나에 문서는 하나라 다시 올리면 문서를 바꾸고 옛 파일·입력 항목을 지운다.
 * 상태는 `반려 → 수정`, 단계는 `upload` 로 돌아간다(03-rules-states-llm.md). 이어서 recognizeDocument 를 부른다.
 * → { draft: { id, status: '수정', step: 'upload' }, document: { mime_type, page_count } }  (uploadDocument 와 같은 모양)
 * 오류: 400 FILE_REQUIRED · 415 FILE_TYPE_NOT_ALLOWED · 409 DRAFT_NOT_REJECTED(반려가 아닌 건) · 401 · 403 · 404
 */
export function reuploadDocument(draftId, file) {
  if (USE_MOCK) return mock.reuploadDocument(draftId, file)
  const form = new FormData()
  form.append('file', file)
  return request(`/drafts/${draftId}/document:reupload`, { method: 'POST', body: form })
}

/**
 * 원본 한 페이지 이미지 주소 (`GET /api/drafts/{id}/document/pages/{page}`, page 는 1부터, VIRTUAL-FORM-API.md 항목 3 [제안]).
 * 단계 제한이 없어 F-02 입력 항목 확인 미리보기와 F-04 가상 작성이 같이 쓴다. 취소된 건은 404 DOCUMENT_NOT_FOUND,
 * 없는 쪽은 404 PAGE_NOT_FOUND. PDF 는 서버가 PNG 로 그려 준다. 목 모드에서는 null (화면이 샘플 서식·메모리 파일을 대신 쓴다).
 */
export function pageImageUrl(draftId, page) {
  if (USE_MOCK) return null
  return `/api/drafts/${draftId}/document/pages/${page}`
}
