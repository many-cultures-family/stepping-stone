import { useEffect, useState } from 'react'

// 화면 가운데 띠에 걸친 섹션 id 를 돌려준다 (스크롤스파이). ids 가 없는 페이지에서는 null.
export default function useActiveSection(ids, enabled = true) {
  const [active, setActive] = useState(null)
  const key = ids.join(',')

  useEffect(() => {
    if (!enabled) return undefined
    const elements = key
      .split(',')
      .map((id) => document.getElementById(id))
      .filter(Boolean)
    if (!elements.length) return undefined

    const visible = new Map()
    const observer = new IntersectionObserver(
      (entries) => {
        for (const e of entries) visible.set(e.target.id, e.isIntersecting)
        const first = elements.find((el) => visible.get(el.id))
        setActive(first ? first.id : null)
      },
      // 화면 위 35% ~ 아래 45% 를 뺀 가운데 띠
      { rootMargin: '-35% 0px -45% 0px' },
    )
    elements.forEach((el) => observer.observe(el))
    return () => observer.disconnect()
  }, [key, enabled])

  return enabled ? active : null
}
