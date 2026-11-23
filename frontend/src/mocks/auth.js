// 가짜 로그인 세션. VITE_USE_MOCK=true 이고 VITE_MOCK_LOGIN=true 일 때만 src/api/auth.js 가 대신 호출한다.
// Google 로그인·백엔드 없이 로그인이 필요한 화면(업로드·사전 정보·답변 검토 등)을 목 모드로 확인하려고 둔다.
// 응답 모양은 docs/api/LOGIN-API.md 그대로다. 사용자는 DATA-MODEL.md 시드 2번(가짜 값)이다.
// - 처음 열면 로그인된 상태다. 로그아웃하면 이 탭에서는 로그아웃 상태가 유지된다 (sessionStorage).
// - 'Google로 로그인'을 누르면 실제처럼 페이지를 새로 읽어 로그인 상태가 된다.
// 실서버 로그인 확인은 VITE_MOCK_LOGIN 을 끄고 한다 (PR #27: 목 모드에서도 로그인은 기본으로 실서버).
import { ApiError } from '../api/client.js'

const delay = (ms) => new Promise((resolve) => setTimeout(resolve, ms))

const KEY = 'didimdol:mock-session'
const ALLOWED_LANGUAGES = ['ko', 'vi', 'zh', 'en']
const SEED_USER = { email: 'tester@example.com', language: 'vi' }

function read() {
  try {
    const raw = window.sessionStorage.getItem(KEY)
    if (raw === null) return { ...SEED_USER }
    return raw === 'null' ? null : JSON.parse(raw)
  } catch {
    return { ...SEED_USER }
  }
}

function write(user) {
  try {
    window.sessionStorage.setItem(KEY, JSON.stringify(user))
  } catch {
    // 저장소를 못 쓰는 환경(비공개 창 등)이면 새로고침 전까지만 유지된다
  }
}

let session = read()

function requireSession() {
  if (!session) throw new ApiError('LOGIN_REQUIRED', { status: 401, code: 'LOGIN_REQUIRED' })
}

/** 실제는 Google로 이동했다가 서버가 세션을 만들고 `/`로 돌아온다. 목은 세션을 만들고 페이지를 새로 읽는다 */
export async function startGoogleLogin() {
  await delay(200)
  session = { ...SEED_USER }
  write(session)
  window.location.reload()
}

export async function getMe() {
  await delay(150)
  requireSession()
  return { user: { ...session } }
}

export async function updateLanguage(language) {
  await delay(150)
  requireSession()
  if (!ALLOWED_LANGUAGES.includes(language)) {
    throw new ApiError('LANGUAGE_NOT_ALLOWED', { status: 400, code: 'LANGUAGE_NOT_ALLOWED' })
  }
  session = { ...session, language }
  write(session)
  return { user: { ...session } }
}

export async function logout() {
  await delay(150)
  session = null
  write(null)
  return null
}
