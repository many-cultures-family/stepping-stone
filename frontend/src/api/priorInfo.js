// 사전 정보 API (F-03, US-04). F-03 API 명세와 서버 구현이 아직 없어서 목(VITE_USE_MOCK=true)에서만 동작한다.
// 명세가 나오면 이 파일의 실서버 호출만 채운다.
import { USE_MOCK } from './client.js'
import * as mock from '../mocks/priorInfo.js'

const notReady = () => Promise.reject(new Error('사전 정보 API는 아직 없어요'))

/** 저장된 사전 정보 → { [info_key]: value } */
export function getPriorInfo() {
  return USE_MOCK ? mock.getPriorInfo() : notReady()
}

/** 사전 정보 저장 (바뀐 칸만) → 저장된 전체 사전 정보 */
export function savePriorInfo(values) {
  return USE_MOCK ? mock.savePriorInfo(values) : notReady()
}

/** 사전 정보 입력을 마치고 작성 단계로 (단계 전이 API 는 아직 없다) */
export function startWriting(draftId) {
  return USE_MOCK ? mock.startWriting(draftId) : notReady()
}
