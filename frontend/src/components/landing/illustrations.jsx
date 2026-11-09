// 시안의 사진 자리를 대신하는 SVG 일러스트 (저작권 있는 사진·기관 로고를 쓰지 않음)
import { ds } from '../../theme.js'
import { squirclePath } from '../../utils/squircle.js'

// SVG 안의 둥근 사각형도 rx(사분원) 대신 n = 4 superellipse 모서리로 그린다
function SquircleRect({ x = 0, y = 0, w, h, r, ...rest }) {
  const nx = Number(x)
  const ny = Number(y)
  return <path d={squirclePath(Number(w), Number(h), Number(r), { x: nx, y: ny })} {...rest} />
}

/** 히어로: 떠 있는 신청서 + 칸 강조 + 모국어 설명 말풍선 */
export function HeroFormIllustration() {
  return (
    <svg viewBox="0 0 560 480" width="100%" role="img" aria-label="신청서의 칸을 찾아 모국어로 설명하는 모습">
      <defs>
        <filter id="hf-shadow" x="-20%" y="-20%" width="140%" height="140%">
          <feDropShadow dx="0" dy="18" stdDeviation="18" floodColor="#1d3b66" floodOpacity="0.16" />
        </filter>
      </defs>
      {/* 뒤 종이 */}
      <g transform="rotate(-8 300 250)" filter="url(#hf-shadow)">
        <SquircleRect x="150" y="60" w="300" h="380" r="22" fill="#F4F8FD" />
      </g>
      {/* 앞 종이 */}
      <g transform="rotate(4 300 250)" filter="url(#hf-shadow)">
        <SquircleRect x="170" y="40" w="320" h="400" r="22" fill="#fff" />
        <SquircleRect x="204" y="78" w="150" h="14" r="7" fill={ds.ink} />
        <SquircleRect x="204" y="102" w="96" h="9" r="4.5" fill={ds.line} />
        {[150, 206, 262, 318].map((y, i) => (
          <g key={y}>
            <SquircleRect x="204" y={y} w="70" h="9" r="4.5" fill={i === 1 ? ds.primary : '#C9D1DB'} />
            <SquircleRect
              x="204"
              y={y + 16}
              w="252"
              h="26"
              r="8"
              fill={i === 1 ? ds.primarySoft : ds.card}
              stroke={i === 1 ? ds.primary : 'none'}
              strokeWidth="2"
            />
          </g>
        ))}
        <SquircleRect x="204" y="384" w="110" h="30" r="15" fill={ds.primary} />
        <SquircleRect x="222" y="396" w="74" h="6" r="3" fill="#fff" />
      </g>
      {/* 설명 말풍선 */}
      <g filter="url(#hf-shadow)">
        <SquircleRect x="18" y="196" w="196" h="92" r="20" fill="#fff" />
        <path d="M214 230l22 10-22 10z" fill="#fff" />
        <SquircleRect x="34" y="212" w="28" h="28" r="14" fill={ds.primarySoft} />
        <text x="48" y="231" textAnchor="middle" fontSize="13" fontWeight="700" fill={ds.primaryDeep}>
          VI
        </text>
        <text x="70" y="223" fontSize="13" fontWeight="700" fill={ds.ink}>
          생년월일
        </text>
        <text x="70" y="240" fontSize="12" fill={ds.text2}>
          Ngày sinh
        </text>
        <SquircleRect x="36" y="254" w="62" h="20" r="10" fill={ds.primary} />
        <text x="67" y="268" textAnchor="middle" fontSize="11" fontWeight="700" fill="#fff">
          필수
        </text>
        <text x="108" y="268" fontSize="11" fill={ds.text2}>
          YYYY.MM.DD
        </text>
      </g>
      {/* 반짝이 */}
      <path d="M470 70l6 16 16 6-16 6-6 16-6-16-16-6 16-6z" fill={ds.primary} opacity=".85" />
      <path d="M120 120l4 10 10 4-10 4-4 10-4-10-10-4 10-4z" fill="#fff" />
    </svg>
  )
}

/** 메시지 섹션 세로 카드: 여러 언어 인사 + 완성된 서류 */
export function GreetingIllustration() {
  const chips = [
    { x: 30, y: 70, t: 'Xin chào' },
    { x: 150, y: 130, t: '你好' },
    { x: 40, y: 190, t: 'Hello' },
    { x: 140, y: 250, t: 'สวัสดี' },
  ]
  return (
    <svg viewBox="0 0 300 380" width="100%" height="100%" preserveAspectRatio="xMidYMid meet" role="img" aria-label="여러 나라 말로 인사하는 모습" style={{ display: 'block' }}>
      <defs>
        <linearGradient id="greet-bg" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor="#7DB6F5" />
          <stop offset="1" stopColor="#4169D6" />
        </linearGradient>
      </defs>
      <rect width="300" height="380" fill="url(#greet-bg)" />
      <circle cx="250" cy="40" r="80" fill="#fff" opacity=".15" />
      <circle cx="20" cy="360" r="110" fill="#fff" opacity=".1" />
      {chips.map((c) => (
        <g key={c.t}>
          <SquircleRect x={c.x} y={c.y} w={c.t.length * 11 + 36} h="38" r="19" fill="#fff" opacity=".95" />
          <text x={c.x + 18} y={c.y + 25} fontSize="16" fontWeight="700" fill={ds.ink}>
            {c.t}
          </text>
        </g>
      ))}
      <g transform="translate(150 300)">
        <SquircleRect x="-70" y="0" w="140" h="56" r="28" fill={ds.ink} />
        <text x="0" y="35" textAnchor="middle" fontSize="18" fontWeight="700" fill="#fff">
          안녕하세요
        </text>
      </g>
    </svg>
  )
}
