// 서류 업로드·글자 인식 목데이터. VITE_USE_MOCK=true 일 때 src/api/documents.js 가 대신 호출한다.
// docs/api/DOC-UPLOAD-API.md 항목 1, docs/api/OCR-API.md 항목 1 의 입력·출력 예시를 옮겼다.
// 실서버처럼 업로드하면 step=upload 로 생기고, 인식이 끝나야 field_check 로 넘어간다. 만든 작성 건은 작성 목록 목에도 들어간다.
// 반려 화면을 보려면 파일 이름에 ocr-fail / page-missing / pii-remaining 을 넣어 올린다 (목 전용).
import { ApiError } from '../api/client.js'
import { addDraft, findDraft, updateDraft } from './drafts.js'

const delay = (ms) => new Promise((resolve) => setTimeout(resolve, ms))
const ALLOWED_MIME_TYPES = ['application/pdf', 'image/png', 'image/jpeg']

// 작성 건 id → 올린 파일 이름 (반려 흉내용)
const fileNames = new Map()

const FAIL_BY_NAME = [
  ['ocr-fail', 'OCR_FAILED'],
  ['page-missing', 'PAGE_MISSING'],
  ['pii-remaining', 'PII_REMAINING'],
]

export async function uploadDocument(file) {
  await delay(500)
  if (!file) throw new ApiError('파일 없음', { status: 400, code: 'FILE_REQUIRED' })
  if (!ALLOWED_MIME_TYPES.includes(file.type)) {
    throw new ApiError('허용하지 않는 형식', { status: 415, code: 'FILE_TYPE_NOT_ALLOWED' })
  }
  const d = addDraft({ step: 'upload' })
  fileNames.set(d.id, file.name)
  return {
    draft: { id: d.id, status: d.status, step: d.step },
    document: { mime_type: file.type, page_count: 1 },
  }
}

// 반려 건에 다시 올리기 (POST .../document:reupload, 백엔드 PR #38). 같은 작성 건이 수정·upload 로 돌아간다
export async function reuploadDocument(draftId, file) {
  await delay(500)
  const d = findDraft(draftId)
  if (!d) throw new ApiError('DRAFT_NOT_FOUND', { status: 404, code: 'DRAFT_NOT_FOUND' })
  if (!file) throw new ApiError('파일 없음', { status: 400, code: 'FILE_REQUIRED' })
  if (!ALLOWED_MIME_TYPES.includes(file.type)) {
    throw new ApiError('허용하지 않는 형식', { status: 415, code: 'FILE_TYPE_NOT_ALLOWED' })
  }
  // 서버와 같이 반려 건이면 단계와 상관없이 받는다
  if (d.status !== '반려') throw new ApiError('DRAFT_NOT_REJECTED', { status: 409, code: 'DRAFT_NOT_REJECTED' })
  updateDraft(d.id, { status: '수정', step: 'upload', reject_reason: null })
  fileNames.set(d.id, file.name)
  return {
    draft: { id: d.id, status: '수정', step: 'upload' },
    document: { mime_type: file.type, page_count: 1 },
  }
}

export async function recognizeDocument(draftId) {
  await delay(1500)
  const d = findDraft(draftId)
  if (!d) throw new ApiError('DRAFT_NOT_FOUND', { status: 404, code: 'DRAFT_NOT_FOUND' })
  if (d.step !== 'upload') throw new ApiError('DRAFT_STEP_INVALID', { status: 409, code: 'DRAFT_STEP_INVALID' })
  if (d.status !== '수정') throw new ApiError('DRAFT_NOT_EDITABLE', { status: 409, code: 'DRAFT_NOT_EDITABLE' })

  const name = (fileNames.get(d.id) ?? '').toLowerCase()
  const reason = FAIL_BY_NAME.find(([key]) => name.includes(key))?.[1]
  if (reason) {
    updateDraft(d.id, { status: '반려', reject_reason: reason })
    return { draft: { id: d.id, status: '반려', step: 'upload', reject_reason: reason } }
  }
  updateDraft(d.id, { step: 'field_check' })
  return {
    draft: { id: d.id, status: '수정', step: 'field_check' },
    document: { page_count: 1, empty_pages: [] },
  }
}
