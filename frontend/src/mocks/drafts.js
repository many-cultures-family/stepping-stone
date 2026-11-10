// 작성 목록(F-08) 목데이터. VITE_USE_MOCK=true 일 때 src/api/drafts.js 가 대신 호출한다.
// 응답 모양·오류 코드는 docs/api/DRAFT-STATUS-API.md 와 PR #14 서버 구현(next_action 계산)을 그대로 옮겼다.
// next_action 8가지가 모두 화면에 보이도록 시드를 만들었다. 실제 개인정보는 없다.
import { ApiError } from '../api/client.js'

const delay = (ms) => new Promise((resolve) => setTimeout(resolve, ms))

const LISTABLE_STATUSES = ['수정', '반려', '성공']
const STEP_NEXT_ACTION = {
  upload: 'UPLOAD',
  field_check: 'FIELD_CHECK',
  prior_info: 'PRIOR_INFO',
  writing: 'WRITING',
  review: 'REVIEW',
}

// 서버 drafts.py next_action() 과 같은 규칙
function nextAction(d) {
  if (d.status === '반려') return 'REJECTED'
  if (d.status === '성공') return d.submitted_at ? 'DONE' : 'SUBMIT'
  return STEP_NEXT_ACTION[d.step]
}

const drafts = [
  { id: 1, status: '수정', step: 'field_check', reject_reason: null, submitted_at: null },
  { id: 2, status: '수정', step: 'writing', reject_reason: null, submitted_at: null },
  { id: 3, status: '성공', step: 'review', reject_reason: null, submitted_at: null },
  { id: 4, status: '성공', step: 'review', reject_reason: null, submitted_at: '2026-11-08T05:30:00Z' },
  { id: 5, status: '반려', step: 'upload', reject_reason: 'OCR_FAILED', submitted_at: null },
  { id: 6, status: '수정', step: 'prior_info', reject_reason: null, submitted_at: null },
  { id: 7, status: '수정', step: 'review', reject_reason: null, submitted_at: null },
  { id: 8, status: '수정', step: 'upload', reject_reason: null, submitted_at: null },
]

const toItem = (d) => ({ ...d, next_action: nextAction(d) })

export async function listDrafts(status) {
  await delay(400)
  if (status !== undefined && status !== null && !LISTABLE_STATUSES.includes(status)) {
    throw new ApiError('STATUS_NOT_ALLOWED', { status: 400, code: 'STATUS_NOT_ALLOWED' })
  }
  const rows = drafts.filter((d) => (status ? d.status === status : d.status !== '취소'))
  return { drafts: rows.map(toItem) }
}

function find(draftId) {
  const d = drafts.find((x) => x.id === Number(draftId))
  if (!d) throw new ApiError('DRAFT_NOT_FOUND', { status: 404, code: 'DRAFT_NOT_FOUND' })
  return d
}

export async function submitDraft(draftId) {
  await delay(500)
  const d = find(draftId)
  if (d.status !== '성공') throw new ApiError('DRAFT_NOT_READY', { status: 409, code: 'DRAFT_NOT_READY' })
  if (d.submitted_at) throw new ApiError('ALREADY_SUBMITTED', { status: 409, code: 'ALREADY_SUBMITTED' })
  // 서버처럼 초 단위 UTC + Z
  d.submitted_at = new Date().toISOString().replace(/\.\d{3}Z$/, 'Z')
  // status 는 바꾸지 않는다 (R10)
  return { id: d.id, status: d.status, submitted_at: d.submitted_at }
}

export async function cancelDraft(draftId) {
  await delay(500)
  const d = find(draftId)
  if (d.status === '취소') throw new ApiError('ALREADY_CANCELED', { status: 409, code: 'ALREADY_CANCELED' })
  d.status = '취소'
  return { id: d.id, status: '취소' }
}

/** 업로드한 작성 건을 목록에 더한다 (mocks/documents.js 가 부른다) */
export function addDraft(patch = {}) {
  const id = drafts.reduce((m, d) => Math.max(m, d.id), 0) + 1
  const d = { id, status: '수정', step: 'upload', reject_reason: null, submitted_at: null, ...patch }
  drafts.push(d)
  return d
}

/** 다른 목이 단계·상태를 바꿨을 때 목록에도 반영한다 (항목 확정, 사전 정보 저장, 검토 마치기) */
export function updateDraft(draftId, patch) {
  const d = drafts.find((x) => x.id === Number(draftId))
  if (d) Object.assign(d, patch)
}
