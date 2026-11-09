import { Stack, Typography } from '@mui/material'
import { ds } from '../../theme.js'
import { SquircleTile } from '../ui.jsx'

// 히어로 카드와 3단계 섹션(STEP 2)이 함께 쓰는 '내 나라 말' 언어 배지 (겹친 스쿼클 타일)
const BADGES = [
  { code: 'VI', bg: '#FFE3E3', fg: '#C2333A' },
  { code: '中', bg: '#FFF1D6', fg: '#B5650B' },
  { code: 'EN', bg: '#E1EEFF', fg: '#1A5FD0' },
]

export default function LangBadges({ size = 42, border = ds.white }) {
  return (
    <Stack direction="row" aria-label="베트남어, 중국어, 영어" role="img">
      {BADGES.map((b, i) => (
        <SquircleTile key={b.code} size={size} bg={b.bg} color={b.fg} border={border} sx={{ ml: i ? -1 : 0 }}>
          <Typography component="span" aria-hidden sx={{ fontSize: Math.round(size * 0.31), fontWeight: 800 }}>
            {b.code}
          </Typography>
        </SquircleTile>
      ))}
    </Stack>
  )
}
