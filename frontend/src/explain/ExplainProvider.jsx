import { useCallback, useEffect, useMemo, useState } from 'react'
import { getGlossary, requestEasyExplanation } from '../api/explain.js'
import { useAuth } from '../auth/useAuth.js'
import ExplanationPopover from '../components/explain/ExplanationPopover.jsx'
import { ExplainContext } from './explain-context.js'

// 단어·문장 설명(F-05)을 화면 전체가 같이 쓰도록 묶는다.
// - 로그인하면 사용 언어의 용어 사전을 한 번 불러온다. 언어를 바꾸면 다시 불러온다.
// - 설명 창(ExplanationPopover)은 하나만 띄운다. 어느 화면에서 열든 같은 창이다.
// - AI 쉬운 풀이는 (사용 언어, 글자)마다 한 번만 요청하고 결과를 기억한다 (R5 "같은 질문에 같은 설명", LLM 비용).
export function ExplainProvider({ children }) {
  const { status, user } = useAuth()
  const language = user?.language ?? 'ko'
  const [glossary, setGlossary] = useState({ language: null, terms: [] })
  const [target, setTarget] = useState(null)
  // 화면을 다시 그릴 필요 없는 기억 장소라 상태로 바꾸지 않고 Map 하나를 계속 쓴다
  const [cache] = useState(() => new Map())

  useEffect(() => {
    if (status !== 'authenticated') return undefined
    let ignore = false
    getGlossary(language).then(
      (data) => {
        if (!ignore) setGlossary({ language: data.language, terms: data.terms ?? [] })
      },
      // 사전을 못 불러와도 글자를 골라 AI 풀이를 받는 기능은 그대로 쓴다
      () => {
        if (!ignore) setGlossary({ language, terms: [] })
      },
    )
    return () => {
      ignore = true
    }
  }, [status, language])

  const terms = useMemo(
    () => (status === 'authenticated' && glossary.language === language ? glossary.terms : []),
    [status, glossary, language],
  )

  /**
   * 설명 창을 연다.
   * anchor: { el } (단어 버튼 등) 또는 { rect } (끌어서 고른 글자의 위치)
   * term: 사전 항목을 이미 알면 넘긴다. 없으면 고른 글자와 똑같은 사전 항목을 찾는다.
   */
  const openExplain = useCallback(
    (text, anchor, term = null) => {
      const clean = (text ?? '').replace(/\s+/g, ' ').trim()
      if (!clean) return
      setTarget({ text: clean, anchor, term: term ?? terms.find((t) => t.term === clean) ?? null })
    },
    [terms],
  )

  const requestEasy = useCallback(
    async (text, termId) => {
      const key = `${language}|${text}`
      if (cache.has(key)) return cache.get(key)
      const data = await requestEasyExplanation(text, termId, language)
      cache.set(key, data)
      return data
    },
    [cache, language],
  )

  const value = useMemo(
    () => (status === 'authenticated' ? { terms, language, openExplain, requestEasy } : null),
    [status, terms, language, openExplain, requestEasy],
  )

  return (
    <ExplainContext.Provider value={value}>
      {children}
      {target && value && (
        <ExplanationPopover
          // 다른 말을 열면 창 안의 상태(AI 풀이 요청 등)를 새로 시작한다
          key={`${target.text}|${language}`}
          target={target}
          language={language}
          requestEasy={requestEasy}
          onClose={() => setTarget(null)}
        />
      )}
    </ExplainContext.Provider>
  )
}
