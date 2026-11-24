// 서술형 답변 검토 화면의 데이터와 상태 (F-06 + F-07).
// reviewStatus: 'idle' · 'checking'(개인정보 감지 중) · 'privacy'(사용자 결정 기다림) · 'loading'(L3 검토 중) · 'done' · 'error'
// R7: 감지된 개인정보를 사용자가 모두 정하기 전에는 requestReview(L3)를 부르지 않는다.
//     흐름: AI 검토 받기 → 브라우저 감지(서버 규칙) → (결정할 것이 있으면) 모달 → 결정 반영 → requestReview
// F-07 감지·결정은 브라우저에서만 한다. 서버에는 규칙만 받아 오고(GET /api/privacy-rules), 감지 결과·결정은 보내지 않는다
// (REVIEW-PRIVACY-API.md "F-07은 브라우저에서 한다").
import { useCallback, useEffect, useRef, useState } from 'react'
import { getPrivacyRules } from '../api/privacy.js'
import { decideSuggestion, getReview, requestReview } from '../api/review.js'
import { applyDecisions, compileRules, detectInAnswers } from '../utils/privacyDetect.js'

const undecided = (detections) => detections.filter((d) => !d.decision)

export function useAnswerReview(draftId) {
  const [answers, setAnswers] = useState([])
  const [suggestions, setSuggestions] = useState([])
  const [detections, setDetections] = useState([])
  const [reviewStatus, setReviewStatus] = useState('idle')
  const [errorCode, setErrorCode] = useState(null)
  const [privacyError, setPrivacyError] = useState(null)
  const [loaded, setLoaded] = useState(false)
  // 컴파일한 감지 규칙. 화면을 열 때 한 번 받는다 (REVIEW-PRIVACY-API.md 항목 4 '화면이 쓰는 곳')
  const rules = useRef(null)
  // 모달을 닫으면 검토 요청 전 상태(처음이면 idle, 이미 검토했으면 done)로 돌아간다
  const statusBeforeRequest = useRef('idle')

  useEffect(() => {
    let alive = true
    // 규칙을 못 받으면 개인정보를 찾을 수 없으므로 검토도 시작하지 않는다
    Promise.all([getReview(draftId), getPrivacyRules()])
      .then(([data, privacy]) => {
        if (!alive) return
        rules.current = compileRules(privacy.rules)
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

  // L3 검토. 이 함수는 결정 전 개인정보가 없을 때만 불린다 (아래 request·confirmPrivacy)
  const runReview = useCallback(async () => {
    setReviewStatus('loading')
    try {
      const data = await requestReview(draftId)
      setSuggestions(data.suggestions)
      setReviewStatus('done')
    } catch (e) {
      setErrorCode(e.code ?? null)
      setReviewStatus('error')
    }
  }, [draftId])

  const request = useCallback(async () => {
    setReviewStatus((prev) => {
      statusBeforeRequest.current = prev === 'done' ? 'done' : 'idle'
      return 'checking'
    })
    setErrorCode(null)
    setPrivacyError(null)
    // 지금 답변을 다시 훑는다. 답변이 안 바뀐 곳은 예전 결정을 이어 쓴다
    const found = detectInAnswers(answers, rules.current, detections)
    setDetections(found)
    if (undecided(found).length > 0) {
      setReviewStatus('privacy')
      return
    }
    await runReview()
  }, [answers, detections, runReview])

  // decisions: [{ id, decision }] — 모달에서 고른 결정 전부. '삭제'는 화면의 답변에서 지운다 (서버에는 보내지 않는다)
  const confirmPrivacy = useCallback(
    async (decisions) => {
      setPrivacyError(null)
      const next = applyDecisions(answers, detections, decisions)
      if (undecided(next.detections).length > 0) {
        // 아직 정하지 않은 것이 있으면 보내지 않는다 (R7)
        setPrivacyError('PRIVACY_UNDECIDED')
        return
      }
      setAnswers(next.answers)
      setDetections(next.detections)
      await runReview()
    },
    [answers, detections, runReview],
  )

  const cancelPrivacy = useCallback(() => {
    setPrivacyError(null)
    setReviewStatus(statusBeforeRequest.current)
  }, [])

  // 화면이 고른 결정은 화면이 들고 있고, 여기서는 서버 저장만 한다. 저장 실패 처리는 API 명세가 나온 뒤에 정한다.
  const decide = useCallback((suggestionId, decision) => decideSuggestion(draftId, suggestionId, decision).catch(() => {}), [draftId])

  return {
    loaded,
    answers,
    suggestions,
    detections,
    pendingDetections: undecided(detections),
    reviewStatus,
    errorCode,
    privacyError,
    request,
    confirmPrivacy,
    cancelPrivacy,
    decide,
  }
}
