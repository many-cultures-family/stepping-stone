// 입력 항목 확인(F-02) 목데이터. VITE_USE_MOCK=true 일 때 src/api/fields.js 가 대신 호출한다.
// 실제 개인정보는 쓰지 않는다. bbox 는 아래 샘플 서식(DocumentPreview 의 SampleForm)과 위치를 맞췄다.
import { ApiError } from '../api/client.js'

const delay = (ms) => new Promise((resolve) => setTimeout(resolve, ms))

// DATA-MODEL.md input_format 허용 목록 (주민등록번호·외국인등록번호 형식은 넣지 않는다, R8)
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

// 언어별 설명 (L1 이 사용 언어로 만든 값이라고 가정)
const DESCRIPTIONS = {
  ko: {
    f1: '여권에 적힌 영문 이름을 그대로 적어요.',
    f2: '한글 이름이 있으면 적어요. 없으면 비워 둬도 돼요.',
    f3: '태어난 날을 연.월.일 순서로 적어요.',
    f4: '연락받을 수 있는 휴대전화 번호예요.',
    f5: '지금 살고 있는 집 주소를 적어요.',
    f6: '한국에 머무는 이유를 보기에서 하나 골라요.',
    f7: '왜 신청하는지 짧게 설명해요.',
    f8: '신청서를 쓴 날짜예요.',
  },
  vi: {
    f1: 'Viết tên tiếng Anh giống như trong hộ chiếu.',
    f2: 'Nếu có tên tiếng Hàn thì hãy viết. Không có thì để trống.',
    f3: 'Viết ngày sinh theo thứ tự năm.tháng.ngày.',
    f4: 'Số điện thoại di động để liên lạc.',
    f5: 'Viết địa chỉ nhà bạn đang sống.',
    f6: 'Chọn một lý do bạn ở Hàn Quốc.',
    f7: 'Giải thích ngắn gọn lý do bạn đăng ký.',
    f8: 'Ngày bạn viết đơn này.',
  },
}

function initialFields() {
  return [
    { id: 'f1', label: '성명(영문)', format_code: 'name', required: true, prior_info_key: 'name', options: null, bbox: { page: 1, x: 0.08, y: 0.16, w: 0.84, h: 0.06 } },
    { id: 'f2', label: '성명(한글)', format_code: 'name', required: false, prior_info_key: null, options: null, bbox: { page: 1, x: 0.08, y: 0.24, w: 0.84, h: 0.06 } },
    { id: 'f3', label: '생년월일', format_code: 'date', required: true, prior_info_key: 'birth_date', options: null, bbox: { page: 1, x: 0.08, y: 0.32, w: 0.4, h: 0.06 } },
    // 형식이 비어 있는 항목 → 규칙 검증 실패 상태를 보여 주기 위한 예시 (US-02 실패·거절)
    { id: 'f4', label: '휴대전화', format_code: null, required: true, prior_info_key: 'phone', options: null, bbox: { page: 1, x: 0.52, y: 0.32, w: 0.4, h: 0.06 } },
    { id: 'f5', label: '대한민국 내 주소', format_code: 'address', required: true, prior_info_key: 'address', options: null, bbox: { page: 1, x: 0.08, y: 0.40, w: 0.84, h: 0.06 } },
    { id: 'f6', label: '체류 목적', format_code: 'choice', required: true, prior_info_key: null, options: ['결혼이민', '취업', '유학', '기타'], bbox: { page: 1, x: 0.08, y: 0.50, w: 0.84, h: 0.08 } },
    { id: 'f7', label: '신청 사유', format_code: 'long_text', required: false, prior_info_key: null, options: null, bbox: { page: 1, x: 0.08, y: 0.62, w: 0.84, h: 0.16 } },
    { id: 'f8', label: '신청일', format_code: 'date', required: true, prior_info_key: null, options: null, bbox: { page: 1, x: 0.52, y: 0.84, w: 0.4, h: 0.06 } },
  ].map((f) => ({ ...f, flagged_wrong: false }))
}

const drafts = new Map()

function getDraft(draftId) {
  const key = String(draftId)
  if (!drafts.has(key)) {
    drafts.set(key, {
      draft: { id: Number(draftId), status: '수정', step: 'upload', reanalysis_count: 0, reanalysis_limit: 3 },
      fields: initialFields(),
    })
  }
  return drafts.get(key)
}

function withDescriptions(fields, lang) {
  const text = DESCRIPTIONS[lang] ?? DESCRIPTIONS.ko
  return fields.map((f) => ({ ...f, description: text[f.id] ?? '' }))
}

export async function getFields(draftId, lang) {
  await delay(700)
  const d = getDraft(draftId)
  return { draft: { ...d.draft }, formats: FORMATS, fields: withDescriptions(d.fields, lang) }
}

export async function confirmFields(draftId, body) {
  await delay(600)
  // 실제 서버가 받는 구조를 개발 중 확인할 수 있게 남긴다
  console.info('[mock] POST /api/drafts/%s/fields/confirm', draftId, body)
  const allowed = FORMATS.map((f) => f.code)
  const errors = body.fields
    .filter((f) => !f.label || !allowed.includes(f.format_code) || typeof f.required !== 'boolean')
    .map((f) => ({ field_id: f.id, reason: 'FIELD_INVALID' }))
  if (errors.length) throw new ApiError('FIELD_INVALID', { status: 422, code: 'FIELD_INVALID' })

  const d = getDraft(draftId)
  d.draft = { ...d.draft, step: 'prior_info' }
  return { draft: { id: d.draft.id, status: d.draft.status, step: d.draft.step }, fields_confirmed_at: new Date().toISOString() }
}

export async function requestReanalysis(draftId, flaggedIds, lang) {
  await delay(1400)
  console.info('[mock] POST /api/drafts/%s/fields/reanalyze', draftId, { flagged_field_ids: flaggedIds })
  if (!flaggedIds.length) throw new ApiError('NO_FLAGGED_FIELD', { status: 400, code: 'NO_FLAGGED_FIELD' })
  const d = getDraft(draftId)
  if (d.draft.reanalysis_count >= d.draft.reanalysis_limit) {
    throw new ApiError('REANALYSIS_LIMIT', { status: 429, code: 'REANALYSIS_LIMIT' })
  }
  // 재분석 결과 흉내: 표시한 항목의 형식을 다시 채우고 표시를 지운다
  const fixedFormat = { f4: 'phone' }
  d.fields = d.fields.map((f) =>
    flaggedIds.includes(f.id)
      ? { ...f, format_code: f.format_code ?? fixedFormat[f.id] ?? 'short_text', flagged_wrong: false }
      : f,
  )
  d.draft = { ...d.draft, reanalysis_count: d.draft.reanalysis_count + 1 }
  return { draft: { ...d.draft }, formats: FORMATS, fields: withDescriptions(d.fields, lang) }
}
