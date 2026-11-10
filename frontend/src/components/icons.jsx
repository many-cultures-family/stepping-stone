// 아이콘 패키지를 새로 넣지 않고(합의된 의존성 유지) 필요한 것만 SVG로 둔다.
const base = { xmlns: 'http://www.w3.org/2000/svg', viewBox: '0 0 24 24', 'aria-hidden': true, focusable: false }
const stroke = (color, w = 2) => ({ fill: 'none', stroke: color, strokeWidth: w, strokeLinecap: 'round', strokeLinejoin: 'round' })

export function CheckCircleIcon({ size = 24, color = 'currentColor' }) {
  return (
    <svg {...base} width={size} height={size}>
      <circle cx="12" cy="12" r="11" fill={color} />
      <path d="M7 12.5l3.2 3.2L17 9" {...stroke('#fff', 2.2)} />
    </svg>
  )
}

export function AlertCircleIcon({ size = 16, color = 'currentColor' }) {
  return (
    <svg {...base} width={size} height={size}>
      <circle cx="12" cy="12" r="11" fill={color} />
      <path d="M12 6.5v7" stroke="#fff" strokeWidth="2.4" strokeLinecap="round" />
      <circle cx="12" cy="17.2" r="1.4" fill="#fff" />
    </svg>
  )
}

export function ChevronIcon({ size = 20, color = 'currentColor', direction = 'right' }) {
  const rotate = { right: 0, down: 90, left: 180, up: 270 }[direction]
  return (
    <svg {...base} width={size} height={size} style={{ transform: `rotate(${rotate}deg)` }}>
      <path d="M9 5l7 7-7 7" {...stroke(color)} />
    </svg>
  )
}

export function ArrowIcon({ size = 20, color = 'currentColor', direction = 'right' }) {
  const rotate = { right: 0, down: 90, left: 180, up: 270, 'up-right': -45 }[direction]
  return (
    <svg {...base} width={size} height={size} style={{ transform: `rotate(${rotate}deg)` }}>
      <path d="M4 12h15M13 6l6 6-6 6" {...stroke(color)} />
    </svg>
  )
}

export function PlayIcon({ size = 16, color = 'currentColor' }) {
  return (
    <svg {...base} width={size} height={size}>
      <circle cx="12" cy="12" r="11" fill="none" stroke={color} strokeWidth="1.8" />
      <path d="M10 8.5v7l5.5-3.5z" fill={color} />
    </svg>
  )
}

export function StarIcon({ size = 12, color = 'currentColor' }) {
  return (
    <svg {...base} width={size} height={size}>
      <path d="M12 2.5l2.9 6 6.6.8-4.9 4.5 1.3 6.5L12 17l-5.9 3.3 1.3-6.5L2.5 9.3l6.6-.8z" fill={color} />
    </svg>
  )
}

export function SparkleIcon({ size = 14, color = 'currentColor' }) {
  return (
    <svg {...base} width={size} height={size}>
      <path d="M12 2l2.2 6.3L20.5 10.5l-6.3 2.2L12 19l-2.2-6.3L3.5 10.5l6.3-2.2z" fill={color} />
    </svg>
  )
}

export function CloseIcon({ size = 24, color = 'currentColor' }) {
  return (
    <svg {...base} width={size} height={size}>
      <path d="M6 6l12 12M18 6L6 18" {...stroke(color)} />
    </svg>
  )
}

export function DocumentIcon({ size = 24, color = 'currentColor' }) {
  return (
    <svg {...base} width={size} height={size}>
      <path d="M6 2.5h8l5 5V20a1.5 1.5 0 0 1-1.5 1.5h-11A1.5 1.5 0 0 1 5 20V4a1.5 1.5 0 0 1 1-1.5z" fill={color} />
      <path d="M14 2.5V7.5h5" fill="#fff" fillOpacity=".5" />
      <path d="M8.5 12h7M8.5 15.5h7" stroke="#fff" strokeWidth="1.6" strokeLinecap="round" />
    </svg>
  )
}

export function UploadIcon({ size = 24, color = 'currentColor' }) {
  return (
    <svg {...base} width={size} height={size}>
      <path d="M12 15V4M7 8.5L12 4l5 4.5M4.5 15v3.5a2 2 0 0 0 2 2h11a2 2 0 0 0 2-2V15" {...stroke(color)} />
    </svg>
  )
}

export function GlobeIcon({ size = 20, color = 'currentColor' }) {
  return (
    <svg {...base} width={size} height={size}>
      <circle cx="12" cy="12" r="9" {...stroke(color, 1.8)} />
      <path d="M3 12h18M12 3c2.5 2.6 3.8 5.6 3.8 9s-1.3 6.4-3.8 9c-2.5-2.6-3.8-5.6-3.8-9S9.5 5.6 12 3z" {...stroke(color, 1.8)} />
    </svg>
  )
}

export function ShieldIcon({ size = 20, color = 'currentColor' }) {
  return (
    <svg {...base} width={size} height={size}>
      <path d="M12 3l7.5 3v5.5c0 4.5-3.2 8-7.5 9.5-4.3-1.5-7.5-5-7.5-9.5V6z" {...stroke(color, 1.8)} />
      <path d="M8.8 12l2.2 2.2 4.3-4.4" {...stroke(color, 1.8)} />
    </svg>
  )
}

export function SearchDocIcon({ size = 20, color = 'currentColor' }) {
  return (
    <svg {...base} width={size} height={size}>
      <path d="M14 3H7a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h4" {...stroke(color, 1.8)} />
      <path d="M9 8h6M9 12h3" {...stroke(color, 1.8)} />
      <circle cx="16.5" cy="15.5" r="3.5" {...stroke(color, 1.8)} />
      <path d="M19 18l2.5 2.5" {...stroke(color, 1.8)} />
    </svg>
  )
}

export function PenIcon({ size = 20, color = 'currentColor' }) {
  return (
    <svg {...base} width={size} height={size}>
      <path d="M4 20l4-1 11-11-3-3L5 16z" {...stroke(color, 1.8)} />
      <path d="M14 7l3 3" {...stroke(color, 1.8)} />
    </svg>
  )
}

export function PinIcon({ size = 14, color = 'currentColor' }) {
  return (
    <svg {...base} width={size} height={size}>
      <path d="M12 21s-6.5-6-6.5-11a6.5 6.5 0 0 1 13 0c0 5-6.5 11-6.5 11z" fill={color} />
      <circle cx="12" cy="10" r="2.4" fill="#fff" />
    </svg>
  )
}

export function MenuIcon({ size = 22, color = 'currentColor' }) {
  return (
    <svg {...base} width={size} height={size}>
      <path d="M4 7h16M4 12h16M4 17h10" {...stroke(color)} />
    </svg>
  )
}
