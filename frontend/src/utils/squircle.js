// 스쿼클(squircle) 수학 — Wikipedia "Squircle" 의 superellipse 정의를 그대로 따른다.
//
//   |x - a|^n / ra^n + |y - b|^n / rb^n = 1        (superellipse)
//   |x - a|^4 + |y - b|^4 = r^4                    (prototypical squircle, n = 4, "Lamé's special quartic")
//
// - n = 2 이면 원(둥근 사각형의 모서리), n → ∞ 이면 정사각형. n = 4 가 대표 스쿼클이다.
// - 둥근 사각형(rounded square = 직선 + 사분원)은 스쿼클이 아니다. 직선과 원호가 만나는 곳에서 곡률이 끊긴다.
// - CSS `corner-shape: squircle` 은 `superellipse(2)` 이고, CSS superellipse(K) 의 지수는 2^K 이므로
//   n = 2^2 = 4 — 위 정의와 같은 곡선이다. (round = superellipse(1) = n 2 = 원)
//
// 화면 요소는 정사각형이 아니므로, 네 모서리를 반지름 r 인 n = 4 superellipse 의 사분면으로 그리고
// 사이를 직선으로 잇는다. r 이 짧은 변의 절반이면(정사각형이면) 전체가 정확히 x^4 + y^4 = r^4 가 된다.

export const SQUIRCLE_N = 4

/** 반지름 r 인 n 차 superellipse 사분면의 점들 (중심 기준, θ: 0 → π/2) */
function quadrant(r, n, steps) {
  const e = 2 / n
  const pts = []
  for (let i = 0; i <= steps; i += 1) {
    const t = (i / steps) * (Math.PI / 2)
    // 매개변수식: x = r·cos(t)^(2/n), y = r·sin(t)^(2/n)  →  |x/r|^n + |y/r|^n = cos² + sin² = 1
    pts.push([r * Math.cos(t) ** e, r * Math.sin(t) ** e])
  }
  return pts
}

const f = (v) => Math.round(v * 100) / 100

/**
 * 모서리별 반지름 [tl, tr, br, bl] 을 CSS border-radius 와 같은 규칙으로 맞춘다.
 * 한 변에 붙은 두 반지름의 합이 변 길이를 넘으면 네 반지름을 같은 비율로 줄인다.
 */
function fitRadii(w, h, r) {
  const [tl, tr, br, bl] = (Array.isArray(r) ? r : [r, r, r, r]).map((v) => Math.max(0, v || 0))
  const scale = Math.min(1, w / (tl + tr || 1), w / (bl + br || 1), h / (tl + bl || 1), h / (tr + br || 1))
  return [tl * scale, tr * scale, br * scale, bl * scale]
}

/**
 * w×h 상자에 맞는 스쿼클 path (SVG / CSS clip-path 용).
 * r: 숫자(네 모서리 같음) 또는 [tl, tr, br, bl]. 각 모서리는 반지름 r 인 n = 4 superellipse 사분면.
 * x, y 로 시작 위치를 옮길 수 있다(SVG 안에 그릴 때).
 */
export function squirclePath(w, h, r, { n = SQUIRCLE_N, steps = 18, x = 0, y = 0 } = {}) {
  const [tl, tr, br, bl] = fitRadii(w, h, r)
  const P = (px, py) => `${f(x + px)} ${f(y + py)}`
  // 중심 (cx, cy), 방향 (sx, sy) 인 사분면 점들. reverse 면 끝점부터
  const corner = (rr, cx, cy, sx, sy, reverse) => {
    if (rr === 0) return [P(cx, cy)]
    const q = quadrant(rr, n, steps)
    const list = reverse ? [...q].reverse() : q
    return list.map(([qx, qy]) => P(cx + sx * qx, cy + sy * qy))
  }
  // 시계 방향: 위쪽 변 → 오른쪽 위 → 오른쪽 아래 → 왼쪽 아래 → 왼쪽 위
  const pts = [
    ...corner(tr, w - tr, tr, 1, -1, true), // (w-tr, 0) → (w, tr)
    ...corner(br, w - br, h - br, 1, 1, false), // (w, h-br) → (w-br, h)
    ...corner(bl, bl, h - bl, -1, 1, true), // (bl, h) → (0, h-bl)
    ...corner(tl, tl, tl, -1, -1, false), // (0, tl) → (tl, 0)
  ]
  return `M${P(tl, 0)}L${pts.join('L')}Z`
}

/** 이 브라우저가 CSS corner-shape 로 스쿼클을 직접 그릴 수 있는지 */
export function supportsCornerShape() {
  return typeof CSS !== 'undefined' && CSS.supports?.('corner-shape', 'squircle')
}
