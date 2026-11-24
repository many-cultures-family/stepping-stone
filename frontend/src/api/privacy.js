// 개인정보 감지 규칙 API (F-07, US-05, R7). 기준: REVIEW-PRIVACY-API.md 항목 4.
// 감지·결정은 브라우저가 한다 (utils/privacyDetect.js). 서버는 규칙 목록만 내려 주고,
// 감지 결과·결정은 서버에 보내지도 저장하지도 않는다 (no-server-storage-user-input.md).
// VITE_USE_MOCK=true 에서는 src/mocks/privacy.js 가 서버와 같은 규칙을 돌려준다.
import { request, USE_MOCK } from './client.js'
import * as mock from '../mocks/privacy.js'

/**
 * 감지 규칙 목록 GET /api/privacy-rules
 * → { rules: [{ kind, pattern }] } — 서버 마스킹 모듈의 값 모양 규칙(privacy._PATTERNS) 그대로.
 *   kind: resident_no · alien_no · email · phone · address · long_number. 순서가 우선순위다.
 * 실패: 401 LOGIN_REQUIRED
 */
export function getPrivacyRules() {
  if (USE_MOCK) return mock.getPrivacyRules()
  return request('/privacy-rules')
}
