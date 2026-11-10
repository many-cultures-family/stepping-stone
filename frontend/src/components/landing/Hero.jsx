import { Box, Button, Stack, Typography } from '@mui/material'
import { ds, radius, squircle, squircleResponsive } from '../../theme.js'
import { ArrowIcon, PlayIcon } from '../icons.jsx'
import { Container, Link, RoundButton } from '../ui.jsx'
import { HeroFormIllustration } from './illustrations.jsx'
import LangBadges from './LangBadges.jsx'

// 시안 히어로: 하늘 그라데이션 큰 스쿼클 카드 + 왼쪽 세로 번호 스텝퍼 + 큰 제목 + 파란 알약 + 원형 재생 버튼
// - lg 이상: 오른쪽 아래 'Know More' 카드가 바탕을 파고드는 오목한 모서리로 붙는다
// - lg 미만: 카드는 히어로 안 아래쪽에 일반 카드로 들어간다 (겹침·잘림 방지)
export default function Hero() {
  return (
    <Container sx={{ px: { xs: 1, sm: 1.5, md: 2 } }}>
      <Box
        id="about"
        sx={{
          position: 'relative',
          overflow: 'hidden',
          ...squircleResponsive({ xs: 24, md: radius.hero }),
          background: ds.sky,
          minHeight: { lg: 580 },
          display: 'grid',
          gridTemplateColumns: { xs: '1fr', sm: 'minmax(0, 1.1fr) minmax(0, 1fr)' },
          alignItems: 'center',
          columnGap: { sm: 2, md: 4 },
          px: { xs: 2.5, sm: 4, md: 6, lg: 8 },
          pt: { xs: 4.5, sm: 6, lg: 0 },
          pb: { xs: 2.5, sm: 4, lg: 0 },
        }}
      >
        <Stack direction="row" spacing={{ xs: 0, lg: 5 }} sx={{ alignItems: 'center', py: { lg: 10 }, minWidth: 0, position: 'relative', zIndex: 1 }}>
          <Stepper />
          <Box sx={{ minWidth: 0 }}>
            <Typography variant="overline" component="p" sx={{ color: ds.text2, mb: { xs: 1.5, md: 2 } }}>
              다문화 가족을 위한 서류 도우미
            </Typography>
            <Typography variant="h1" component="h1" sx={{ fontSize: 'clamp(32px, 5.2vw, 60px)', wordBreak: 'keep-all' }}>
              어려운 한국 서류,
              <br />
              모국어로 쉽게
            </Typography>
            <Typography sx={{ color: ds.text2, mt: { xs: 2, md: 2.5 }, maxWidth: 420, fontSize: { xs: 15, md: 16 } }}>
              신청서를 올리면 AI가 써야 할 칸을 찾고, 칸마다 무엇을 어떻게 쓰는지 내 나라 말로 알려 드려요.
            </Typography>
            <Stack direction="row" spacing={1.5} sx={{ mt: { xs: 3, md: 4 }, alignItems: 'center' }}>
              <Button component={Link} to="/upload" variant="contained" size="large" endIcon={<ArrowIcon size={18} />}>
                지금 시작하기
              </Button>
              <RoundButton
                variant="white"
                size={54}
                label="이용 방법 보기"
                onClick={() => document.getElementById('how')?.scrollIntoView({ behavior: 'smooth' })}
              >
                <PlayIcon size={22} />
              </RoundButton>
            </Stack>
          </Box>
        </Stack>

        <Box sx={{ position: 'relative', minWidth: 0, display: 'flex', alignItems: 'center', justifyContent: 'center', mt: { xs: 3, sm: 0 } }}>
          <Box sx={{ width: '100%', maxWidth: { xs: 340, sm: 420, md: 560 }, transform: { lg: 'translateY(-28px)' } }}>
            <HeroFormIllustration />
          </Box>
        </Box>

        <KnowMoreCard />
      </Box>
    </Container>
  )
}

function Stepper() {
  return (
    <Stack aria-hidden sx={{ display: { xs: 'none', lg: 'flex' }, alignItems: 'center', alignSelf: 'stretch', justifyContent: 'center' }}>
      {[1, 2, 3].map((n, i) => (
        <Stack key={n} sx={{ alignItems: 'center' }}>
          {i > 0 && <Box sx={{ width: '1.5px', height: 64, bgcolor: 'rgba(255,255,255,.9)' }} />}
          <Box
            sx={{
              width: 30,
              height: 30,
              ...squircle(radius.full),
              display: 'grid',
              placeItems: 'center',
              fontSize: 12,
              fontWeight: 600,
              bgcolor: i === 0 ? ds.white : 'transparent',
              color: i === 0 ? ds.ink : ds.white,
              border: i === 0 ? 'none' : '1.5px solid rgba(255,255,255,.95)',
              boxShadow: i === 0 ? ds.floatShadow : 'none',
            }}
          >
            {n}
          </Box>
        </Stack>
      ))}
    </Stack>
  )
}

function KnowMoreCard() {
  return (
    <Box
      sx={{
        // lg 미만: 히어로 안 아래쪽 일반 카드 / lg 이상: 오른쪽 아래에 붙는 카드
        // absolute 일 때 grid-column 이 있으면 기준이 그리드 영역(패딩 안쪽)이 되므로 lg 이상은 auto
        gridColumn: { xs: '1 / -1', lg: 'auto' },
        mt: { xs: 3, sm: 4, lg: 0 },
        position: { lg: 'absolute' },
        right: { lg: 0 },
        bottom: { lg: 0 },
        width: { lg: 340 },
        bgcolor: ds.white,
        ...squircle(radius.card),
        // lg 이상: 왼쪽 위 모서리만 둥글다 → 네 모서리를 자르는 JS 대체는 끄고(--squircle-r 0) CSS 로만 그린다
        borderRadius: { xs: `${radius.card}px`, lg: `${radius.hero}px 0 0 0` },
        '--squircle-r': { xs: `${radius.card}px`, lg: '0px' },
        pt: 2.5,
        pl: 3,
        pr: { xs: 2.5, lg: 3.5 },
        pb: { xs: 2.5, lg: 2.5 },
        // lg 이상: 카드 모서리가 바탕에 녹아드는 오목한 모서리
        '&::before, &::after': {
          content: { xs: 'none', lg: '""' },
          position: 'absolute',
          width: 32,
          height: 32,
          background: `radial-gradient(circle at 0 0, transparent 31px, ${ds.white} 32px)`,
        },
        '&::before': { top: -32, right: 0 },
        '&::after': { bottom: 0, left: -32 },
      }}
    >
      {/* 아래 '3단계면 서류 준비가 끝나요' 섹션(#how)으로 이어지는 카드 */}
      <Link to="#how" sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', mb: 1.5 }}>
        <Typography sx={{ fontSize: 17, fontWeight: 700 }}>3단계 이용 방법 보기</Typography>
        <ArrowIcon size={20} />
      </Link>
      <Stack direction="row" spacing={2} sx={{ alignItems: 'center' }}>
        <LangBadges />
        <Box sx={{ minWidth: 0 }}>
          <Typography sx={{ fontSize: 13, fontWeight: 700 }}>내 나라 말로 설명</Typography>
          <Typography sx={{ fontSize: 12, color: ds.text2, lineHeight: 1.45 }}>
            2단계에서 베트남어·중국어·영어 등 내 나라 말로 칸을 풀어 드려요
          </Typography>
        </Box>
      </Stack>
    </Box>
  )
}
