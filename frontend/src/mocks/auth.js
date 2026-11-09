// [임시] 로그인 관련 목데이터. docs/api/LOGIN-API.md 예시·DATA-MODEL.md 시드 2번을 따른다.
// 실제로는 서버 리다이렉트(Authlib)로 세션 쿠키가 생기지만, 여기서는 메모리 변수 하나로 로그인 여부를 흉내만 낸다.

import { ApiError } from '../api/client.js'

const delay = (ms) => new Promise((resolve) => setTimeout(resolve, ms))

const ALLOWED_LANGUAGES = ['ko', 'vi', 'zh', 'en']

// null = 비로그인
let session = null

function requireSession() {
  if (!session) throw new ApiError('로그인이 필요해요', { status: 401, code: 'LOGIN_REQUIRED' })
}

/** [임시] 실제로는 Google 로그인 화면으로 페이지 이동 후 서버가 세션을 만든다. */
export async function startGoogleLogin() {
  await delay(300)
  session = { email: 'tester@example.com', language: 'vi' }
}

export async function getMe() {
  await delay(200)
  requireSession()
  return { user: { ...session } }
}

export async function updateLanguage(language) {
  await delay(200)
  requireSession()
  if (!ALLOWED_LANGUAGES.includes(language)) {
    throw new ApiError('허용하지 않는 언어', { status: 400, code: 'LANGUAGE_NOT_ALLOWED' })
  }
  session = { ...session, language }
  return { user: { ...session } }
}

export async function logout() {
  await delay(200)
  session = null
  return null
}
