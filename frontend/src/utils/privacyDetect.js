// 서술형 답변 개인정보 감지 (F-07 ①·②, R7). 브라우저에서만 한다 (REVIEW-PRIVACY-API.md "F-07은 브라우저에서 한다").
// - 규칙은 서버가 GET /api/privacy-rules 로 내려 준 것만 쓴다. 화면 코드에 규칙을 따로 적지 않는다
//   (서버 재검사 ⑤와 규칙이 어긋나면 422 PII_REMAINING 으로 이유 없이 거절된다, l3-masking.md 2절 '규칙 한 벌')
// - 찾는 방식은 서버 privacy._spans 의 값 모양 규칙 부분과 같다: 규칙 순서대로, 먼저 찾은 것과 겹치면 버리고,
//   공백만 사이에 둔 같은 종류는 하나로 합친다
// - 감지 결과·결정은 서버에 보내지 않고 화면 메모리에만 둔다 (no-server-storage-user-input.md)

/** 규칙 목록 [{ kind, pattern }] → [{ kind, re }]. 하나라도 컴파일되지 않으면 던진다 (덜 찾은 채 보내면 안 된다) */
export function compileRules(rules) {
  if (!Array.isArray(rules) || rules.length === 0) throw rulesError()
  return rules.map(({ kind, pattern }) => {
    try {
      return { kind, re: new RegExp(pattern, 'g') }
    } catch {
      throw rulesError()
    }
  })
}

function rulesError() {
  const e = new Error('PRIVACY_RULES_INVALID')
  e.code = 'PRIVACY_RULES_INVALID'
  return e
}

const overlaps = (a, b) => a.start < b.end && b.start < a.end

/** 글 하나에서 개인정보 위치를 찾는다 → [{ kind, start, end }] (start 순) */
export function findInText(text, compiled) {
  const value = text ?? ''
  const found = []
  for (const { kind, re } of compiled) {
    for (const m of value.matchAll(re)) {
      if (!m[0]) continue
      const f = { kind, start: m.index, end: m.index + m[0].length }
      if (!found.some((k) => overlaps(f, k))) found.push(f)
    }
  }
  const merged = []
  for (const f of found.sort((a, b) => a.start - b.start)) {
    const prev = merged[merged.length - 1]
    if (prev && prev.kind === f.kind && !value.slice(prev.end, f.start).trim()) prev.end = f.end
    else merged.push({ ...f })
  }
  return merged
}

const keyOf = (d) => `${d.field_answer_id}:${d.start}:${d.end}:${d.kind}`

/**
 * 답변 전체를 다시 훑는다. 위치·종류가 같은 감지는 예전 결정을 그대로 쓴다 (답변이 안 바뀌었으면 다시 묻지 않는다).
 * answers: [{ id, value }] · previous: 예전 감지 → [{ id, field_answer_id, start, end, kind, decision }]
 */
export function detectInAnswers(answers, compiled, previous = []) {
  const before = new Map(previous.map((d) => [keyOf(d), d]))
  return answers.flatMap((answer) =>
    findInText(answer.value, compiled).map((f) => {
      const d = { field_answer_id: answer.id, ...f }
      return before.get(keyOf(d)) ?? { id: keyOf(d), ...d, decision: null }
    }),
  )
}

/**
 * 결정을 반영한다. '삭제'는 답변에서 그 부분을 지우고, 뒤쪽 감지 위치를 그만큼 당긴다.
 * '유지'·'검토 제외'는 답변에 남긴다 (보낼 때 어떻게 가릴지는 검토 요청 쪽 몫).
 * decisions: [{ id, decision }] → { answers, detections }
 */
export function applyDecisions(answers, detections, decisions) {
  const byId = new Map(decisions.map((d) => [d.id, d.decision]))
  const decided = detections.map((d) => ({ ...d, decision: byId.get(d.id) ?? d.decision }))
  const kept = []
  const nextAnswers = answers.map((answer) => {
    const mine = decided.filter((d) => d.field_answer_id === answer.id).sort((a, b) => a.start - b.start)
    let value = answer.value ?? ''
    const removed = []
    // 뒤에서부터 지워야 앞쪽 위치가 그대로다
    for (const d of [...mine].reverse()) {
      if (d.decision !== '삭제') continue
      let { start } = d
      const { end } = d
      // 지운 자리에 공백이 두 칸 남지 않게 한 칸을 같이 지운다
      if (value[start - 1] === ' ' && (value[end] === ' ' || end === value.length)) start -= 1
      value = value.slice(0, start) + value.slice(end)
      removed.push({ start, length: end - start })
    }
    for (const d of mine) {
      if (d.decision === '삭제') continue
      const shift = removed.filter((r) => r.start < d.start).reduce((sum, r) => sum + r.length, 0)
      const moved = { ...d, start: d.start - shift, end: d.end - shift }
      // id 는 위치에서 만든다. 다음에 다시 훑을 때 같은 감지로 알아보고 결정을 이어 쓰게 한다
      kept.push({ ...moved, id: keyOf(moved) })
    }
    return value === answer.value ? answer : { ...answer, value }
  })
  return { answers: nextAnswers, detections: kept }
}
