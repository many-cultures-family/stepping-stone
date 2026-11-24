// 가상 작성(F-04) 불일치 판정: 사전 정보 값(prior) vs 지금 쓴 값. 서버는 판정하지 않는다
// (VIRTUAL-FORM-API.md 공통 규칙, no-server-storage-user-input.md: 입력값·사전 정보는 브라우저에만 있다).
// 짝은 form 응답 칸의 prior_info_key 로 짓는다 (name · birth_date · phone · address).
//
// 같은 값을 다르게 적은 것(010-0000-1234 / 01000001234, 1990.01.01 / 19900101)까지 '다르다'고 하지 않도록
// 비교 전에 표기를 맞춘다. 맞추는 규칙은 화면에 적지 않고 서버가 내려 주는 규칙 한 벌을 그대로 따른다
// (GET /api/prior-info-rules, backend/app/prior_info_rules.py). 이 파일은 그 규칙 데이터를 해석만 한다.
//
// 규칙 모양: { empty: 'not_mismatch', keys: [{ key, format_code, steps, unreadable_input?, unreadable_saved_steps? }] }
// steps 의 op: nfc · remove(pattern) · lowercase · replace_prefix(from, to, min_length) · date(patterns, two_digit_year)

/** 규칙의 정규식 문자열 → RegExp. 서버가 JavaScript(u 플래그)에서도 그대로 만들어지게 적어 준다 */
const regexCache = new Map()
function re(pattern, flags) {
  const k = `${flags}/${pattern}`
  if (!regexCache.has(k)) regexCache.set(k, new RegExp(pattern, flags))
  return regexCache.get(k)
}

/** 날짜 step: 패턴을 차례로 맞춰 YYYYMMDD 로. 읽지 못하면 null */
function parseDate(step, value) {
  for (const p of step.patterns ?? []) {
    const text = p.remove ? value.replace(re(p.remove, 'gu'), '') : value
    const m = text.match(re(p.regex, 'u'))
    if (!m) continue
    const parts = Object.fromEntries((p.groups ?? []).map((g, i) => [g, m[i + 1]]))
    const month = Number(parts.month)
    const day = Number(parts.day)
    if (!(month >= 1 && month <= 12 && day >= 1 && day <= 31)) continue
    let year = parts.year
    if (parts.yy != null) {
      // two_digit_year '1900s_if_greater_than_this_year': 올해 두 자리보다 크면 1900년대 (900101 → 1990)
      const century = Number(parts.yy) > new Date().getFullYear() % 100 ? '19' : '20'
      year = `${century}${parts.yy}`
    }
    return `${year}${String(month).padStart(2, '0')}${String(day).padStart(2, '0')}`
  }
  return null
}

/** steps 를 순서대로 적용. date 가 읽히지 않으면 null */
function apply(steps, value) {
  let text = value
  for (const step of steps ?? []) {
    switch (step.op) {
      case 'nfc':
        text = text.normalize('NFC')
        break
      case 'remove':
        text = text.replace(re(step.pattern, 'gu'), '')
        break
      case 'lowercase':
        text = text.toLowerCase()
        break
      case 'replace_prefix':
        if (text.startsWith(step.from) && text.length >= step.min_length) text = step.to + text.slice(step.from.length)
        break
      case 'date':
        text = parseDate(step, text.trim())
        if (text === null) return null
        break
      default:
        // 모르는 규칙이 오면 비교를 믿을 수 없다 → 이 칸은 판정하지 않는다
        throw new Error(`모르는 규칙: ${step.op}`)
    }
  }
  return text
}

/** 이 칸에 해당하는 규칙 (없으면 null) */
function ruleFor(field, rules) {
  const key = field?.prior_info_key
  if (!key || !rules?.keys) return null
  return rules.keys.find((r) => r.key === key) ?? null
}

/** 이 칸이 사전 정보와 짝지어져 있고, 저장된 사전 정보 값이 있는지 */
export function priorValueFor(field, prior) {
  const key = field?.prior_info_key
  if (!key) return ''
  const v = prior?.[key]
  return typeof v === 'string' ? v.trim() : ''
}

/**
 * 불일치인지. 사전 정보 값과 지금 쓴 값이 둘 다 있고, 서버 규칙으로 표기를 맞춰도 다를 때만 true.
 * - 비어 있는 칸은 불일치가 아니다(빈칸은 '필수 빈칸'으로 따로 센다, rules.empty = 'not_mismatch')
 * - 규칙을 못 받았거나 이 칸의 규칙이 없으면 false: 잘못된 '다름' 경고보다 경고 없음이 낫다
 */
export function isMismatch(field, value, prior, rules) {
  const rule = ruleFor(field, rules)
  if (!rule) return false
  const saved = priorValueFor(field, prior)
  const current = String(value ?? '').trim()
  if (!saved || !current) return false
  try {
    const currentNorm = apply(rule.steps, current)
    // 지금 쓴 날짜가 날짜로 읽히지 않으면(쓰는 중이거나 형식 오류) 형식 검사가 먼저 알리므로 비교하지 않는다
    if (currentNorm === null) return false
    let savedNorm = apply(rule.steps, saved)
    if (savedNorm === null) savedNorm = apply(rule.unreadable_saved_steps ?? [], saved)
    return savedNorm !== currentNorm
  } catch {
    return false
  }
}
