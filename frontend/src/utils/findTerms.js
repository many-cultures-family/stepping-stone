// 글 안에서 용어 사전의 말을 찾는다 (F-05). 긴 말부터 찾고, 이미 찾은 자리와 겹치는 짧은 말은 건너뛴다.
// 예: '방과후학교 신청' → [방과후학교][ ][신청]

/**
 * text 를 [{ text, term }] 조각으로 나눈다. term 은 사전 항목({ id, term, explanation }) 또는 null.
 */
export function splitByTerms(text, terms) {
  if (!text) return []
  if (!terms?.length) return [{ text, term: null }]

  const sorted = [...terms].filter((t) => t.term).sort((a, b) => b.term.length - a.term.length)
  const hits = []
  for (const t of sorted) {
    let from = 0
    for (;;) {
      const at = text.indexOf(t.term, from)
      if (at < 0) break
      const end = at + t.term.length
      if (!hits.some((h) => at < h.end && h.start < end)) hits.push({ start: at, end, term: t })
      from = at + 1
    }
  }
  hits.sort((a, b) => a.start - b.start)

  const parts = []
  let at = 0
  for (const h of hits) {
    if (h.start > at) parts.push({ text: text.slice(at, h.start), term: null })
    parts.push({ text: text.slice(h.start, h.end), term: h.term })
    at = h.end
  }
  if (at < text.length) parts.push({ text: text.slice(at), term: null })
  return parts
}

/** text 에 나오는 사전 항목 (중복 없이, 나온 순서대로) */
export function findTerms(text, terms) {
  const seen = new Set()
  return splitByTerms(text, terms)
    .map((p) => p.term)
    .filter((t) => t && !seen.has(t.id) && seen.add(t.id))
}
