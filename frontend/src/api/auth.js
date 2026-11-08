// 로그인 관련 API.
// [미정] API.md에 로그인 엔드포인트가 아직 없다 (23·57·64번째 줄: 권한은 "오늘은 없음",
// 다음에 Google 로그인으로 정하기로만 결정됨). 실제 경로·요청 방식이 정해지면 여기만 고친다.
import { USE_MOCK } from './client.js'
import * as mock from '../mocks/auth.js'

/**
 * 구글 로그인 (화면만 범위, 서버 인증 처리는 별도 담당)
 * → { user: { google_sub, email, language } }
 * VITE_USE_MOCK=true 에서는 mocks/auth.js 의 임시 응답을 쓴다.
 * 엔드포인트가 정해지기 전에는 USE_MOCK=false여도 호출할 실제 주소가 없다.
 */
export function loginWithGoogle() {
  if (USE_MOCK) return mock.loginWithGoogle()
  throw new Error('[미정] 로그인 엔드포인트가 아직 API.md에 정해지지 않았습니다.')
}
