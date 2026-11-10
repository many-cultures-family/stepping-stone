// 사전 정보(F-03) 목데이터. VITE_USE_MOCK=true 일 때 src/api/priorInfo.js 가 대신 호출한다.
// DATA-MODEL.md prior_info 모양({ [info_key]: value })을 메모리에만 들고 있다. 새로고침하면 시드로 돌아간다.
// 시드는 DATA-MODEL.md 시드 2번(가짜 값)이다.
import { updateDraft } from './drafts.js'

const delay = (ms) => new Promise((resolve) => setTimeout(resolve, ms))

let saved = { name: '테스트 사용자', birth_date: '1990.01.01', phone: '010-0000-1234' }

export async function getPriorInfo() {
  await delay(300)
  return { ...saved }
}

export async function savePriorInfo(values) {
  await delay(500)
  saved = { ...saved, ...values }
  return { ...saved }
}

/** 사전 정보 입력을 마치고 가상 작성 단계로 (작성 목록 목에 반영) */
export async function startWriting(draftId) {
  await delay(300)
  updateDraft(draftId, { step: 'writing' })
  return { id: Number(draftId), step: 'writing' }
}
