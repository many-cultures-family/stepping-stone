// 서류 관련 API.
// 업로드는 docs/API.md 항목 1 (POST /api/drafts). 화면 코드는 이 함수만 쓴다.
import { request, USE_MOCK } from './client.js'
import * as mock from '../mocks/documents.js'

/**
 * 서류 올리기 (US-01 #1, API.md 항목 1 `POST /api/drafts`)
 * → { draft: { id, status, step }, document: { mime_type, page_count } }
 * 성공하면 작성 건이 status=`수정`/step=`upload`(backlog '업로드됨')로 생긴다.
 * 실서버에는 upload→field_check 전이(글자 인식)가 아직 없어 step 이 계속 `upload` 다.
 */
export function uploadDocument(file) {
  if (USE_MOCK) return mock.uploadDocument(file)
  const form = new FormData()
  form.append('file', file)
  return request('/drafts', { method: 'POST', body: form })
}
