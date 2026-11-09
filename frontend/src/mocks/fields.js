// 입력 항목 확인(F-02) 목데이터. VITE_USE_MOCK=true 일 때 src/api/fields.js 가 대신 호출한다.
// 응답 모양은 docs/api/FIELD-CHECK-API.md "입력·출력 예시"를 그대로 옮겼다 (계약 일치 검사 역할).
// 실제 개인정보는 쓰지 않는다. bbox 는 DocumentPreview 의 샘플 서식과 위치를 맞췄다.
import { ApiError } from '../api/client.js'
import { REANALYSIS_LIMIT } from '../api/limits.js'

const delay = (ms) => new Promise((resolve) => setTimeout(resolve, ms))

// [목 전용] 수정 창의 형식 선택 목록. 명세 응답에는 없다 (GET /api/input-formats 는 "아직 없는 항목").
// 주민등록번호·외국인등록번호 형식은 넣지 않는다 (R8)
export const FORMATS = [
  { code: 'name', label: '이름', example: '홍길동' },
  { code: 'date', label: '날짜', example: 'YYYY.MM.DD' },
  { code: 'phone', label: '전화번호', example: '010-0000-0000' },
  { code: 'email', label: '이메일', example: 'name@example.com' },
  { code: 'number', label: '숫자', example: '123' },
  { code: 'address', label: '주소', example: '도로명 주소' },
  { code: 'short_text', label: '짧은 글', example: '100자 이내' },
  { code: 'long_text', label: '서술형', example: '여러 줄 글' },
  { code: 'choice', label: '선택형', example: '보기 중 하나 고르기' },
]
const formatOf = (code) => FORMATS.find((f) => f.code === code) ?? null

// 서버가 L1 결과를 저장한 상태를 흉내 낸다. 기본 설명은 user.language 로 한 번 만든 값이다.
// 첫 두 항목은 명세 예시 JSON(id 12·13, 13번은 FORMAT_CODE_INVALID)과 같다.
const BASE_FIELDS = [
  { label: '보호자 연락처', format_code: 'phone', required: true, prior_info_key: 'phone', description: '자녀의 보호자 전화번호를 적습니다', options: null, bbox: { page: 1, x: 0.1, y: 0.3, w: 0.4, h: 0.04 } },
  { label: '생년월일', format_code: null, required: true, prior_info_key: 'birth_date', description: '태어난 날을 적습니다', options: null, bbox: { page: 1, x: 0.1, y: 0.4, w: 0.4, h: 0.04 } },
  { label: '성명(영문)', format_code: 'name', required: true, prior_info_key: 'name', description: '여권에 적힌 영문 이름을 그대로 적습니다', options: null, bbox: { page: 1, x: 0.08, y: 0.16, w: 0.84, h: 0.06 } },
  { label: '대한민국 내 주소', format_code: 'address', required: true, prior_info_key: 'address', description: '지금 살고 있는 집 주소를 적습니다', options: null, bbox: { page: 1, x: 0.08, y: 0.5, w: 0.84, h: 0.06 } },
  { label: '체류 목적', format_code: 'choice', required: true, prior_info_key: null, description: '한국에 머무는 이유를 보기에서 하나 고릅니다', options: ['결혼이민', '취업', '유학', '기타'], bbox: { page: 1, x: 0.08, y: 0.6, w: 0.84, h: 0.08 } },
  { label: '신청 사유', format_code: 'long_text', required: false, prior_info_key: null, description: '왜 신청하는지 짧게 설명합니다', options: null, bbox: { page: 1, x: 0.08, y: 0.72, w: 0.84, h: 0.14 } },
]

let nextId = 12
const states = new Map()

function makeFields(overrides = {}) {
  return BASE_FIELDS.map((f, i) => {
    const merged = { ...f, ...(overrides[i] ?? {}) }
    const fmt = formatOf(merged.format_code)
    return { id: nextId++, ...merged, format_label: fmt?.label ?? null, format_example: fmt?.example ?? null, flagged_wrong: false }
  })
}

function stateFor(draftId) {
  const key = String(draftId)
  if (!states.has(key)) {
    states.set(key, {
      draft: { id: Number(draftId), status: '수정', step: 'field_check', fields_confirmed_at: null, reanalysis_count: 0 },
      fields: null, // null = 아직 추론 전
    })
  }
  return states.get(key)
}

// 서버 규칙 검증(R2)을 흉내: 허용 목록에 없는 형식이면 FORMAT_CODE_INVALID, 필수 여부가 비면 REQUIRED_MISSING
function computeErrors(fields) {
  const allowed = FORMATS.map((f) => f.code)
  const errors = []
  for (const f of fields) {
    if (!allowed.includes(f.format_code)) errors.push({ field_id: f.id, code: 'FORMAT_CODE_INVALID' })
    if (typeof f.required !== 'boolean') errors.push({ field_id: f.id, code: 'REQUIRED_MISSING' })
  }
  return errors
}

