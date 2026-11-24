// 브라우저 보관소 한 곳. 가상 작성 입력값(과 앞으로 사전 정보)은 서버에 저장하지 않고 브라우저에만 둔다
// (docs/decisions/no-server-storage-user-input.md). 브라우저 '어디에' 둘지는 아직 팀 결정 전이다(data-flow.md 5절 #3).
// [제안] 이 파일의 값:
//   - 가상 작성 입력값: sessionStorage. 새로고침해도 남고, 탭을 닫으면 지워진다. 작성 건 취소·로그아웃 때도 지운다
// 결정이 바뀌면 이 파일만 고치면 된다. 저장소를 못 쓰는 브라우저(사생활 보호 모드·차단)에서도 화면은 그대로 동작한다.
const PREFIX = 'didimdol:'
const DRAFT_INPUT = `${PREFIX}draft-input:`

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
