// 서술형 답변 검토(F-06) 목데이터. VITE_USE_MOCK=true 일 때 src/api/review.js 가 대신 호출한다.
// F-06 API 명세가 아직 없어서 응답 모양은 DATA-MODEL.md(field_answer, review_suggestion)를 옮긴 [제안]이다.
// 작성 건 번호마다 화면의 상태가 갈리도록 시나리오를 나눴다. 주소 /drafts/<번호>/review 로 확인한다. 실제 개인정보는 없다.
//   1 : 검토 요청 → 제안 4개 (맞춤법·문법·질문 의도·보충이 모두 나온다)
//   2 : 첫 검토 요청은 LLM_CALL_FAILED 로 실패, '다시 시도'하면 성공 (error → loading → done)
//   3 : 검토 요청 → 고칠 곳 없음 (제안 0개)
//   4 : 답변이 비어 있는 칸이 있어 검토를 요청할 수 없다
//   5 : 서술형 칸이 없다 (빈 화면)
//   6 : 서버 연결 실패 (NETWORK_ERROR)
//   7 : 개인정보가 섞인 답변 (F-07). 검토 요청 전에 개인정보 결정 모달이 뜬다 → 결정 뒤 제안 2개
// 답변 데이터는 mocks/answers.js 에 있다 (개인정보 감지 목과 같이 쓴다).
import { ApiError } from '../api/client.js'
import { ANSWER_SCENARIOS, getMockAnswers } from './answers.js'
import { undecidedCount } from './privacy.js'
import { updateDraft } from './drafts.js'

const delay = (ms) => new Promise((resolve) => setTimeout(resolve, ms))

// kind: 맞춤법 · 문법 · 질문 의도 · 보충 (DATA-MODEL.md review_suggestion.kind)
const SUGGESTIONS = {
  default: [
    { id: 1, field_answer_id: 101, kind: '맞춤법', suggested_text: '저는 한국에 산 지 2년 되었습니다.', explanation: "'산 지'는 띄어 써요. 시간이 지났다는 뜻일 때는 '지'를 앞말과 띄어 씁니다.", decision: '미결정' },
    { id: 2, field_answer_id: 101, kind: '문법', suggested_text: '아이 학교 서류를 혼자 쓰기 어려워서 신청하고 싶습니다.', explanation: '문장 끝 마침표 앞의 공백을 지웠어요.', decision: '미결정' },
    { id: 3, field_answer_id: 101, kind: '질문 의도', suggested_text: null, explanation: "질문은 '왜 신청하는지'를 물어요. 아이 학교 서류가 어떤 서류인지 한 문장 더 있으면 담당자가 이해하기 쉬워요.", decision: '미결정' },
    { id: 4, field_answer_id: 102, kind: '보충', suggested_text: '평일 오후에는 일을 해서 전화를 받기 어렵습니다. 문자로 연락해 주시면 감사하겠습니다.', explanation: '연락받을 방법을 함께 쓰면 담당자가 바로 연락할 수 있어요.', decision: '미결정' },
  ],
  3: [],
  // 개인정보 결정을 마친 뒤의 제안. 가린 부분은 L3가 보지 못하므로 제안에도 나오지 않는다
  7: [
    { id: 71, field_answer_id: 701, kind: '질문 의도', suggested_text: null, explanation: "질문은 '왜 신청하는지'를 물어요. 등록 번호보다 아이에게 왜 이 수업이 필요한지를 쓰면 좋아요.", decision: '미결정' },
    { id: 72, field_answer_id: 702, kind: '문법', suggested_text: '낮에는 일을 해서 전화를 받기 어렵습니다.', explanation: "'낮에는'과 '일을 해서'가 자연스럽게 이어져요. 이 문장은 이대로도 괜찮아요.", decision: '미결정' },
  ],
}

function scenarioKey(draftId) {
  return ANSWER_SCENARIOS.includes(Number(draftId)) ? Number(draftId) : 'default'
}

let failedOnce = false

export async function getReview(draftId) {
  await delay(400)
  const id = Number(draftId)
  if (id === 6) throw new ApiError('서버 연결 실패', { code: 'NETWORK_ERROR' })
  if (id === 5) return { answers: [] }
  return { answers: getMockAnswers(id) }
}

export async function requestReview(draftId) {
  await delay(1200)
  const id = Number(draftId)
  if (id === 2 && !failedOnce) {
    failedOnce = true
    throw new ApiError('LLM_CALL_FAILED', { status: 502, code: 'LLM_CALL_FAILED' })
  }
  if (id === 6) throw new ApiError('서버 연결 실패', { code: 'NETWORK_ERROR' })
  // R7: 감지된 개인정보를 사용자가 모두 정하기 전에는 답변을 L3에 보내지 않는다. 서버도 이렇게 막아야 한다 [제안]
  if (undecidedCount(id) > 0) throw new ApiError('PRIVACY_UNDECIDED', { status: 409, code: 'PRIVACY_UNDECIDED' })
  const rows = SUGGESTIONS[scenarioKey(id)] ?? []
  return { suggestions: rows.map((s) => ({ ...s, decision: '미결정' })) }
}

export async function decideSuggestion(draftId, suggestionId, decision) {
  await delay(150)
  return { id: suggestionId, decision }
}

/** 검토 마치기 → 완성본 확정(성공). 작성 목록 목에도 반영한다 */
export async function finishReview(draftId) {
  await delay(400)
  updateDraft(draftId, { status: '성공', step: 'review' })
  return { id: Number(draftId), status: '성공' }
}
