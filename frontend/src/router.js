// 아주 작은 경로 처리 (합의된 의존성을 지키려고 react-router 를 넣지 않음)
// 경로: /  랜딩 · /upload  서류 올리기 · /drafts  내 작성 목록 · /drafts/:id/fields  입력 항목 확인 · /drafts/:id/review  서술형 검토
//       /drafts/:id/prior-info  사전 정보 입력 · /prior-info  내 사전 정보 관리 · /drafts/:id/writing  가상 작성
//       /drafts/:id/reupload  반려된 작성 건에 다른 파일 다시 올리기
import { useSyncExternalStore } from 'react'

const EVENT = 'didimdol:navigate'

function subscribe(callback) {
  window.addEventListener('popstate', callback)
  window.addEventListener(EVENT, callback)
  return () => {
    window.removeEventListener('popstate', callback)
    window.removeEventListener(EVENT, callback)
  }
}

export function usePath() {
  return useSyncExternalStore(subscribe, () => window.location.pathname)
}

// replace: 방문 기록을 남기지 않고 지금 주소를 바꾼다 (뒤로 가기로 같은 화면에 돌아오지 않게)
export function navigate(path, { replace = false } = {}) {
  if (path === window.location.pathname) return
  if (replace) window.history.replaceState(null, '', path)
  else window.history.pushState(null, '', path)
  window.dispatchEvent(new Event(EVENT))
  window.scrollTo({ top: 0 })
}

/** 경로 → { name, params } */
export function matchRoute(path) {
  if (path === '/upload') return { name: 'upload', params: {} }
  if (/^\/drafts\/?$/.test(path)) return { name: 'drafts', params: {} }
  const m = path.match(/^\/drafts\/(\d+)\/fields\/?$/)
  if (m) return { name: 'fields', params: { draftId: Number(m[1]) } }
  const p = path.match(/^\/drafts\/(\d+)\/prior-info\/?$/)
  if (p) return { name: 'prior-info', params: { draftId: Number(p[1]) } }
  if (/^\/prior-info\/?$/.test(path)) return { name: 'prior-info', params: {} }
  const r = path.match(/^\/drafts\/(\d+)\/review\/?$/)
  if (r) return { name: 'review', params: { draftId: Number(r[1]) } }
  const u = path.match(/^\/drafts\/(\d+)\/reupload\/?$/)
  if (u) return { name: 'reupload', params: { draftId: Number(u[1]) } }
  const w = path.match(/^\/drafts\/(\d+)\/writing\/?$/)
  if (w) return { name: 'writing', params: { draftId: Number(w[1]) } }
  return { name: 'landing', params: {} }
}

// 업로드한 File 은 주소에 담을 수 없어서, 다음 화면(원본 미리보기)으로 넘길 때만 메모리에 잠깐 둔다.
// 새로고침하면 사라지고, 미리보기는 서버 원본(또는 목 모드 샘플 서식)을 쓴다.
const pendingFiles = new Map()
export function setPendingFile(draftId, file) {
  pendingFiles.set(Number(draftId), file)
}
export function getPendingFile(draftId) {
  return pendingFiles.get(Number(draftId)) ?? null
}
