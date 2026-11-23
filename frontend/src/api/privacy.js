// 서술형 답변 개인정보 감지 API (F-07, US-05, R7). 기준: DATA-MODEL.md privacy_detection.
// F-07 API 명세(docs/api)가 아직 없다. 아래 경로·응답 모양은 모두 [제안]이고, 명세가 나오면 이 파일만 고친다.
// VITE_USE_MOCK=true 에서는 src/mocks/privacy.js 가 응답한다.
// 감지는 서버 규칙(정규식)으로 한다. 화면은 결과를 보여 주고 사용자의 결정만 모아 보낸다.
import { request, USE_MOCK } from './client.js'
import * as mock from '../mocks/privacy.js'

/**
 * 개인정보 감지 POST /api/drafts/{id}/privacy:detect [제안]
 * 서술형 답변 전체를 서버 규칙으로 훑는다. 이미 결정한 감지(답변이 안 바뀐 것)는 그 결정을 그대로 돌려준다.
 * → { detections: [{ id, field_answer_id, start, end, kind, decision }] }
 *   kind: phone · email · resident_no · alien_no · address / decision: null(결정 전) · '유지' · '삭제' · '검토 제외'
 *   감지된 원문은 주지 않는다(R8). 화면은 답변 값에서 start~end 를 잘라 보여 준다.
 * 실패: 401 LOGIN_REQUIRED, 403 FORBIDDEN_DRAFT, 404 DRAFT_NOT_FOUND, 409 DRAFT_STEP_INVALID
 */
export function detectPrivacy(draftId) {
  if (USE_MOCK) return mock.detectPrivacy(draftId)
  return request(`/drafts/${draftId}/privacy:detect`, { method: 'POST', body: {} })
}

/**
 * 개인정보 결정 저장 POST /api/drafts/{id}/privacy:decide [제안]
 * 본문 { decisions: [{ id, decision }] }. '삭제'는 답변에서 그 부분을 지우므로 뒤쪽 위치가 바뀐다.
 * 그래서 하나씩이 아니라 한 번에 보내고, 서버가 바뀐 답변과 위치를 다시 돌려준다.
 * → { answers: [{ id, label, guide, value }], detections: [...] }
 * 실패: 400 DECISION_INVALID, 404 DETECTION_NOT_FOUND, 그 외 detectPrivacy 와 같음
 */
export function decidePrivacy(draftId, decisions) {
  if (USE_MOCK) return mock.decidePrivacy(draftId, decisions)
  return request(`/drafts/${draftId}/privacy:decide`, { method: 'POST', body: { decisions } })
}
