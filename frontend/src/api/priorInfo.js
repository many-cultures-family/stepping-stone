// 사전 정보 API (F-03, US-04).
// 사전 정보는 서버에 저장하지 않는다(docs/decisions/no-server-storage-user-input.md). 그래서 실서버 모드도 서버를 부르지 않고
// 이 브라우저(utils/browserStore.js, [제안] localStorage·사용자별)에 둔다. 목 모드는 메모리 목(mocks/priorInfo.js)을 쓴다.
// 화면 코드는 이 함수만 쓴다. 보관 위치가 바뀌어도 화면은 그대로다.
import { USE_MOCK } from './client.js'
import * as mock from '../mocks/priorInfo.js'
import * as store from '../utils/browserStore.js'
import { startWriting as startWritingApi } from './writing.js'

/** 저장된 사전 정보 → { [info_key]: value } */
export function getPriorInfo() {
  if (USE_MOCK) return mock.getPriorInfo()
  return Promise.resolve(store.loadPriorInfo())
}

/** 사전 정보 저장 (바뀐 칸만, 빈 값은 지움) → 저장된 전체 사전 정보 */
export function savePriorInfo(values) {
  if (USE_MOCK) return mock.savePriorInfo(values)
  return Promise.resolve(store.savePriorInfo(values))
}

/** 이 기기에 저장한 사전 정보 지우기 (공용 기기 등) */
export function clearPriorInfo() {
  if (USE_MOCK) return mock.clearPriorInfo()
  store.clearPriorInfo()
  return Promise.resolve({})
}

/** 사전 정보 입력을 마치고 작성 단계로 (VIRTUAL-FORM-API.md 항목 2 `POST .../writing:start`) */
export function startWriting(draftId) {
  return USE_MOCK ? mock.startWriting(draftId) : startWritingApi(draftId)
}
