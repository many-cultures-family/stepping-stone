// corner-shape 를 지원하지 않는 브라우저(Safari·Firefox, 2026 기준)용 스쿼클 대체 구현.
//
// theme.js 의 squircle() 은 요소에 CSS 변수 --squircle-r(상속 안 됨, index.css @property)을 남긴다.
// 이 변수는 "스쿼클로 그려라" 표시로만 쓰고, 반지름은 요소의 계산된 네 모서리 border-radius 를 그대로 읽는다.
// (그래서 한쪽 모서리만 둥근 시트·카드도 같은 규칙으로 처리된다)
// 실제 크기(w×h)에 맞는 n = 4 superellipse path 를 계산해 clip-path: path(...) 로 자른다.
// 크기가 바뀌면(ResizeObserver) 다시 계산한다.
//
// 한계: clip-path 는 요소 밖으로 나가는 그림자·포커스 테두리도 함께 자른다. 그래서 이 대체 경로에서만
// 그림자는 잘린다. 요소 자신의 테두리는 borderStroke() 가 SVG 선으로 다시 그린다. (corner-shape 지원 브라우저는 영향 없음)
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

// clip-path 는 요소의 테두리도 같이 잘라 버려서(상자 가장자리의 1px 테두리가 반쯤 지워진다) 테두리가 거의 안 보인다.
// 그래서 테두리 색은 투명으로 두고(두께는 그대로라 레이아웃 불변), 같은 스쿼클 path 를 안쪽으로 반 두께 줄여
// SVG 선으로 배경에 그린다. clip-path 안쪽에 있어 잘리지 않고 두께도 일정하다.
function borderStroke(el, w, h, radii) {
  const cs = getComputedStyle(el)
  const bw = Number.parseFloat(cs.borderTopWidth)
  const same = ['Right', 'Bottom', 'Left'].every((side) => Number.parseFloat(cs[`border${side}Width`]) === bw)
  if (!bw || !same || cs.borderTopStyle !== 'solid' || cs.borderTopColor === 'rgba(0, 0, 0, 0)') return false
  const half = bw / 2
  const inner = radii.map((r) => Math.max(0, r - half))
  const d = squirclePath(w - bw, h - bw, inner, { x: half, y: half })
  const svg =
    `<svg xmlns="http://www.w3.org/2000/svg" width="${w}" height="${h}" viewBox="0 0 ${w} ${h}">` +
    `<path d="${d}" fill="none" stroke="${cs.borderTopColor}" stroke-width="${bw}"/></svg>`
  const layer = `url("data:image/svg+xml,${encodeURIComponent(svg)}")`
  const base = cs.backgroundImage === 'none' ? '' : `, ${cs.backgroundImage}`
  el.style.setProperty('background-image', `${layer}${base}`)
  el.style.setProperty('background-origin', 'border-box')
  el.style.setProperty('background-repeat', 'no-repeat')
  el.style.setProperty('border-color', 'transparent')
  return true
}

function clearBorder(el) {
  ;['background-image', 'background-origin', 'background-repeat', 'border-color'].forEach((k) => el.style.removeProperty(k))
}

function clear(el) {
  if (!el.hasAttribute(APPLIED)) return
  clearBorder(el)
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
  clearBorder(el) // 우리가 넣은 테두리 선을 빼야 CSS 가 정한 현재 배경·테두리 색을 읽을 수 있다
  const radii = cssRadii(el, w)
  if (radii.every((v) => v === 0)) {
    clear(el)
    return
  }
  borderStroke(el, w, h, radii)
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
