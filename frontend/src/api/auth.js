// 로그인 관련 API. docs/api/LOGIN-API.md 기준 (경로·응답 모양 그대로).
import { request } from './client.js'

export const GOOGLE_LOGIN_URL = '/api/auth/google/login'

/**
 * 로그인 시작 (LOGIN-API.md 항목 1). 서버가 302로 구글에 보내므로 페이지를 바로 이동한다.
 * 콜백·세션 생성은 서버가 다 하고 `/`로 돌려보낸다.
 * 예전에는 fetch(redirect: 'manual')로 먼저 확인한 뒤 같은 URL로 다시 이동해 매 로그인마다 서버에 2번 요청했다.
 * 그래서 확인 요청을 뺐다. 서버에 구글 설정이 없으면(500 LOGIN_NOT_CONFIGURED) 그 응답이 그대로 보인다.
 */
export async function startGoogleLogin() {
  window.location.assign(GOOGLE_LOGIN_URL)
}

/** GET /api/auth/me (LOGIN-API.md 항목 3) → { user: { email, language } }. 비로그인이면 401 LOGIN_REQUIRED */
export function getMe() {
  return request('/auth/me')
}

/** PATCH /api/auth/me (LOGIN-API.md 항목 4) → { user }. 실패: 401 / 400 LANGUAGE_NOT_ALLOWED */
export function updateLanguage(language) {
  return request('/auth/me', { method: 'PATCH', body: { language } })
}

/** POST /api/auth/logout (LOGIN-API.md 항목 5) → 204 */
export function logout() {
  return request('/auth/logout', { method: 'POST' })
}
