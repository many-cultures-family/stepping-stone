import { Box, Stack, Typography } from '@mui/material'
import { ds, fontDisplay, layout, radius, squircle } from '../../theme.js'
import { ArrowIcon, ShieldIcon } from '../icons.jsx'
import { Container, Link } from '../ui.jsx'
import { GreetingIllustration } from './illustrations.jsx'

// 시안 'UNLEASH WANDERLUST WITH SKYWINGS' → 큰 메시지 + 세로 이미지 카드 + 하단 혜택 카드·넓은 CTA
export default function MessageSection() {
  return (
    <Container sx={{ mt: layout.section }}>
      <Box
        id="safety"
        sx={{
          display: 'grid',
          gridTemplateColumns: { xs: '1fr', md: '300px minmax(0, 1fr)', lg: '340px minmax(0, 1fr)' },
          gridTemplateRows: { md: '1fr auto' },
          gap: 3,
          scrollMarginTop: 96,
        }}
      >
        <Box sx={{ ...squircle(radius.card), overflow: 'hidden', aspectRatio: { xs: '16 / 10', sm: '2 / 1', md: 'auto' }, minHeight: { md: 400 }, background: 'linear-gradient(180deg, #7DB6F5, #4169D6)' }}>
          <GreetingIllustration />
        </Box>

        <Stack sx={{ justifyContent: 'center', pl: { md: 2, lg: 3 }, minWidth: 0 }}>
          <Typography
            component="h2"
            sx={{
              fontFamily: fontDisplay,
              fontSize: 'clamp(30px, 5.2vw, 64px)',
              fontWeight: 700,
              lineHeight: 1.12,
              letterSpacing: '-0.03em',
              wordBreak: 'keep-all',
            }}
          >
            어려운 문서 작성,
            <br />
            <Box component="span" sx={{ color: ds.primary }}>
              디딤돌
            </Box>
            과 함께라면 간단해요
          </Typography>
          <Box
            sx={{
              display: 'grid',
              gridTemplateColumns: { xs: '1fr', sm: '1fr 1fr' },
              gap: 3,
              mt: 4,
              maxWidth: 640,
            }}
          >
            <Typography variant="body2" sx={{ color: ds.text2 }}>
              칸 이름이 어려운 말이어도 괜찮아요. 무엇을 쓰는 칸인지, 꼭 써야 하는지, 어떤 모양으로 쓰는지 하나씩 알려 드려요.
            </Typography>
            <Typography variant="body2" sx={{ color: ds.text2 }}>
              AI가 찾은 결과는 내가 확인해야만 확정돼요. 마지막 결정은 언제나 내가 해요.
            </Typography>
          </Box>
        </Stack>

        <Stack
          direction="row"
          spacing={2}
          sx={{ alignItems: 'center', bgcolor: ds.card, ...squircle(radius.card), px: 3.5, py: 3 }}
        >
          <Box sx={{ color: ds.primary, display: 'grid', placeItems: 'center' }}>
            <ShieldIcon size={34} />
          </Box>
          <Box>
            <Typography sx={{ fontSize: 26, fontWeight: 800, color: ds.primary, lineHeight: 1.2, fontFamily: fontDisplay }}>
              개인정보 보호
            </Typography>
            <Typography variant="caption" sx={{ color: ds.text2 }}>
              개인정보는 가린 뒤에만 AI에 보내는 것을 원칙으로 해요
            </Typography>
          </Box>
        </Stack>

        <Box
          component={Link}
          to="/upload"
          sx={{
            ...squircle(radius.card),
            background: ds.sky,
            minHeight: 96,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            gap: 1.5,
            fontSize: { xs: 20, md: 24 },
            fontWeight: 600,
            color: ds.ink,
            transition: 'filter .15s ease',
            '&:hover': { filter: 'brightness(0.97)' },
            '&:focus-visible': { outline: `3px solid ${ds.primaryLine}`, outlineOffset: 2 },
          }}
        >
          서류 올리러 가기 <ArrowIcon size={24} />
        </Box>
      </Box>
    </Container>
  )
}
