// 사전 정보 API (F-03, US-04).
// 사전 정보는 서버에 저장하지 않는다(docs/decisions/no-server-storage-user-input.md). 그래서 서버를 부르지 않고
// 이 브라우저(utils/browserStore.js, [제안] localStorage·사용자별)에 둔다.
// 화면 코드는 이 함수만 쓴다. 보관 위치가 바뀌어도 화면은 그대로다.
import * as store from '../utils/browserStore.js'
import { startWriting as startWritingApi } from './writing.js'

/** 저장된 사전 정보 → { [info_key]: value } */
export function getPriorInfo() {
  return Promise.resolve(store.loadPriorInfo())
}

/** 사전 정보 저장 (바뀐 칸만, 빈 값은 지움) → 저장된 전체 사전 정보 */
export function savePriorInfo(values) {
  return Promise.resolve(store.savePriorInfo(values))
}

/** 이 기기에 저장한 사전 정보 지우기 (공용 기기 등) */
export function clearPriorInfo() {
  store.clearPriorInfo()
  return Promise.resolve({})
}

/** 사전 정보 입력을 마치고 작성 단계로 (VIRTUAL-FORM-API.md 항목 2 `POST .../writing:start`) */
export function startWriting(draftId) {
  return startWritingApi(draftId)
}
