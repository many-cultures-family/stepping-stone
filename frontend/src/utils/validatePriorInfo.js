// 사전 정보 형식 검사 (US-04, R3)
// 오류 판정은 서버 규칙 엔진이 한다. 아래는 저장 버튼을 누르기 전에 미리 보여 주는 보조용이며,
// 서버가 errors [{ info_key, code }] 를 주면 화면은 그것을 먼저 그린다.

// 형식 규칙은 서버 input_format 한 벌을 쓴다 (GET /api/input-formats, api/fields.js getInputFormats).
// 사전 정보 종류 → 칸 형식 코드는 백엔드 llm.PRIOR_INFO_FORMATS(#50)와 같다.
// 목록을 못 받았을 때(목 모드·네트워크 오류)만 아래 기본 규칙으로 대신 검사한다 (서버 시드와 같은 값).
// "실제 있는 날짜인가"·"미래가 아닌가" 같은 달력 검사는 서버 규칙에 없어서 화면에서 하지 않는다.
export const PRIOR_INFO_FORMATS = { name: 'name', birth_date: 'date', phone: 'phone', address: 'address' }

const FALLBACK_PATTERNS = {
  phone: '^010-\\d{4}-\\d{4}$',
  date: '^\\d{4}\\.\\d{2}\\.\\d{2}$',
}

// 브라우저가 못 만드는 정규식이면 null: 화면 검사는 건너뛰고 서버가 최종 판정한다
function toRegExp(pattern) {
  if (!pattern) return null
  try {
    return new RegExp(pattern)
  } catch {
    return null
  }
}

/** 서버 형식 목록 → { [code]: { pattern: RegExp | null, example } }. 목록이 없으면 null */
export function indexFormats(formats) {
  if (!Array.isArray(formats)) return null
  const result = {}
  for (const f of formats) {
    result[f.code] = { pattern: toRegExp(f.pattern), example: f.example ?? '' }
  }
  return result
}

function patternFor(infoKey, formatIndex) {
  const code = PRIOR_INFO_FORMATS[infoKey]
  if (!code) return null
  if (formatIndex) return formatIndex[code]?.pattern ?? null
  return FALLBACK_PATTERNS[code] ? new RegExp(FALLBACK_PATTERNS[code]) : null
}

/** [미리보기 보조] 값 하나의 오류 코드 (없으면 null). formatIndex 는 indexFormats 결과 */
export function validatePriorInfo(infoKey, rawValue, formatIndex = null) {
  const value = (rawValue ?? '').trim()
  if (!value) return 'REQUIRED_MISSING'
  const pattern = patternFor(infoKey, formatIndex)
  if (pattern && !pattern.test(value)) return 'FORMAT_INVALID'
  return null
}

/** 서버 errors 배열 → { [info_key]: code } */
export function groupPriorInfoErrors(errors = []) {
  const result = {}
  for (const { info_key, code } of errors) result[info_key] ??= code
  return result
}

// 입력을 돕는 자동 하이픈·점 (숫자만 쳐도 형식에 맞게). 판정과는 무관하다.
export function formatAsTyped(infoKey, value) {
  if (infoKey === 'phone') {
    const d = value.replace(/\D/g, '').slice(0, 11)
    if (d.length <= 3) return d
    if (d.length <= 7) return `${d.slice(0, 3)}-${d.slice(3)}`
    return `${d.slice(0, 3)}-${d.slice(3, 7)}-${d.slice(7)}`
  }
  if (infoKey === 'birth_date') {
    const d = value.replace(/\D/g, '').slice(0, 8)
    if (d.length <= 4) return d
    if (d.length <= 6) return `${d.slice(0, 4)}.${d.slice(4)}`
    return `${d.slice(0, 4)}.${d.slice(4, 6)}.${d.slice(6)}`
  }
  return value
}
