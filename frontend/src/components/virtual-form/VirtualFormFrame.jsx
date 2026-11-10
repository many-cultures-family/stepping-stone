import { Box, Stack, Typography } from '@mui/material'
import { ds, radius, squircle } from '../../theme.js'

// '실제 웹 신청 화면'처럼 보이는 틀. 바깥은 앱 디자인, 안쪽 폼(children)은 서식 느낌.
// R4: 실제 기관에는 아무것도 보내지 않는다 → 노란 띠로 항상 '연습 화면'임을 알린다. 기관명·로고는 쓰지 않는다.
export default function VirtualFormFrame({ children }) {
  return (
    <Box sx={{ ...squircle(radius.hero), bgcolor: ds.card, overflow: 'hidden', boxShadow: `0 0 0 1px ${ds.line}` }}>
      {/* 브라우저 창 모양 상단 바 */}
      <Stack direction="row" spacing={1.5} aria-hidden sx={{ alignItems: 'center', px: 2.5, py: 1.5, bgcolor: ds.cardHover }}>
        <Stack direction="row" spacing={0.75}>
          {[0, 1, 2].map((i) => (
            <Box key={i} sx={{ width: 10, height: 10, borderRadius: '50%', bgcolor: ds.lineStrong }} />
          ))}
        </Stack>
        <Box sx={{ flexGrow: 1, ...squircle(radius.full), bgcolor: ds.white, px: 2, py: 0.5, fontSize: 13, color: ds.muted }}>연습용 화면</Box>
      </Stack>

      {/* R4 고정 안내 띠 */}
      <Box role="note" sx={{ bgcolor: ds.orangeSoft, color: ds.orange, px: { xs: 2, md: 3 }, py: 1.25, borderBottom: `1px solid ${ds.orange}` }}>
        <Typography sx={{ fontSize: 14, fontWeight: 700 }}>연습 화면이에요 · 여기 쓴 내용은 어디에도 제출되지 않아요</Typography>
      </Box>

      <Box sx={{ bgcolor: ds.white, p: { xs: 2, md: 4 } }}>
        <Typography variant="h3" component="h2" sx={{ textAlign: 'center', pb: 2, mb: 2.5, borderBottom: `2px solid ${ds.ink}` }}>
          외국인 등록 신청 (연습)
        </Typography>
        <Box sx={{ borderTop: `1px solid ${ds.lineStrong}` }}>{children}</Box>
      </Box>
    </Box>
  )
}
