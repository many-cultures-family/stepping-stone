// 가상 작성(F-04) 불일치 판정: 사전 정보 값(prior) vs 지금 쓴 값. 서버는 판정하지 않는다
// (VIRTUAL-FORM-API.md 공통 규칙, no-server-storage-user-input.md: 입력값·사전 정보는 브라우저에만 있다).
// 짝은 form 응답 칸의 prior_info_key 로 짓는다 (prior_info.info_key: name · birth_date · phone · address).
//
// 같은 값을 다르게 적은 것까지 '다르다'고 하면 경고가 너무 잦다. 그래서 비교 전에 표기를 맞춘다.
// 맞추는 규칙은 L3 개인정보 가림 매칭 규칙(docs/privacy/l3-masking.md [제안])과 같은 기준을 쓴다:
//   - 공통: 앞뒤·사이 공백, 하이픈 무시, 영문 대소문자 무시
//   - 전화번호: 숫자만 (+82 10… 은 010… 으로)
//   - 날짜: 1990.01.01 · 1990-1-1 · 19900101 · 900101 · 1990년 1월 1일 을 모두 같은 날로
//   - 주소: 쉼표·괄호 무시

/** 칸이 어떤 종류 값인지. 사전 정보 키가 먼저, 없으면 형식 코드 */
function kindOf(field) {
  const key = field?.prior_info_key
  if (key === 'phone' || key === 'name' || key === 'address') return key
  if (key === 'birth_date') return 'date'
  return field?.format_code ?? 'text'
}

const basic = (v) =>
  String(v ?? '')
    .normalize('NFC')
    .replace(/[\s\-‐-―]/g, '')
    .toLowerCase()

function normalizePhone(v) {
  let d = String(v ?? '').replace(/\D/g, '')
  if (d.startsWith('82') && d.length >= 11) d = `0${d.slice(2)}`
  return d
}

/** 날짜를 YYYYMMDD 로. 읽지 못하면 null */
export function normalizeDate(v) {
  const s = String(v ?? '').trim()
  if (!s) return null
  const pad = (n) => String(Number(n)).padStart(2, '0')
  const valid = (y, m, d) => Number(m) >= 1 && Number(m) <= 12 && Number(d) >= 1 && Number(d) <= 31
  // 1990.01.01 · 1990-1-1 · 1990/1/1 · 1990년 1월 1일 · 1990. 1. 1.
  let m = s.match(/^(\d{4})\s*[.\-/년]\s*(\d{1,2})\s*[.\-/월]\s*(\d{1,2})\s*[.일]?$/)
  if (m && valid(m[1], m[2], m[3])) return `${m[1]}${pad(m[2])}${pad(m[3])}`
  const digits = s.replace(/\D/g, '')
  if (/^\d+$/.test(s.replace(/[\s.\-/]/g, ''))) {
    // 19900101
    if (digits.length === 8 && valid(0, digits.slice(4, 6), digits.slice(6))) return digits
    // 900101 → 1990, 250101 → 2025 (올해 두 자리 연도보다 크면 1900년대)
    if (digits.length === 6 && valid(0, digits.slice(2, 4), digits.slice(4))) {
      const yy = Number(digits.slice(0, 2))
      const century = yy > new Date().getFullYear() % 100 ? '19' : '20'
      return `${century}${digits}`
    }
  }
  return null
}

/** 비교용으로 표기를 맞춘 값 */
export function normalizeFor(field, value) {
  switch (kindOf(field)) {
    case 'phone':
      return normalizePhone(value)
    case 'date':
      return normalizeDate(value) ?? basic(value)
    case 'address':
      return basic(value).replace(/[,()（）[\]]/g, '')
    default:
      return basic(value)
  }
}

/** 이 칸이 사전 정보와 짝지어져 있고, 저장된 사전 정보 값이 있는지 */
export function priorValueFor(field, prior) {
  const key = field?.prior_info_key
  if (!key) return ''
  const v = prior?.[key]
  return typeof v === 'string' ? v.trim() : ''
}

/**
 * 불일치인지. 사전 정보 값과 지금 쓴 값이 둘 다 있고, 표기를 맞춰도 다를 때만 true.
 * 비어 있는 칸은 불일치가 아니다(빈칸은 '필수 빈칸'으로 따로 센다).
 */
export function isMismatch(field, value, prior) {
  const saved = priorValueFor(field, prior)
  const current = String(value ?? '').trim()
  if (!saved || !current) return false
  // 날짜를 아직 다 쓰지 않았거나(년·월·일 칸을 옮겨 가며 쓰는 중) 날짜로 읽히지 않으면 불일치가 아니라 형식 문제다.
  // 형식 검사(writingLayout formatError)가 따로 알려 주므로 여기서는 비교하지 않는다
  if (kindOf(field) === 'date' && normalizeDate(current) === null) return false
  return normalizeFor(field, saved) !== normalizeFor(field, current)
}
