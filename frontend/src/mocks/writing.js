// 가상 작성(F-04) 목데이터. VITE_USE_MOCK=true 일 때 src/api/writing.js 가 대신 호출한다.
// 응답 모양은 docs/api/VIRTUAL-FORM-API.md 항목 1 예시 + bbox·적는 자리·document(서버 writing.py 와 같음).
// 칸 위치(bbox)는 OCR 이 줄마다 준 위치를 L1 이 고른 값과 같은 모양이다: 표 안 칸은 라벨 칸 위치, 날짜줄·서명란은 그 줄 위치.
// pattern 은 서버 db.py input_format 시드와 같다. 실제 개인정보는 없다.
import { ApiError } from '../api/client.js'
import { findDraft, updateDraft } from './drafts.js'

const delay = (ms) => new Promise((resolve) => setTimeout(resolve, ms))

const FORMAT = {
  name: { format_label: '이름', format_example: '홍길동', pattern: '^.{1,50}$' },
  date: { format_label: '날짜', format_example: 'YYYY.MM.DD', pattern: '^\\d{4}\\.\\d{2}\\.\\d{2}$' },
  phone: { format_label: '전화번호', format_example: '010-0000-0000', pattern: '^010-\\d{4}-\\d{4}$' },
  email: { format_label: '이메일', format_example: 'example@email.com', pattern: '^[^@\\s]+@[^@\\s]+\\.[^@\\s]+$' },
  address: { format_label: '주소', format_example: '○○시 ○○구 ○○로 00', pattern: '^.{1,200}$' },
  choice: { format_label: '선택형', format_example: '보기 중 선택', pattern: null },
  long_text: { format_label: '서술형', format_example: '자유롭게 작성', pattern: null },
  signature: { format_label: '서명', format_example: '직접 서명 또는 도장', pattern: null },
}

const field = (field_id, label, format_code, bbox, extra = {}) => ({
  field_id,
  label,
  format_code,
  ...FORMAT[format_code],
  required: true,
  prior_info_key: null,
  description: '',
  options: null,
  bbox: { page: 1, ...bbox },
  ...extra,
})

/** 샘플 서식(화면의 MockPage 가 그린다)과 같은 위치의 칸 */
export const MOCK_FIELDS = [
  field(101, '성명', 'name', { x: 0.1, y: 0.14, w: 0.04, h: 0.02 }, { prior_info_key: 'name', description: '여권이나 외국인등록증에 적힌 이름을 씁니다.' }),
  field(102, '생년월일', 'date', { x: 0.1, y: 0.185, w: 0.07, h: 0.02 }, { prior_info_key: 'birth_date', description: '태어난 날을 YYYY.MM.DD 로 씁니다.' }),
  field(103, '휴대전화', 'phone', { x: 0.1, y: 0.23, w: 0.08, h: 0.02 }, { prior_info_key: 'phone', description: '연락 받을 휴대전화 번호를 씁니다.' }),
  field(104, '주소', 'address', { x: 0.1, y: 0.275, w: 0.04, h: 0.02 }, { prior_info_key: 'address', description: '지금 사는 집 주소를 씁니다.' }),
  field(105, '자녀와의 관계', 'choice', { x: 0.1, y: 0.32, w: 0.11, h: 0.02 }, { options: ['부', '모', '기타'], description: '신청하는 자녀와 어떤 관계인지 고릅니다.' }),
  field(106, '신청 사유', 'long_text', { x: 0.1, y: 0.365, w: 0.08, h: 0.02 }, { required: false, description: '지원이 필요한 이유를 간단히 씁니다.' }),
  // 아래 칸들은 서버 layout.py 가 원본에서 찾는 '적는 자리'(option_bboxes·part_bboxes·input_bbox)도 함께 준다 (MockPage 그림과 같은 위치)
  field(109, '개인정보 수집·이용 동의', 'choice', { x: 0.1, y: 0.428, w: 0.8, h: 0.02 }, {
    options: ['동의합니다', '동의하지 않습니다'],
    description: '개인정보를 모으고 쓰는 데 동의하는지 하나만 고릅니다.',
    option_bboxes: [
      { page: 1, x: 0.598, y: 0.4275, w: 0.02, h: 0.0141 },
      { page: 1, x: 0.858, y: 0.4275, w: 0.02, h: 0.0141 },
    ],
  }),
  field(107, '신청일', 'date', { x: 0.45, y: 0.5, w: 0.24, h: 0.02 }, {
    description: '신청서를 쓰는 날짜를 씁니다.',
    part_bboxes: {
      year: { page: 1, x: 0.462, y: 0.5, w: 0.062, h: 0.02 },
      month: { page: 1, x: 0.556, y: 0.5, w: 0.05, h: 0.02 },
      day: { page: 1, x: 0.636, y: 0.5, w: 0.05, h: 0.02 },
    },
  }),
  field(110, '신청인 성명', 'name', { x: 0.38, y: 0.553, w: 0.52, h: 0.02 }, {
    prior_info_key: 'name',
    description: '신청하는 사람 이름을 밑줄 위에 씁니다.',
    input_bbox: { page: 1, x: 0.5, y: 0.5465, w: 0.26, h: 0.022 },
  }),
  field(108, '신청인 서명', 'signature', { x: 0.38, y: 0.553, w: 0.52, h: 0.02 }, {
    description: '실제 서류에 직접 서명하거나 도장을 찍는 칸이에요.',
    input_bbox: { page: 1, x: 0.795, y: 0.547, w: 0.09, h: 0.028 },
  }),
]

