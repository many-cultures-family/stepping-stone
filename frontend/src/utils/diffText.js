// 글자 단위 차이 (LCS). 저장된 정보(prior)와 지금 쓴 값(current)을 비교해
// [{ type: 'same' | 'del' | 'add', text }] 로 돌려준다. 서버는 글자 단위 차이를 주지 않아 프론트가 만든다 (VIRTUAL-FORM-API 공통 규칙).
// 'del' = 저장된 정보에만 있는 글자, 'add' = 지금 쓴 값에만 있는 글자. 짧은 문자열이라 O(n·m)이면 충분하다.
export function diffChars(prior = '', current = '') {
  const a = Array.from(prior ?? '')
  const b = Array.from(current ?? '')
  const n = a.length
  const m = b.length
  const dp = Array.from({ length: n + 1 }, () => new Array(m + 1).fill(0))
  for (let i = n - 1; i >= 0; i--) {
    for (let j = m - 1; j >= 0; j--) {
      dp[i][j] = a[i] === b[j] ? dp[i + 1][j + 1] + 1 : Math.max(dp[i + 1][j], dp[i][j + 1])
    }
  }
  const out = []
  const push = (type, ch) => {
    const last = out[out.length - 1]
    if (last && last.type === type) last.text += ch
    else out.push({ type, text: ch })
  }
  let i = 0
  let j = 0
  while (i < n && j < m) {
    if (a[i] === b[j]) {
      push('same', a[i])
      i++
      j++
    } else if (dp[i + 1][j] >= dp[i][j + 1]) {
      push('del', a[i++])
    } else {
      push('add', b[j++])
    }
  }
  while (i < n) push('del', a[i++])
  while (j < m) push('add', b[j++])
  return out
}
