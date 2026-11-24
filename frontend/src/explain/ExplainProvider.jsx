import { useCallback, useMemo, useState } from 'react'
import { lookupTerm, requestEasyExplanation } from '../api/explain.js'
import { useAuth } from '../auth/useAuth.js'
import ExplanationPopover from '../components/explain/ExplanationPopover.jsx'
import { matchRoute, usePath } from '../router.js'
import { ExplainContext } from './explain-context.js'

// 단어·문장 설명(F-05)을 화면 전체가 같이 쓰도록 묶는다.
// - 설명 창(ExplanationPopover)은 하나만 띄운다. 어느 화면에서 열든 같은 창이다.
// - 용어 사전은 단어마다 서버에 묻는다 (WORD-EXPLAIN-API.md 항목 1, 사전 전체 목록 API는 없다).
// - 사전 조회와 AI 쉬운 풀이는 (사용 언어, 글자)마다 한 번만 요청하고 결과를 기억한다 (R5 "같은 질문에 같은 설명", LLM 비용).
// - AI 풀이는 작성 건 아래 API라(항목 2) 지금 화면 주소의 작성 건 id 를 쓴다. 작성 건 화면이 아니면 사전 설명만 보여 준다.
export function ExplainProvider({ children }) {
  const { status, user } = useAuth()
  const language = user?.language ?? 'vi'
  const draftId = matchRoute(usePath()).params.draftId ?? null
  const [target, setTarget] = useState(null)
  // 화면을 다시 그릴 필요 없는 기억 장소라 상태로 바꾸지 않고 Map 을 계속 쓴다
  const [terms] = useState(() => new Map())
  const [easy] = useState(() => new Map())

  /**
   * 설명 창을 연다.
   * anchor: { el } (단어 버튼 등) 또는 { rect } (끌어서 고른 글자의 위치)
   */
  const openExplain = useCallback((text, anchor) => {
    const clean = (text ?? '').replace(/\s+/g, ' ').trim()
    if (!clean) return
    setTarget({ text: clean, anchor })
  }, [])

  const lookup = useCallback(
    (text) => {
      const key = `${language}|${text}`
      // 실패한 요청은 기억하지 않는다 (다시 열면 다시 묻는다)
      if (!terms.has(key)) terms.set(key, lookupTerm(text).catch((e) => { terms.delete(key); throw e }))
      return terms.get(key)
    },
    [terms, language],
  )

  const requestEasy = useCallback(
    async (text) => {
      const key = `${draftId}|${language}|${text}`
      if (easy.has(key)) return easy.get(key)
      const data = await requestEasyExplanation(draftId, text)
      easy.set(key, data)
      return data
    },
    [easy, draftId, language],
  )

  const value = useMemo(
    () => (status === 'authenticated' ? { language, openExplain } : null),
    [status, language, openExplain],
  )

  return (
    <ExplainContext.Provider value={value}>
      {children}
      {target && value && (
        <ExplanationPopover
          // 다른 말을 열면 창 안의 상태(사전 조회·AI 풀이 요청)를 새로 시작한다
          key={`${target.text}|${language}`}
          target={target}
          language={language}
          lookup={lookup}
          requestEasy={draftId ? requestEasy : null}
          onClose={() => setTarget(null)}
        />
      )}
    </ExplainContext.Provider>
  )
}
