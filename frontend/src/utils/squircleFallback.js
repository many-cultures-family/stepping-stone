// corner-shape 를 지원하지 않는 브라우저(Safari·Firefox, 2026 기준)용 스쿼클 대체 구현.
//
// theme.js 의 squircle() 은 요소에 CSS 변수 --squircle-r(상속 안 됨, index.css @property)을 남긴다.
// 이 변수는 "스쿼클로 그려라" 표시로만 쓰고, 반지름은 요소의 계산된 네 모서리 border-radius 를 그대로 읽는다.
// (그래서 한쪽 모서리만 둥근 시트·카드도 같은 규칙으로 처리된다)
// 실제 크기(w×h)에 맞는 n = 4 superellipse path 를 계산해 clip-path: path(...) 로 자른다.
// 크기가 바뀌면(ResizeObserver) 다시 계산한다.
//
// 한계: clip-path 는 요소 밖으로 나가는 그림자·포커스 테두리도 함께 자른다. 그래서 이 대체 경로에서만
// 그림자는 잘리고, 모서리 부근의 얇은 테두리는 짧게 보일 수 있다. (corner-shape 지원 브라우저는 영향 없음)
import { squirclePath, supportsCornerShape } from './squircle.js'

const APPLIED = 'data-squircle-js'
const tracked = new Set()
let resizeObserver = null

function enabled(el) {
  const r = Number.parseFloat(getComputedStyle(el).getPropertyValue('--squircle-r'))
  return Number.isFinite(r) && r > 0
}

const CORNERS = ['borderTopLeftRadius', 'borderTopRightRadius', 'borderBottomRightRadius', 'borderBottomLeftRadius']

/** CSS 가 정한 네 모서리 반지름 (px). 우리가 넣은 inline 0 은 잠시 빼고 읽는다 */
function cssRadii(el, w) {
  const had = el.style.getPropertyValue('border-radius')
  if (had) el.style.removeProperty('border-radius')
  const cs = getComputedStyle(el)
  const radii = CORNERS.map((k) => {
    const v = cs[k].split(' ')[0]
    const n = Number.parseFloat(v)
    if (!Number.isFinite(n)) return 0
    return v.endsWith('%') ? (n / 100) * w : n
  })
  if (had) el.style.setProperty('border-radius', had)
  return radii
}

function clear(el) {
  if (!el.hasAttribute(APPLIED)) return
  el.style.removeProperty('clip-path')
  el.style.removeProperty('border-radius')
  el.removeAttribute(APPLIED)
}

function apply(el) {
  if (!el.isConnected) {
    tracked.delete(el)
    resizeObserver.unobserve(el)
    return
  }
  const w = el.offsetWidth
  const h = el.offsetHeight
  if (!enabled(el) || !w || !h) {
    clear(el)
    return
  }
  const radii = cssRadii(el, w)
  if (radii.every((v) => v === 0)) {
    clear(el)
    return
  }
  el.style.setProperty('clip-path', `path('${squirclePath(w, h, radii)}')`)
  // 원 모양 border-radius 가 남아 있으면 스쿼클보다 모서리를 더 깎아 배경이 비어 보인다 → 0 으로
  el.style.setProperty('border-radius', '0px')
  el.setAttribute(APPLIED, '')
}

function consider(el) {
  if (!(el instanceof HTMLElement) || el.closest('svg')) return
  if (tracked.has(el)) {
    apply(el)
    return
  }
  if (enabled(el)) {
    tracked.add(el)
    resizeObserver.observe(el)
    apply(el)
  }
}

function scan(root) {
  consider(root)
  if (root.querySelectorAll) root.querySelectorAll('*').forEach(consider)
}

/** 앱 시작 때 한 번 호출. force 가 true 면 corner-shape 지원 브라우저에서도 JS 경로를 쓴다(확인용). */
export function installSquircleFallback({ force = false } = {}) {
  if (typeof window === 'undefined' || (!force && supportsCornerShape())) return
  if (resizeObserver) return
  document.documentElement.setAttribute('data-squircle-fallback', '')

  resizeObserver = new ResizeObserver((entries) => entries.forEach((e) => apply(e.target)))

  // React 가 그린 노드와 class 변경(MUI 상태·반응형)을 한 프레임에 모아 처리한다
  const pending = new Set()
  let scheduled = false
  const flush = () => {
    scheduled = false
    pending.forEach((node) => (node.isConnected ? scan(node) : null))
    pending.clear()
    tracked.forEach((el) => !el.isConnected && apply(el))
  }
  const queue = (node) => {
    pending.add(node)
    if (!scheduled) {
      scheduled = true
      // rAF 는 백그라운드 탭에서 멈추므로 짧은 타이머로 모은다
      setTimeout(flush, 16)
    }
  }

  new MutationObserver((records) => {
    for (const rec of records) {
      if (rec.type === 'attributes') queue(rec.target)
      else rec.addedNodes.forEach((n) => n.nodeType === 1 && queue(n))
    }
  }).observe(document.body, { subtree: true, childList: true, attributes: true, attributeFilter: ['class'] })

  // 화면 폭이 바뀌면 반응형 반지름(--squircle-r)이 바뀔 수 있다
  window.addEventListener('resize', () => tracked.forEach(apply), { passive: true })

  scan(document.body)
}
