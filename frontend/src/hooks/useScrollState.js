import { useEffect, useState } from 'react'

// 스크롤 상태: scrolled(맨 위에서 벗어남), hidden(아래로 내리는 중 → 헤더 숨김)
// requestAnimationFrame 으로 한 프레임에 한 번만 계산한다.
export default function useScrollState({ threshold = 16, hideAfter = 240, delta = 8 } = {}) {
  const [state, setState] = useState(() => ({ scrolled: window.scrollY > threshold, hidden: false }))

  useEffect(() => {
    let lastY = window.scrollY
    let ticking = false

    function update() {
      ticking = false
      const y = window.scrollY
      const diff = y - lastY
      setState((prev) => {
        const scrolled = y > threshold
        let hidden = prev.hidden
        if (y < hideAfter) hidden = false
        else if (diff > delta) hidden = true
        else if (diff < -delta) hidden = false
        return prev.scrolled === scrolled && prev.hidden === hidden ? prev : { scrolled, hidden }
      })
      if (Math.abs(diff) > delta) lastY = y
    }

    function onScroll() {
      if (!ticking) {
        ticking = true
        window.requestAnimationFrame(update)
      }
    }

    window.addEventListener('scroll', onScroll, { passive: true })
    return () => window.removeEventListener('scroll', onScroll)
  }, [threshold, hideAfter, delta])

  return state
}