// 서버 layout.py 가 표 선으로 찾는 '값 칸'(input_bbox)을 흉내 낸다. 샘플 서식 표는 라벨 열 | 값 열(x 0.3~0.92), 행 높이 0.045
const TABLE_TOP = Math.min(...MOCK_FIELDS.filter((f) => f.bbox.w < 0.15).map((f) => f.bbox.y)) - 0.012
function mockInputBbox(f) {
  if (f.bbox.w >= 0.15 || f.format_code === 'signature') return null // 표 밖(날짜줄·서명란)
  const row = Math.round((f.bbox.y - 0.012 - TABLE_TOP) / 0.045)
  return { page: 1, x: 0.306, y: TABLE_TOP + row * 0.045 + 0.007, w: 0.608, h: 0.031 }
}

export async function getForm(draftId) {
  await delay(400)
  const d = findDraft(draftId)
  if (d && d.status !== '수정') throw new ApiError('DRAFT_NOT_EDITABLE', { status: 409, code: 'DRAFT_NOT_EDITABLE' })
  if (d && !['writing', 'review'].includes(d.step)) {
    throw new ApiError('DRAFT_STEP_INVALID', { status: 409, code: 'DRAFT_STEP_INVALID' })
  }
  return {
    draft: { id: Number(draftId), status: '수정', step: d?.step ?? 'writing' },
    document: { page_count: 1 },
    fields: MOCK_FIELDS.map((f) => ({
      ...f,
      bbox: { ...f.bbox },
      input_bbox: f.input_bbox ?? mockInputBbox(f),
      option_bboxes: f.option_bboxes ?? null,
      part_bboxes: f.part_bboxes ?? null,
    })),
  }
}

export async function startWriting(draftId) {
  await delay(300)
  updateDraft(draftId, { step: 'writing' })
  return { draft: { id: Number(draftId), status: '수정', step: 'writing' } }
}

// 서버 규칙(backend/app/prior_info_rules.py RULES)과 같은 모양. 목 모드에서만 쓴다
const TEXT_STEPS = [{ op: 'nfc' }, { op: 'remove', pattern: '[\\s\\-\u2010-\u2015]' }, { op: 'lowercase' }]
export async function getPriorInfoRules() {
  return {
    empty: 'not_mismatch',
    keys: [
      { key: 'name', format_code: 'name', steps: TEXT_STEPS },
      {
        key: 'birth_date',
        format_code: 'date',
        steps: [
          {
            op: 'date',
            patterns: [
              { regex: '^([0-9]{4})\\s*[.\\-/년]\\s*([0-9]{1,2})\\s*[.\\-/월]\\s*([0-9]{1,2})\\s*[.일]?$', groups: ['year', 'month', 'day'] },
              { remove: '[\\s.\\-/]', regex: '^([0-9]{4})([0-9]{2})([0-9]{2})$', groups: ['year', 'month', 'day'] },
              { remove: '[\\s.\\-/]', regex: '^([0-9]{2})([0-9]{2})([0-9]{2})$', groups: ['yy', 'month', 'day'] },
            ],
            two_digit_year: '1900s_if_greater_than_this_year',
          },
        ],
        unreadable_input: 'not_mismatch',
        unreadable_saved_steps: TEXT_STEPS,
      },
      {
        key: 'phone',
        format_code: 'phone',
        steps: [
          { op: 'remove', pattern: '[^0-9]' },
          { op: 'replace_prefix', from: '82', to: '0', min_length: 11 },
        ],
      },
      { key: 'address', format_code: 'address', steps: [...TEXT_STEPS, { op: 'remove', pattern: '[,()（）\\[\\]]' }] },
    ],
  }
}
