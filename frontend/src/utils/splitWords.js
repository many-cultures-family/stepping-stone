// 문서 속 글자를 낱말로 나눈다 (F-05). 낱말을 누르면 그 낱말을 용어 사전에 묻는다 (WORD-EXPLAIN-API.md 항목 1).
// 사전은 정확히 일치로만 찾으므로, 낱말 앞뒤의 문장부호(: , . 따옴표 등)는 떼고 묻는다. 괄호는 '(인)'처럼 말의 일부라 둔다.
// 예: '성명: [이름]' → [성명:](word '성명') [ ](space) [[이름]](masked)

const EDGE_PUNCT = /^["'“”‘’.,:;!?·…]+|["'“”‘’.,:;!?·…]+$/g
// 가린 개인정보 토큰 (pii-items.md 2절, OCR-API.md "masked_text 모양")
const MASKED = /^\[[^\]]+\]$/

/**
 * text 를 [{ kind: 'word' | 'masked' | 'space', text, word? }] 조각으로 나눈다.
 * word 는 사전에 물을 글자(앞뒤 문장부호를 뗀 것). 문장부호만 있는 조각은 space 로 둔다.
 */
export function splitWords(text) {
  if (!text) return []
  return text
    .split(/(\s+)/)
    .filter(Boolean)
    .map((part) => {
      if (/^\s+$/.test(part)) return { kind: 'space', text: part }
      if (MASKED.test(part)) return { kind: 'masked', text: part }
      const word = part.replace(EDGE_PUNCT, '')
      return word ? { kind: 'word', text: part, word } : { kind: 'space', text: part }
    })
}

/** 고를 수 있는 낱말만 (중복 없이, 나온 순서대로) */
export function uniqueWords(text) {
  const seen = new Set()
  return splitWords(text)
    .filter((p) => p.kind === 'word' && !seen.has(p.word) && seen.add(p.word))
    .map((p) => p.word)
}
