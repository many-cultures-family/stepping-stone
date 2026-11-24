// 브라우저 보관소 한 곳. 사전 정보·가상 작성 입력값은 서버에 저장하지 않고 브라우저에만 둔다
// (docs/decisions/no-server-storage-user-input.md). 브라우저 '어디에' 둘지는 정했다(data-flow.md 5절 #3, 2026-11-24):
//   - 가상 작성 입력값: sessionStorage. 새로고침해도 남고, 탭을 닫으면 지워진다. 작성 건 취소·로그아웃 때도 지운다
//   - 사전 정보: localStorage. 다음에 와도 다시 쓰지 않게 남긴다. 사용자별로 나누고, 화면에서 직접 지울 수 있다
// 결정이 바뀌면 이 파일만 고치면 된다. 저장소를 못 쓰는 브라우저(사생활 보호 모드·차단)에서도 화면은 그대로 동작한다.
const PREFIX = 'didimdol:'
const DRAFT_INPUT = `${PREFIX}draft-input:`
const PRIOR_INFO = `${PREFIX}prior-info:`

function storage(kind) {
  try {
    return kind === 'local' ? window.localStorage : window.sessionStorage
  } catch {
    return null
  }
}

function readJson(kind, key) {
  try {
    const raw = storage(kind)?.getItem(key)
    return raw ? JSON.parse(raw) : null
  } catch {
    return null
  }
}

function writeJson(kind, key, value) {
  try {
    storage(kind)?.setItem(key, JSON.stringify(value))
  } catch {
    // 저장소가 꽉 찼거나 막혔으면 메모리 상태만으로 계속한다
  }
}

function remove(kind, key) {
  try {
    storage(kind)?.removeItem(key)
  } catch {
    // 무시
  }
}

// ── 가상 작성 입력값 (작성 건별) ──

/** 저장해 둔 입력값 → { values, acks } 또는 null */
export function loadDraftInput(draftId) {
  const data = readJson('session', `${DRAFT_INPUT}${Number(draftId)}`)
  if (!data || typeof data.values !== 'object') return null
  return { values: data.values ?? {}, acks: data.acks ?? {} }
}

export function saveDraftInput(draftId, { values, acks }) {
  writeJson('session', `${DRAFT_INPUT}${Number(draftId)}`, { values, acks })
}

export function clearDraftInput(draftId) {
  remove('session', `${DRAFT_INPUT}${Number(draftId)}`)
}

/** 모든 작성 건의 입력값을 지운다 (로그아웃) */
export function clearAllDraftInputs() {
  const s = storage('session')
  if (!s) return
  try {
    const keys = []
    for (let i = 0; i < s.length; i++) {
      const k = s.key(i)
      if (k?.startsWith(DRAFT_INPUT)) keys.push(k)
    }
    keys.forEach((k) => s.removeItem(k))
  } catch {
    // 무시
  }
}

// ── 사전 정보 (사용자별) ──

// 로그인한 사용자를 나누는 열쇠. 서버가 사용자 id 를 주지 않아(/api/auth/me 는 email·language 만) 이메일로 만든다.
// 이메일이 키에 그대로 보이지 않게 짧은 해시(FNV-1a)로 바꾼다. 보안용이 아니라 사용자 구분용이다.
function userKey(email) {
  let h = 0x811c9dc5
  for (const ch of String(email ?? '').toLowerCase()) {
    h ^= ch.codePointAt(0)
    h = Math.imul(h, 0x01000193) >>> 0
  }
  return h.toString(16).padStart(8, '0')
}

let currentEmail = null

/** 지금 로그인한 사용자 (AuthContext 가 로그인 상태가 바뀔 때 넣어 준다). 로그아웃이면 null */
export function setStoreUser(email) {
  currentEmail = email ?? null
}

export function hasStoreUser() {
  return Boolean(currentEmail)
}

/** 지금 사용자의 사전 정보 → { [info_key]: value } (없으면 {}) */
export function loadPriorInfo() {
  if (!currentEmail) return {}
  const data = readJson('local', `${PRIOR_INFO}${userKey(currentEmail)}`)
  return data && typeof data === 'object' ? data : {}
}

/** 바뀐 칸만 합쳐 저장. 빈 값은 지운다. 저장된 전체를 돌려준다 */
export function savePriorInfo(patch) {
  if (!currentEmail) return {}
  const next = { ...loadPriorInfo() }
  for (const [k, v] of Object.entries(patch ?? {})) {
    const value = typeof v === 'string' ? v.trim() : ''
    if (value) next[k] = value
    else delete next[k]
  }
  writeJson('local', `${PRIOR_INFO}${userKey(currentEmail)}`, next)
  return next
}

export function clearPriorInfo() {
  if (!currentEmail) return
  remove('local', `${PRIOR_INFO}${userKey(currentEmail)}`)
}