function snapshot(s) {
  const body = { draft: { ...s.draft }, fields: s.fields.map((f) => ({ ...f })) }
  const errors = computeErrors(s.fields)
  if (errors.length) body.errors = errors
  return body
}

// 상태 오류 시연: /drafts/998/fields → 409 DRAFT_STEP_INVALID, /drafts/999/fields → 409 DRAFT_NOT_EDITABLE
function guard(draftId) {
  if (Number(draftId) === 998) throw new ApiError('DRAFT_STEP_INVALID', { status: 409, code: 'DRAFT_STEP_INVALID' })
  if (Number(draftId) === 999) throw new ApiError('DRAFT_NOT_EDITABLE', { status: 409, code: 'DRAFT_NOT_EDITABLE' })
}

export async function getFields(draftId) {
  await delay(300)
  guard(draftId)
  const s = stateFor(draftId)
  if (!s.fields) return { draft: { ...s.draft }, fields: [] }
  return snapshot(s)
}

// 멱등: 이미 항목이 있으면 L1 을 다시 부르지 않고 저장된 값을 돌려준다
export async function inferFields(draftId) {
  guard(draftId)
  const s = stateFor(draftId)
  if (s.fields) {
    await delay(300)
    return snapshot(s)
  }
  await delay(900)
  s.fields = makeFields()
  return snapshot(s)
}

export async function requestReanalysis(draftId, flaggedIds) {
  await delay(1400)
  console.info('[mock] POST /api/drafts/%s/fields:infer', draftId, { flagged_field_ids: flaggedIds })
  guard(draftId)
  const s = stateFor(draftId)
  if (!flaggedIds?.length) throw new ApiError('NO_FIELDS_FLAGGED', { status: 400, code: 'NO_FIELDS_FLAGGED' })
  if (flaggedIds.some((id) => !s.fields?.some((f) => f.id === id))) {
    throw new ApiError('FIELD_NOT_FOUND', { status: 404, code: 'FIELD_NOT_FOUND' })
  }
  if (s.draft.reanalysis_count >= REANALYSIS_LIMIT) {
    throw new ApiError('REANALYSIS_LIMIT_EXCEEDED', { status: 409, code: 'REANALYSIS_LIMIT_EXCEEDED' })
  }
  // 전체 교체: 기존 항목을 지우고 새 id 로 만든다. 사용자가 고친 값과 표시는 모두 사라진다.
  // 재분석 결과 흉내: 형식이 비어 있던 생년월일을 L1 이 이번에는 date 로 채운다
  s.fields = makeFields({ 1: { format_code: 'date' } })
  s.draft = { ...s.draft, reanalysis_count: s.draft.reanalysis_count + 1, fields_confirmed_at: null }
  return snapshot(s)
}

export async function confirmFields(draftId) {
  await delay(600)
  console.info('[mock] POST /api/drafts/%s/fields:confirm', draftId)
  guard(draftId)
  const s = stateFor(draftId)
  const errors = computeErrors(s.fields ?? [])
  if (errors.length) {
    throw new ApiError('FIELDS_INVALID', { status: 400, code: 'FIELDS_INVALID', errors })
  }
  s.draft = { ...s.draft, step: 'prior_info', fields_confirmed_at: new Date().toISOString().replace(/\.\d+Z$/, 'Z') }
  return { draft: { id: s.draft.id, status: s.draft.status, step: s.draft.step, fields_confirmed_at: s.draft.fields_confirmed_at } }
}

// ---- 목 전용: 화면 안의 수정·표시. 서버 호출이 아니라 목 상태만 바꾼다 ----
// 수정(PATCH /fields/{id})은 명세에 없는 기능이라 목 모드에서만 동작한다.

/** '원본과 달라요' 표시는 재분석 요청 전까지 화면 상태일 뿐 서버에 저장되지 않는다. 목은 화면 쪽 상태가 진짜라서 아무것도 하지 않는다. */

/** 수정 창 저장 → 목 상태 반영 후 갱신된 응답 */
export function applyLocalEdit(draftId, next) {
  const s = stateFor(draftId)
  const fmt = formatOf(next.format_code)
  s.fields = s.fields.map((f) =>
    f.id === next.id
      ? { ...f, label: next.label, required: next.required, format_code: next.format_code, format_label: fmt?.label ?? null, format_example: fmt?.example ?? null, options: next.options ?? null }
      : f,
  )
  return snapshot(s)
}
