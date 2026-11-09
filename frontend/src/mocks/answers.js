// 가상 작성(F-04) 목데이터. VITE_USE_MOCK=true 일 때 src/api/answers.js 가 대신 호출한다.
// 응답 모양은 docs/api/VIRTUAL-FORM-API.md "입력·출력 예시"를 그대로 옮겼다 (계약 일치 검사 역할).
// 사전 정보는 DATA-MODEL.md 시드 2번 값 + 데모용 가짜 주소다. 실제 개인정보는 쓰지 않는다.
// 불일치는 저장하지 않고 매번 계산한다 (DATA-MODEL.md 86행).
import { ApiError } from '../api/client.js'
import { FORMATS } from './fields.js'

const delay = (ms) => new Promise((resolve) => setTimeout(resolve, ms))
const formatOf = (code) => FORMATS.find((f) => f.code === code) ?? null

const PRIOR_INFO = {
  name: '테스트 사용자',
  birth_date: '1990.01.01',
  phone: '010-0000-1234',
  address: '서울특별시 중구 세종대로 110, 101동 202호',
}

// 칸 정의 + 시연용 처음 값. 첫 칸은 명세 예시(field_id 12, 보호자 연락처)와 같다.
const BASE = [
  { label: '신청인 성명', format_code: 'name', required: true, prior_info_key: 'name', description: '여권에 적힌 이름을 그대로 적습니다', options: null, value: '테스트 사용자', acknowledged: false },
  { label: '생년월일', format_code: 'date', required: true, prior_info_key: 'birth_date', description: '태어난 날을 적습니다', options: null, value: '1990.01.11', acknowledged: false },
  { label: '보호자 연락처', format_code: 'phone', required: true, prior_info_key: 'phone', description: '자녀의 보호자 전화번호를 적습니다', options: null, value: '010-0000-5678', acknowledged: false },
  { label: '대한민국 내 주소', format_code: 'address', required: true, prior_info_key: 'address', description: '지금 살고 있는 집 주소를 적습니다', options: null, value: '서울특별시 중구 세종대로 110, 303동 404호', acknowledged: false },
  { label: '체류 목적', format_code: 'choice', required: true, prior_info_key: null, description: '한국에 머무는 이유를 보기에서 하나 고릅니다', options: ['결혼이민', '취업', '유학', '기타'], value: null, acknowledged: false },
  { label: '신청 사유', format_code: 'long_text', required: false, prior_info_key: null, description: '왜 신청하는지 짧게 설명합니다', options: null, value: null, acknowledged: false },
]

// 형식 검증 정규식 (일반 형식만). long_text 는 통과, choice 는 options 포함 여부
const PATTERNS = {
  phone: /^01\d-\d{3,4}-\d{4}$/,
  date: /^\d{4}\.\d{2}\.\d{2}$/,
  email: /^[^\s@]+@[^\s@]+\.[^\s@]+$/,
  number: /^\d+$/,
  name: /^[A-Za-z가-힣][A-Za-z가-힣 .'-]{0,59}$/,
  address: /^.{2,100}$/,
  short_text: /^.{1,100}$/,
}

const states = new Map()

function stateFor(draftId) {
  const key = String(draftId)
  if (!states.has(key)) {
    states.set(key, {
      draft: { id: Number(draftId), status: '수정', step: 'writing' },
      fields: BASE.map((f, i) => {
        const fmt = formatOf(f.format_code)
        return { field_id: 12 + i, ...f, format_label: fmt?.label ?? null, format_example: fmt?.example ?? null }
      }),
    })
  }
  return states.get(key)
}

// 상태 오류 시연: /drafts/998/write → 409 DRAFT_STEP_INVALID, /drafts/999/write → 409 DRAFT_NOT_EDITABLE
function guard(draftId) {
  if (Number(draftId) === 998) throw new ApiError('DRAFT_STEP_INVALID', { status: 409, code: 'DRAFT_STEP_INVALID' })
  if (Number(draftId) === 999) throw new ApiError('DRAFT_NOT_EDITABLE', { status: 409, code: 'DRAFT_NOT_EDITABLE' })
}

function findField(s, fieldId) {
  const f = s.fields.find((x) => x.field_id === Number(fieldId))
  if (!f) throw new ApiError('FIELD_NOT_FOUND', { status: 404, code: 'FIELD_NOT_FOUND' })
  return f
}

/** 사전 정보와 비교해 mismatch 를 매번 계산한다 (저장 안 함). 값 비교는 앞뒤 공백을 뗀 뒤 한다. */
export function computeMismatch(field, value) {
  const prior = field.prior_info_key ? PRIOR_INFO[field.prior_info_key] : undefined
  if (prior === undefined) return { has_prior_info: false }
  const differs = (value ?? '').trim() !== prior.trim()
  return { has_prior_info: true, prior_value: prior, differs, mismatch_acknowledged: differs ? field.acknowledged : false }
}

function validate(field, value) {
  if (value === null || value === undefined || value === '') return true
  if (field.format_code === 'long_text') return true
  if (field.format_code === 'choice') return field.options?.includes(value) ?? false
  const pattern = PATTERNS[field.format_code]
  return pattern ? pattern.test(value.trim()) : true
}

function toAnswer(f) {
  const { acknowledged: _acknowledged, ...rest } = f
  return { ...rest, mismatch: computeMismatch(f, f.value) }
}

export async function getAnswers(draftId) {
  await delay(400)
  guard(draftId)
  const s = stateFor(draftId)
  return { draft: { ...s.draft }, answers: s.fields.map(toAnswer) }
}

export async function saveAnswer(draftId, fieldId, value) {
  await delay(350)
  console.info('[mock] PUT /api/drafts/%s/answers/%s', draftId, fieldId, { value })
  guard(draftId)
  const s = stateFor(draftId)
  const f = findField(s, fieldId)
  if (!validate(f, value)) throw new ApiError('FORMAT_INVALID', { status: 400, code: 'FORMAT_INVALID' })
  const next = value === '' ? null : value
  // 값이 바뀌면 '그대로 둘게요' 확인은 풀린다 (R11을 값 변경에도 적용 [제안])
  if (next !== f.value) f.acknowledged = false
  f.value = next
  return { field_id: f.field_id, value: f.value, mismatch: computeMismatch(f, f.value) }
}

export async function acknowledgeMismatch(draftId, fieldId) {
  await delay(250)
  console.info('[mock] POST /api/drafts/%s/answers/%s:acknowledge-mismatch', draftId, fieldId)
  guard(draftId)
  const s = stateFor(draftId)
  const f = findField(s, fieldId)
  if (!computeMismatch(f, f.value).differs) throw new ApiError('NO_MISMATCH', { status: 400, code: 'NO_MISMATCH' })
  f.acknowledged = true
  return { field_id: f.field_id, mismatch_acknowledged: true }
}
