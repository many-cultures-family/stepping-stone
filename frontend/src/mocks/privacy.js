// 서술형 답변 개인정보 감지(F-07) 목데이터. VITE_USE_MOCK=true 일 때 src/api/privacy.js 가 대신 호출한다.
// F-07 API 명세가 아직 없어서 응답 모양은 DATA-MODEL.md privacy_detection(field_answer_id·start·end·kind·decision)을 옮긴 [제안]이다.
// - 감지는 서버 규칙(정규식)으로 한다. 결정 전에는 답변을 LLM에 보낼 수 없으므로 감지에 LLM을 쓰지 않는다 (R7, DATA-MODEL.md).
// - 감지된 원문은 저장·응답하지 않는다. 위치(start·end)만 준다 (R8). 화면은 답변 값에서 그 위치를 잘라 보여 준다.
// - 아래 정규식은 서버 구현의 참고용 [제안]이다. 서버에 같은 규칙을 둘 때 이 목을 기준으로 맞춘다.
import { ApiError } from '../api/client.js'
import { getMockAnswers, setMockAnswerValue } from './answers.js'

const delay = (ms) => new Promise((resolve) => setTimeout(resolve, ms))

const PRIVACY_DECISIONS = ['유지', '삭제', '검토 제외']

// 앞에 있을수록 먼저 잡는다. 같은 자리를 두 규칙이 잡으면 앞 규칙이 이긴다.
const PATTERNS = [
  // 주민등록번호: 뒷자리 첫 숫자 1~4 / 외국인등록번호: 5~8
  { kind: 'resident_no', re: /(?<!\d)\d{6}-?[1-4]\d{6}(?!\d)/g },
  { kind: 'alien_no', re: /(?<!\d)\d{6}-?[5-8]\d{6}(?!\d)/g },
  { kind: 'phone', re: /(?<!\d)01[016789]-?\d{3,4}-?\d{4}(?!\d)/g },
  { kind: 'email', re: /[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}/g },
  // 도로명 주소: ○○시(도) ○○구(시·군) ○○로(길) 번호
  { kind: 'address', re: /[가-힣]+(?:특별시|광역시|특별자치시|시|도)\s?[가-힣]+(?:시|군|구)\s?[가-힣0-9]+(?:로|길)\s?\d+(?:-\d+)?/g },
]

// 작성 건 → [{ id, field_answer_id, start, end, kind, decision }]
const store = new Map()
let nextId = 1

function scan(answers) {
  const found = []
  for (const answer of answers) {
    const taken = []
    for (const { kind, re } of PATTERNS) {
      for (const m of (answer.value ?? '').matchAll(re)) {
        const start = m.index
        const end = start + m[0].length
        if (taken.some(([s, e]) => start < e && s < end)) continue
        taken.push([start, end])
        found.push({ field_answer_id: answer.id, start, end, kind })
      }
    }
  }
  return found.sort((a, b) => a.field_answer_id - b.field_answer_id || a.start - b.start)
}

// 지금 답변을 다시 훑는다. 위치가 같은 감지는 예전 결정을 그대로 쓴다 (답변이 안 바뀌었으면 다시 묻지 않는다)
function detect(draftId) {
  const id = Number(draftId)
  const before = store.get(id) ?? []
  const next = scan(getMockAnswers(id)).map((d) => {
    const same = before.find(
      (b) => b.field_answer_id === d.field_answer_id && b.start === d.start && b.end === d.end && b.kind === d.kind,
    )
    return same ?? { id: nextId++, ...d, decision: null }
  })
  store.set(id, next)
  return next
}

/** 결정 전(decision 이 null)인 감지 수. mocks/review.js 가 검토 요청을 막을 때 쓴다 (R7) */
export function undecidedCount(draftId) {
  return detect(draftId).filter((d) => !d.decision).length
}

export async function detectPrivacy(draftId) {
  await delay(500)
  const id = Number(draftId)
  if (id === 6) throw new ApiError('서버 연결 실패', { code: 'NETWORK_ERROR' })
  return { detections: detect(id).map((d) => ({ ...d })) }
}

/**
 * decisions: [{ id, decision }]. '삭제'는 답변에서 그 부분을 지운다. '검토 제외'는 답변에 남기되 L3에 보낼 때 가린다.
 * 한 번에 받아서 한 번에 반영한다 (지우면 뒤쪽 위치가 바뀌므로 하나씩 보내면 위치가 어긋난다).
 */
export async function decidePrivacy(draftId, decisions) {
  await delay(400)
  const id = Number(draftId)
  const current = detect(id)
  const byId = new Map(decisions.map((d) => [d.id, d.decision]))
  for (const [detectionId, decision] of byId) {
    if (!current.some((d) => d.id === detectionId)) {
      throw new ApiError('DETECTION_NOT_FOUND', { status: 404, code: 'DETECTION_NOT_FOUND' })
    }
    if (!PRIVACY_DECISIONS.includes(decision)) {
      throw new ApiError('DECISION_INVALID', { status: 400, code: 'DECISION_INVALID' })
    }
  }

  const decided = current.map((d) => ({ ...d, decision: byId.get(d.id) ?? d.decision }))
  const answers = getMockAnswers(id)
  const kept = []
  for (const answer of answers) {
    const mine = decided.filter((d) => d.field_answer_id === answer.id)
    let value = answer.value
    // 뒤에서부터 지워야 앞쪽 위치가 그대로다
    const removed = []
    for (const d of [...mine].reverse()) {
      if (d.decision !== '삭제') continue
      let { start, end } = d
      // 지운 자리에 공백이 두 칸 남지 않게 한 칸을 같이 지운다
      if (value[start - 1] === ' ' && (value[end] === ' ' || end === value.length)) start -= 1
      value = value.slice(0, start) + value.slice(end)
      removed.push({ start, length: end - start })
    }
    for (const d of mine) {
      if (d.decision === '삭제') continue
      const shift = removed.filter((r) => r.start < d.start).reduce((sum, r) => sum + r.length, 0)
      kept.push({ ...d, start: d.start - shift, end: d.end - shift })
    }
    if (value !== answer.value) setMockAnswerValue(id, answer.id, value)
  }
  store.set(id, kept)
  return { answers: getMockAnswers(id), detections: kept.map((d) => ({ ...d })) }
}
