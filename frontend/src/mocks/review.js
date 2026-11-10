// 서술형 답변 검토(F-06) 목데이터. VITE_USE_MOCK=true 일 때 src/api/review.js 가 대신 호출한다.
// F-06 API 명세가 아직 없어서 응답 모양은 DATA-MODEL.md(field_answer, review_suggestion)를 옮긴 [제안]이다.
// 작성 건 번호마다 화면의 상태가 갈리도록 시나리오를 나눴다. 주소 /drafts/<번호>/review 로 확인한다. 실제 개인정보는 없다.
//   1 : 검토 요청 → 제안 4개 (맞춤법·문법·질문 의도·보충이 모두 나온다)
//   2 : 첫 검토 요청은 LLM_CALL_FAILED 로 실패, '다시 시도'하면 성공 (error → loading → done)
//   3 : 검토 요청 → 고칠 곳 없음 (제안 0개)
//   4 : 답변이 비어 있는 칸이 있어 검토를 요청할 수 없다
//   5 : 서술형 칸이 없다 (빈 화면)
//   6 : 서버 연결 실패 (NETWORK_ERROR)
import { ApiError } from '../api/client.js'

const delay = (ms) => new Promise((resolve) => setTimeout(resolve, ms))

const ANSWERS = {
  default: [
    {
      id: 101,
      label: '신청 사유',
      guide: '왜 이 서비스를 신청하는지 두세 문장으로 써 주세요.',
      value: '저는 한국에 산지 2년 되었습니다. 아이 학교 서류를 혼자 쓰기 어려워서 신청하고 싶습니다 .',
    },
    {
      id: 102,
      label: '추가로 전달할 내용',
      guide: '담당자에게 알리고 싶은 내용이 있으면 써 주세요.',
      value: '평일 오후에는 일을 해서 전화를 받기 어렵습니다.',
    },
  ],
  3: [{ id: 301, label: '신청 사유', guide: '왜 신청하는지 써 주세요.', value: '아이 학교 서류를 쓰는 데 도움이 필요합니다.' }],
  4: [
    { id: 401, label: '신청 사유', guide: '왜 신청하는지 써 주세요.', value: '아이 학교 서류를 쓰는 데 도움이 필요합니다.' },
    { id: 402, label: '추가로 전달할 내용', guide: '담당자에게 알리고 싶은 내용이 있으면 써 주세요.', value: '' },
  ],
}

// kind: 맞춤법 · 문법 · 질문 의도 · 보충 (DATA-MODEL.md review_suggestion.kind)
const SUGGESTIONS = {
  default: [
    { id: 1, field_answer_id: 101, kind: '맞춤법', suggested_text: '저는 한국에 산 지 2년 되었습니다.', explanation: "'산 지'는 띄어 써요. 시간이 지났다는 뜻일 때는 '지'를 앞말과 띄어 씁니다.", decision: '미결정' },
    { id: 2, field_answer_id: 101, kind: '문법', suggested_text: '아이 학교 서류를 혼자 쓰기 어려워서 신청하고 싶습니다.', explanation: '문장 끝 마침표 앞의 공백을 지웠어요.', decision: '미결정' },
    { id: 3, field_answer_id: 101, kind: '질문 의도', suggested_text: null, explanation: "질문은 '왜 신청하는지'를 물어요. 아이 학교 서류가 어떤 서류인지 한 문장 더 있으면 담당자가 이해하기 쉬워요.", decision: '미결정' },
    { id: 4, field_answer_id: 102, kind: '보충', suggested_text: '평일 오후에는 일을 해서 전화를 받기 어렵습니다. 문자로 연락해 주시면 감사하겠습니다.', explanation: '연락받을 방법을 함께 쓰면 담당자가 바로 연락할 수 있어요.', decision: '미결정' },
  ],
  3: [],
}

function scenarioKey(draftId) {
  return [3, 4].includes(Number(draftId)) ? Number(draftId) : 'default'
}

let failedOnce = false

export async function getReview(draftId) {
  await delay(400)
  const id = Number(draftId)
  if (id === 6) throw new ApiError('서버 연결 실패', { code: 'NETWORK_ERROR' })
  if (id === 5) return { answers: [] }
  return { answers: ANSWERS[scenarioKey(id)] }
}

export async function requestReview(draftId) {
  await delay(1200)
  const id = Number(draftId)
  if (id === 2 && !failedOnce) {
    failedOnce = true
    throw new ApiError('LLM_CALL_FAILED', { status: 502, code: 'LLM_CALL_FAILED' })
  }
  if (id === 6) throw new ApiError('서버 연결 실패', { code: 'NETWORK_ERROR' })
  const rows = SUGGESTIONS[scenarioKey(id)] ?? []
  return { suggestions: rows.map((s) => ({ ...s, decision: '미결정' })) }
}

export async function decideSuggestion(draftId, suggestionId, decision) {
  await delay(150)
  return { id: suggestionId, decision }
}
