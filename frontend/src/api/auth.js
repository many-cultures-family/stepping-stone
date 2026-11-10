// 로그인 관련 API. docs/api/LOGIN-API.md 기준 (경로·응답 모양 그대로).
import { ApiError, request } from './client.js'

export const GOOGLE_LOGIN_URL = '/api/auth/google/login'

/**
 * 로그인 시작 (LOGIN-API.md 항목 1).
 * 먼저 fetch(redirect: 'manual')로 확인해, 서버가 302로 구글에 보내면 페이지를 이동한다.
 * 콜백·세션 생성은 서버가 다 하고 `/`로 돌려보낸다.
 * 실패: 500 LOGIN_NOT_CONFIGURED(서버에 구글 설정 없음), 연결 실패는 NETWORK_ERROR → ApiError
 */
export async function startGoogleLogin() {
  let res
  try {
    res = await fetch(GOOGLE_LOGIN_URL, { redirect: 'manual', credentials: 'same-origin' })
  } catch {
    throw new ApiError('서버 연결 실패', { code: 'NETWORK_ERROR' })
  }
  if (res.type === 'opaqueredirect' || (res.status >= 300 && res.status < 400)) {
    window.location.href = GOOGLE_LOGIN_URL
    return
  }
  let code = null
  try {
    const data = await res.json()
    if (typeof data?.detail?.code === 'string') code = data.detail.code
  } catch {
    // 본문이 JSON이 아니면 코드 없이 처리
  }
  if (!code && [502, 503, 504].includes(res.status)) code = 'NETWORK_ERROR'
  throw new ApiError(code ?? `요청 실패 (${res.status})`, { status: res.status, code })
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
