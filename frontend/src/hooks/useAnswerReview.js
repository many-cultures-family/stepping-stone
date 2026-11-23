// 서술형 답변 검토 화면의 데이터와 상태 (F-06 + F-07).
// reviewStatus: 'idle' · 'checking'(개인정보 감지 중) · 'privacy'(사용자 결정 기다림) · 'loading'(L3 검토 중) · 'done' · 'error'
// R7: 감지된 개인정보를 사용자가 모두 정하기 전에는 requestReview(L3)를 부르지 않는다.
//     흐름: AI 검토 받기 → detectPrivacy → (결정할 것이 있으면) 모달 → decidePrivacy → requestReview
import { useCallback, useEffect, useRef, useState } from 'react'
import { decidePrivacy, detectPrivacy } from '../api/privacy.js'
import { decideSuggestion, getReview, requestReview } from '../api/review.js'

const undecided = (detections) => detections.filter((d) => !d.decision)

export function useAnswerReview(draftId) {
  const [answers, setAnswers] = useState([])
  const [suggestions, setSuggestions] = useState([])
  const [detections, setDetections] = useState([])
  const [reviewStatus, setReviewStatus] = useState('idle')
  const [errorCode, setErrorCode] = useState(null)
  const [privacyError, setPrivacyError] = useState(null)
  const [privacySaving, setPrivacySaving] = useState(false)
  const [loaded, setLoaded] = useState(false)
  // 모달을 닫으면 검토 요청 전 상태(처음이면 idle, 이미 검토했으면 done)로 돌아간다
  const statusBeforeRequest = useRef('idle')

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
    let found
    try {
      found = (await detectPrivacy(draftId)).detections
    } catch (e) {
      setErrorCode(e.code ?? null)
      setReviewStatus('error')
      return
    }
    setDetections(found)
    if (undecided(found).length > 0) {
      setReviewStatus('privacy')
      return
    }
    await runReview()
  }, [draftId, runReview])

  // decisions: [{ id, decision }] — 모달에서 고른 결정 전부
  const confirmPrivacy = useCallback(
    async (decisions) => {
      setPrivacySaving(true)
      setPrivacyError(null)
      let data
      try {
        data = await decidePrivacy(draftId, decisions)
      } catch (e) {
        // 모달을 연 채로 오류를 보여 주고 다시 시도하게 한다
        setPrivacyError(e.code ?? 'UNKNOWN')
        setPrivacySaving(false)
        return
      }
      setAnswers(data.answers)
      setDetections(data.detections)
      setPrivacySaving(false)
      if (undecided(data.detections).length > 0) {
        // 서버가 아직 결정 전이라고 하면 보내지 않는다 (R7)
        setPrivacyError('PRIVACY_UNDECIDED')
        return
      }
      await runReview()
    },
    [draftId, runReview],
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
    privacySaving,
    request,
    confirmPrivacy,
    cancelPrivacy,
    decide,
  }
}
