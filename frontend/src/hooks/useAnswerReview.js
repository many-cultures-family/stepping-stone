// 서술형 답변 검토 화면의 데이터와 상태 (F-06 + F-07).
// reviewStatus: 'idle' · 'checking'(개인정보 감지 중) · 'privacy'(사용자 결정 기다림) · 'loading'(L3 검토 중) · 'done' · 'error'
// R7: 감지된 개인정보를 사용자가 모두 정하기 전에는 requestReview(L3)를 부르지 않는다.
//     흐름: AI 검토 받기 → 브라우저 감지(서버 규칙) → (결정할 것이 있으면) 모달 → 결정 반영 → requestReview
// F-07 감지·결정은 브라우저에서만 한다. 서버에는 규칙만 받아 오고(GET /api/privacy-rules), 감지 결과·결정은 보내지 않는다
// (REVIEW-PRIVACY-API.md "F-07은 브라우저에서 한다").
// F-06 검토(api/review.js [제안]):
// - 답변은 검토를 요청할 때 본문으로 보낸다. '검토 제외'로 고른 부분은 같은 길이의 '*'로 가린다 (maskForReview)
// - 서버는 제안 위치(start·end)만 준다(R8). 고칠 원문(original)은 보낸 답변에서 잘라 붙인다
// - 작성 건마다 review_limit(5)번까지 받을 수 있다. 남은 횟수는 서버가 준 review_count 로 센다
// - 제안 반영 여부는 서버에 저장하지 않는다. 화면(AnswerReviewPage)이 들고 있다가 검토 마치기 때 미결정 수만 보낸다
import { useCallback, useEffect, useRef, useState } from 'react'
import { getPrivacyRules } from '../api/privacy.js'
import { finishReview, getReview, requestReview } from '../api/review.js'
import { applyDecisions, compileRules, detectInAnswers } from '../utils/privacyDetect.js'

const undecided = (detections) => detections.filter((d) => !d.decision)

/** '검토 제외'로 고른 부분을 같은 길이의 '*'로 가린 답변 [{ id, value }]. 길이가 같아야 서버가 준 위치가 그대로 맞는다 */
export function maskForReview(answers, detections) {
  return answers.map((answer) => {
    let value = answer.value ?? ''
    for (const d of detections) {
      if (d.field_answer_id !== answer.id || d.decision !== '검토 제외') continue
      value = value.slice(0, d.start) + '*'.repeat(d.end - d.start) + value.slice(d.end)
    }
    return { id: answer.id, value }
  })
}

/** 서버 제안(위치만 있음)에 화면에서 보여 줄 원문을 붙인다. 위치가 없으면(답변 전체 제안) original 은 null */
function withOriginal(suggestions, answers) {
  const byId = new Map(answers.map((a) => [a.id, a.value ?? '']))
  return suggestions.map((s) => ({
    ...s,
    original: s.start == null || s.end == null ? null : (byId.get(s.field_answer_id) ?? '').slice(s.start, s.end),
    decision: '미결정',
  }))
}

export function useAnswerReview(draftId) {
  const [answers, setAnswers] = useState([])
  const [suggestions, setSuggestions] = useState([])
  const [detections, setDetections] = useState([])
  const [reviewStatus, setReviewStatus] = useState('idle')
  const [errorCode, setErrorCode] = useState(null)
  const [privacyError, setPrivacyError] = useState(null)
  const [loaded, setLoaded] = useState(false)
  // 검토 횟수 (서버 draft.review_count). 다 쓰면 더 요청하지 않는다
  const [reviewCount, setReviewCount] = useState(0)
  const [reviewLimit, setReviewLimit] = useState(null)
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
        setReviewCount(data.review_count ?? 0)
        setReviewLimit(data.review_limit ?? null)
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
  // 상태 갱신 전에 불리므로 보낼 답변·감지를 인자로 받는다
  const runReview = useCallback(
    async (currentAnswers, currentDetections) => {
      setReviewStatus('loading')
      const sent = maskForReview(currentAnswers, currentDetections)
      try {
        const data = await requestReview(draftId, sent)
        // 원문은 가리기 전 답변에서 자른다. 가린 부분과 길이가 같아서 위치가 그대로 맞는다
        setSuggestions(withOriginal(data.suggestions, currentAnswers))
        if (data.review_count != null) setReviewCount(data.review_count)
        if (data.review_limit != null) setReviewLimit(data.review_limit)
        setReviewStatus('done')
      } catch (e) {
        if (e.code === 'REVIEW_LIMIT_EXCEEDED') setReviewCount((n) => Math.max(n, reviewLimit ?? n))
        setErrorCode(e.code ?? null)
        setReviewStatus('error')
      }
    },
    [draftId, reviewLimit],
  )

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
    await runReview(answers, found)
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
      await runReview(next.answers, next.detections)
    },
    [answers, detections, runReview],
  )

  const cancelPrivacy = useCallback(() => {
    setPrivacyError(null)
    setReviewStatus(statusBeforeRequest.current)
  }, [])

  // 검토 마치기 (검토완료 → 작성완료). 미결정 제안 수는 화면이 센 값을 받는다.
  // 필수 칸·불일치 수는 가상 작성 화면의 값이라 여기서는 알 수 없다. 가상 작성 입력값을 브라우저에서 읽게 되면 그 값으로 바꾼다
  const finish = useCallback(
    (undecidedSuggestions = 0) =>
      finishReview(draftId, {
        remaining_required: 0,
        unacknowledged_mismatches: 0,
        undecided_suggestions: undecidedSuggestions,
        undecided_privacy: undecided(detections).length,
      }),
    [draftId, detections],
  )

  return {
    loaded,
    answers,
    suggestions,
    detections,
    pendingDetections: undecided(detections),
    reviewStatus,
    reviewCount,
    reviewLimit,
    errorCode,
    privacyError,
    request,
    confirmPrivacy,
    cancelPrivacy,
    finish,
  }
}
