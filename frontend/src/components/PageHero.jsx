import { Box, Stack, Typography } from '@mui/material'
import { ds, radius, squircle, squircleResponsive } from '../theme.js'
import { Container } from './ui.jsx'

const STEPS = ['서류 올리기', '입력 항목 확인', '사전 정보 입력']

// 작업 화면 상단의 하늘색 띠 (랜딩 히어로를 낮게 줄인 형태) + 진행 단계 표시
export default function PageHero({ step = 0, overline, title, description, aside, children }) {
  return (
    <Container sx={{ px: { xs: 1, sm: 1.5, md: 2 }, pt: { xs: 1, md: 1.5 } }}>
      <Box sx={{ ...squircleResponsive({ xs: 24, md: radius.hero }), background: ds.sky, px: { xs: 2.5, sm: 4, md: 7 }, py: { xs: 3.5, md: 6 } }}>
        <Stepper current={step} />
        <Stack
          direction={{ xs: 'column', md: 'row' }}
          spacing={3}
          sx={{ mt: { xs: 3.5, md: 5 }, justifyContent: 'space-between', alignItems: { md: 'flex-end' } }}
        >
          <Box sx={{ maxWidth: 680, minWidth: 0 }}>
            {overline && (
              <Typography variant="overline" component="div" sx={{ color: ds.text2, mb: 1.5 }}>
                {overline}
              </Typography>
            )}
            <Typography variant="h1" component="h1" sx={{ fontSize: 'clamp(30px, 4vw, 46px)', wordBreak: 'keep-all' }}>
              {title}
            </Typography>
            {description && <Typography sx={{ color: ds.text2, mt: 1.5 }}>{description}</Typography>}
          </Box>
          {aside}
        </Stack>
        {children}
      </Box>
    </Container>
  )
}

function Stepper({ current }) {
  return (
    <Stack component="ol" direction="row" aria-label="진행 단계" sx={{ listStyle: 'none', m: 0, p: 0, alignItems: 'center', flexWrap: 'wrap', rowGap: 1 }}>
      {STEPS.map((label, i) => {
        const done = i < current
        const active = i === current
        return (
          <Stack component="li" key={label} direction="row" sx={{ alignItems: 'center' }} aria-current={active ? 'step' : undefined}>
            {i > 0 && <Box aria-hidden sx={{ width: { xs: 16, md: 40 }, height: '1.5px', bgcolor: 'rgba(17,20,24,.15)', mx: 1.25 }} />}
            <Box
              sx={{
                width: 28,
                height: 28,
                ...squircle(radius.full),
                display: 'grid',
                placeItems: 'center',
                fontSize: 12,
                fontWeight: 700,
                bgcolor: active ? ds.ink : done ? ds.primary : 'transparent',
                color: active || done ? ds.white : ds.text2,
                border: active || done ? 'none' : '1.5px solid rgba(17,20,24,.2)',
              }}
            >
              {done ? '✓' : i + 1}
            </Box>
            <Typography
              variant="body2"
              sx={{ ml: 1, fontWeight: active ? 700 : 500, color: active ? ds.ink : ds.text2, display: { xs: active ? 'block' : 'none', sm: 'block' } }}
            >
              {label}
            </Typography>
          </Stack>
        )
      })}
    </Stack>
  )
}
