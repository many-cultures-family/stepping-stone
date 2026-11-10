// 서류 업로드 목데이터. VITE_USE_MOCK=true 일 때 src/api/documents.js 가 대신 호출한다.
// docs/api/DOC-UPLOAD-API.md 항목 1 의 입력·출력 예시를 옮겼다. 실서버에는 아직 없는 글자 인식 단계를 건너뛰어
// 바로 `field_check` 단계 작성 건이 생긴다(목 전용). 만든 작성 건은 작성 목록 목에도 들어간다.
import { ApiError } from '../api/client.js'
import { addDraft } from './drafts.js'

const delay = (ms) => new Promise((resolve) => setTimeout(resolve, ms))
const ALLOWED_MIME_TYPES = ['application/pdf', 'image/png', 'image/jpeg']

export async function uploadDocument(file) {
  await delay(500)
  if (!file) throw new ApiError('파일 없음', { status: 400, code: 'FILE_REQUIRED' })
  if (!ALLOWED_MIME_TYPES.includes(file.type)) {
    throw new ApiError('허용하지 않는 형식', { status: 415, code: 'FILE_TYPE_NOT_ALLOWED' })
  }
  const d = addDraft({ step: 'field_check' })
  return {
    draft: { id: d.id, status: d.status, step: d.step },
    document: { mime_type: file.type, page_count: 1 },
  }
}
