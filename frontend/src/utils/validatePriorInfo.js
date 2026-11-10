// 사전 정보 형식 검사 (US-04, R3)
// 오류 판정은 서버 규칙 엔진이 한다. 아래는 저장 버튼을 누르기 전에 미리 보여 주는 보조용이며,
// 서버가 errors [{ info_key, code }] 를 주면 화면은 그것을 먼저 그린다.

const PHONE = /^010-\d{4}-\d{4}$/
const DATE = /^(\d{4})\.(\d{2})\.(\d{2})$/

function isRealDate(value) {
  const m = value.match(DATE)
  if (!m) return false
  const [y, mo, d] = [Number(m[1]), Number(m[2]), Number(m[3])]
  const date = new Date(y, mo - 1, d)
  const valid = date.getFullYear() === y && date.getMonth() === mo - 1 && date.getDate() === d
  return valid && date <= new Date() && y >= 1900
}

/** [미리보기 보조] 값 하나의 오류 코드 (없으면 null) */
export function validatePriorInfo(infoKey, rawValue) {
  const value = (rawValue ?? '').trim()
  if (!value) return 'REQUIRED_MISSING'
  if (infoKey === 'phone' && !PHONE.test(value)) return 'FORMAT_INVALID'
  if (infoKey === 'birth_date' && !isRealDate(value)) return 'FORMAT_INVALID'
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
