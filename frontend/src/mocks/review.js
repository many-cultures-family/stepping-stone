// 서술형 답변 검토(F-06) 목데이터. VITE_USE_MOCK=true 일 때 src/api/review.js 가 대신 호출한다.
// 응답 모양은 api/review.js 의 [제안]을 따른다. 서버처럼 받은 답변 안에서 위치(start·end)만 돌려준다 (R8).
// 작성 건 번호마다 화면의 상태가 갈리도록 시나리오를 나눴다. 주소 /drafts/<번호>/review 로 확인한다. 실제 개인정보는 없다.
//   1 : 검토 요청 → 제안 4개 (맞춤법·문법·질문 의도·보충이 모두 나온다)
//   2 : 첫 검토 요청은 LLM_CALL_FAILED 로 실패, '다시 시도'하면 성공 (error → loading → done)
//   3 : 검토 요청 → 고칠 곳 없음 (제안 0개)
//   4 : 답변이 비어 있는 칸이 있어 검토를 요청할 수 없다
//   5 : 서술형 칸이 없다 (빈 화면)
//   6 : 서버 연결 실패 (NETWORK_ERROR)
//   7 : 개인정보가 섞인 답변 (F-07). 검토 요청 전에 개인정보 결정 모달이 뜬다 → 결정 뒤 제안 2개
//   8 : 이미 4번 검토를 받았다. 한 번 더 받으면 5번을 다 써서 더 요청할 수 없다 (REVIEW_LIMIT_EXCEEDED)
// 답변 데이터는 mocks/answers.js 에 있다.
import { ApiError } from '../api/client.js'
import { ANSWER_SCENARIOS, getMockAnswers } from './answers.js'
import { updateDraft } from './drafts.js'

const delay = (ms) => new Promise((resolve) => setTimeout(resolve, ms))

export const REVIEW_LIMIT = 5

// target: 제안이 가리키는 원문(받은 답변에서 찾아 위치로 바꾼다). null 이면 답변 전체에 대한 제안이다.
// 받은 답변에서 target 을 못 찾으면(지웠거나 가렸으면) 그 제안은 내지 않는다. 서버도 보지 못한 글은 고칠 수 없다.
const SUGGESTIONS = {
  default: [
    { field_answer_id: 101, kind: '맞춤법', target: '저는 한국에 산지 2년 되었습니다.', suggested_text: '저는 한국에 산 지 2년 되었습니다.', explanation: "'산 지'는 띄어 써요. 시간이 지났다는 뜻일 때는 '지'를 앞말과 띄어 씁니다." },
    { field_answer_id: 101, kind: '문법', target: '아이 학교 서류를 혼자 쓰기 어려워서 신청하고 싶습니다 .', suggested_text: '아이 학교 서류를 혼자 쓰기 어려워서 신청하고 싶습니다.', explanation: '문장 끝 마침표 앞의 공백을 지웠어요.' },
    { field_answer_id: 101, kind: '질문 의도', target: null, suggested_text: null, explanation: "질문은 '왜 신청하는지'를 물어요. 아이 학교 서류가 어떤 서류인지 한 문장 더 있으면 담당자가 이해하기 쉬워요." },
    { field_answer_id: 102, kind: '보충', target: '평일 오후에는 일을 해서 전화를 받기 어렵습니다.', suggested_text: '평일 오후에는 일을 해서 전화를 받기 어렵습니다. 문자로 연락해 주시면 감사하겠습니다.', explanation: '연락받을 방법을 함께 쓰면 담당자가 바로 연락할 수 있어요.' },
  ],
  3: [],
  // 개인정보 결정을 마친 뒤의 제안. 가린 부분은 L3가 보지 못하므로 제안에도 나오지 않는다
  7: [
    { field_answer_id: 701, kind: '질문 의도', target: null, suggested_text: null, explanation: "질문은 '왜 신청하는지'를 물어요. 등록 번호보다 아이에게 왜 이 수업이 필요한지를 쓰면 좋아요." },
    { field_answer_id: 702, kind: '문법', target: '낮에는 일을 해서 전화를 받기 어렵습니다.', suggested_text: '낮에는 일을 해서 전화를 받기 어렵습니다.', explanation: "'낮에는'과 '일을 해서'가 자연스럽게 이어져요. 이 문장은 이대로도 괜찮아요." },
  ],
}

function scenarioKey(draftId) {
  return ANSWER_SCENARIOS.includes(Number(draftId)) ? Number(draftId) : 'default'
}

// 작성 건별 검토 횟수 (서버 draft.review_count 흉내). 8번은 4번 쓴 상태로 시작한다
const reviewCounts = new Map([[8, 4]])
const countOf = (id) => reviewCounts.get(id) ?? 0
let failedOnce = false
let nextSuggestionId = 1

export async function startReview(draftId) {
  await delay(300)
  const id = Number(draftId)
  updateDraft(id, { step: 'review' })
  return { id, step: 'review', review_count: countOf(id), review_limit: REVIEW_LIMIT }
}

export async function getReview(draftId) {
  await delay(400)
  const id = Number(draftId)
  if (id === 6) throw new ApiError('서버 연결 실패', { code: 'NETWORK_ERROR' })
  const answers = id === 5 ? [] : getMockAnswers(id)
  return { answers, review_count: countOf(id), review_limit: REVIEW_LIMIT }
}

// answers: [{ id, value }] — 화면이 개인정보 결정을 반영하고 '검토 제외'를 가린 답변
export async function requestReview(draftId, answers = []) {
  await delay(1200)
  const id = Number(draftId)
  if (id === 6) throw new ApiError('서버 연결 실패', { code: 'NETWORK_ERROR' })
  if (countOf(id) >= REVIEW_LIMIT) {
    throw new ApiError('REVIEW_LIMIT_EXCEEDED', { status: 429, code: 'REVIEW_LIMIT_EXCEEDED' })
  }
  if (answers.length === 0 || answers.some((a) => !a.value?.trim())) {
    throw new ApiError('ANSWER_EMPTY', { status: 400, code: 'ANSWER_EMPTY' })
  }
  if (id === 2 && !failedOnce) {
    failedOnce = true
    throw new ApiError('LLM_CALL_FAILED', { status: 502, code: 'LLM_CALL_FAILED' })
  }
  // 서버는 LLM 을 부른 뒤에 횟수를 센다 (LLM 실패는 세지 않는다)
  reviewCounts.set(id, countOf(id) + 1)

  const sent = new Map(answers.map((a) => [a.id, a.value]))
  const suggestions = (SUGGESTIONS[scenarioKey(id)] ?? []).flatMap(({ target, ...s }) => {
    const value = sent.get(s.field_answer_id)
    if (value === undefined) return []
    if (target === null) return [{ id: nextSuggestionId++, ...s, start: null, end: null }]
    const start = value.indexOf(target)
    if (start < 0) return []
    return [{ id: nextSuggestionId++, ...s, start, end: start + target.length }]
  })
  return { suggestions, review_count: countOf(id), review_limit: REVIEW_LIMIT }
}

/** 검토 마치기 → 작성완료(성공). 완성 조건 숫자가 0이 아니면 서버처럼 거절한다. 작성 목록 목에도 반영한다 */
export async function finishReview(draftId, counts = {}) {
  await delay(400)
  if (Object.values(counts).some((n) => n > 0)) {
    throw new ApiError('REVIEW_NOT_DONE', { status: 409, code: 'REVIEW_NOT_DONE' })
  }
  updateDraft(draftId, { status: '성공', step: 'review' })
  return { id: Number(draftId), status: '성공', step: 'review' }
}
