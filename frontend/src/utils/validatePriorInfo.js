// 사전 정보 형식 검사 (US-04, R3)
// 오류 판정은 서버 규칙 엔진이 한다. 아래는 저장 버튼을 누르기 전에 미리 보여 주는 보조용이며,
// 서버가 errors [{ info_key, code }] 를 주면 화면은 그것을 먼저 그린다.

// 서버 규칙(DATA-MODEL.md input_format.pattern)과 같은 형식만 검사한다.
//   phone: ^010-\d{4}-\d{4}$   date: ^\d{4}\.\d{2}\.\d{2}$ (형식만 본다)
// "실제 있는 날짜인가"·"미래가 아닌가" 같은 달력 검사는 서버 규칙에 없어서 화면에서 하지 않는다.
// 달력 유효성을 서버 규칙(DATA-MODEL.md)에 넣을지는 팀이 정한다. 정해지면 서버·문서와 함께 여기에 같은 규칙을 더한다.
const PHONE = /^010-\d{4}-\d{4}$/
const DATE = /^\d{4}\.\d{2}\.\d{2}$/

/** [미리보기 보조] 값 하나의 오류 코드 (없으면 null) */
export function validatePriorInfo(infoKey, rawValue) {
  const value = (rawValue ?? '').trim()
  if (!value) return 'REQUIRED_MISSING'
  if (infoKey === 'phone' && !PHONE.test(value)) return 'FORMAT_INVALID'
  if (infoKey === 'birth_date' && !DATE.test(value)) return 'FORMAT_INVALID'
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
