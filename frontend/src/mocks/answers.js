// 서술형 답변 목 저장소. 답변 검토(mocks/review.js)와 개인정보 감지(mocks/privacy.js)가 같이 쓴다.
// 개인정보 감지에서 '지울게요'를 고르면 답변이 바뀌므로, 두 목이 같은 답변을 봐야 한다.
// 시나리오 번호는 mocks/review.js 맨 위 주석을 본다. 실제 개인정보는 없다(모두 지어낸 값).

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
  // 7 : 개인정보가 섞인 답변 (F-07). 전화번호·이메일·외국인등록번호·주소가 감지된다
  7: [
    {
      id: 701,
      label: '신청 사유',
      guide: '왜 이 서비스를 신청하는지 두세 문장으로 써 주세요.',
      value: '저는 900101-5000000 번호로 외국인 등록을 했습니다. 아이 방과후학교 수업을 신청하고 싶습니다.',
    },
    {
      id: 702,
      label: '추가로 전달할 내용',
      guide: '담당자에게 알리고 싶은 내용이 있으면 써 주세요.',
      value: '낮에는 일을 해서 전화를 받기 어렵습니다. 010-0000-5678로 문자 주시거나 mai.test@example.com으로 메일 주세요. 집은 부산시 예시구 디딤돌로 12입니다.',
    },
  ],
}

export const ANSWER_SCENARIOS = [3, 4, 7]

const store = new Map()

function seed(draftId) {
  const key = ANSWER_SCENARIOS.includes(draftId) ? draftId : 'default'
  return ANSWERS[key].map((a) => ({ ...a }))
}

/** 작성 건의 서술형 답변 (복사본). 5·6번 시나리오(빈 화면·연결 실패)는 mocks/review.js 가 따로 처리한다 */
export function getMockAnswers(draftId) {
  const id = Number(draftId)
  if (!store.has(id)) store.set(id, seed(id))
  return store.get(id).map((a) => ({ ...a }))
}

export function setMockAnswerValue(draftId, answerId, value) {
  const id = Number(draftId)
  if (!store.has(id)) store.set(id, seed(id))
  store.set(
    id,
    store.get(id).map((a) => (a.id === answerId ? { ...a, value } : a)),
  )
}
