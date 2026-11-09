// 로그인 관련 API. docs/api/LOGIN-API.md 기준 (경로·응답 모양 그대로).
import { request, USE_MOCK } from './client.js'
import * as mock from '../mocks/auth.js'

export const GOOGLE_LOGIN_URL = '/api/auth/google/login'

/**
 * 로그인 시작 (LOGIN-API.md 항목 1).
 * fetch가 아니라 페이지 이동으로 처리한다. 콜백·세션 생성은 서버가 다 하고 `/`로 돌려보낸다.
 * [임시] VITE_USE_MOCK=true면 실제 이동 대신 mock 세션을 바로 로그인 상태로 만든다.
 */
export function startGoogleLogin() {
  if (USE_MOCK) return mock.startGoogleLogin()
  window.location.href = GOOGLE_LOGIN_URL
  return Promise.resolve()
}

/** GET /api/auth/me (LOGIN-API.md 항목 3) → { user: { email, language } }. 비로그인이면 401 LOGIN_REQUIRED */
export function getMe() {
  if (USE_MOCK) return mock.getMe()
  return request('/auth/me')
}

/** PATCH /api/auth/me (LOGIN-API.md 항목 4) → { user }. 실패: 401 / 400 LANGUAGE_NOT_ALLOWED */
export function updateLanguage(language) {
  if (USE_MOCK) return mock.updateLanguage(language)
  return request('/auth/me', { method: 'PATCH', body: { language } })
}

/** POST /api/auth/logout (LOGIN-API.md 항목 5) → 204 */
export function logout() {
  if (USE_MOCK) return mock.logout()
  return request('/auth/logout', { method: 'POST' })
}
