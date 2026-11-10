// 서술형 답변 검토 화면의 데이터와 상태 (F-06). reviewStatus: 'idle' · 'loading' · 'done' · 'error'
import { useCallback, useEffect, useState } from 'react'
import { decideSuggestion, getReview, requestReview } from '../api/review.js'

export function useAnswerReview(draftId) {
  const [answers, setAnswers] = useState([])
  const [suggestions, setSuggestions] = useState([])
  const [reviewStatus, setReviewStatus] = useState('idle')
  const [errorCode, setErrorCode] = useState(null)
  const [loaded, setLoaded] = useState(false)

  useEffect(() => {
    let alive = true
    getReview(draftId)
      .then((data) => {
        if (!alive) return
        setAnswers(data.answers)
        setLoaded(true)
      })
      .catch((e) => {
        if (!alive) return
        setErrorCode(e.code ?? null)
        setReviewStatus('error')
        setLoaded(true)
      })
    return () => {
      alive = false
    }
  }, [draftId])

  const request = useCallback(async () => {
    setReviewStatus('loading')
    setErrorCode(null)
    try {
      const data = await requestReview(draftId)
      setSuggestions(data.suggestions)
      setReviewStatus('done')
    } catch (e) {
      setErrorCode(e.code ?? null)
      setReviewStatus('error')
    }
  }, [draftId])

  // 화면이 고른 결정은 화면이 들고 있고, 여기서는 서버 저장만 한다. 저장 실패 처리는 API 명세가 나온 뒤에 정한다.
  const decide = useCallback((suggestionId, decision) => decideSuggestion(draftId, suggestionId, decision).catch(() => {}), [draftId])

  return { loaded, answers, suggestions, reviewStatus, errorCode, request, decide }
}
