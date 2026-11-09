import { Box, Stack, Typography } from '@mui/material'
import { ds, layout, radius, squircle } from '../../theme.js'
import { ArrowIcon, PenIcon, SearchDocIcon, UploadIcon } from '../icons.jsx'
import { Container, Link, SquircleTile } from '../ui.jsx'
import LangBadges from './LangBadges.jsx'

// 시안 'Journey To The Skies Made Simple' → 3단계 이용 방법
// 양옆 회색 카드 + 가운데 위로 솟은 파란 강조 카드 (가장 중요한 'AI가 칸 찾기' 단계)
const STEPS = [
  { icon: UploadIcon, title: '서류 올리기', body: '받은 신청서를 사진이나 PDF로 올려요.' },
  {
    icon: SearchDocIcon,
    title: 'AI가 칸을 찾고\n모국어로 설명',
    body: '써야 할 칸, 필수 여부, 쓰는 형식을 찾아 내 나라 말로 알려 드려요. 틀리면 바로 고칠 수 있어요.',
    featured: true,
  },
  { icon: PenIcon, title: '확인하고\n바로 작성하기', body: '확인한 칸에 맞춰 연습해 보고, 공식 사이트에서 직접 제출해요.' },
]

export default function StepsSection() {
  return (
    <Container sx={{ mt: layout.section }}>
      <Box id="how" sx={{ textAlign: 'center', maxWidth: 560, mx: 'auto', mb: { xs: 5, md: 8 } }}>
        <Typography variant="h2" component="h2">
          3단계면 서류 준비가 끝나요
        </Typography>
        <Typography variant="body2" sx={{ color: ds.text2, mt: 1.5 }}>
          가족에게 하나하나 묻지 않아도 돼요. 올리고, 확인하고, 쓰면 끝이에요.
        </Typography>
      </Box>

      {/* 회색 띠는 별도 배경 층으로 둔다. 띠(ol) 자체를 스쿼클로 자르면(clip-path)
          위로 솟은 가운데 카드까지 띠 경계에서 잘리기 때문 */}
      {/* 제목 아래 여백(64px)과 이 여백은 겹쳐(collapse) 큰 쪽만 남는다. 가운데 카드가 80px 솟으므로 136px 로 둬 56px 간격 확보 */}
      <Box sx={{ position: 'relative', mt: { lg: 17 } }}>
        <Box
          aria-hidden
          sx={{ display: { xs: 'none', lg: 'block' }, position: 'absolute', inset: 0, bgcolor: ds.card, ...squircle(radius.card) }}
        />
        <Box
          component="ol"
          sx={{
            position: 'relative',
            listStyle: 'none',
            m: 0,
            p: 0,
            display: 'grid',
            gridTemplateColumns: { xs: '1fr', md: 'repeat(3, minmax(0, 1fr))' },
            alignItems: { md: 'stretch', lg: 'end' },
            gap: { xs: 1.5, md: 2, lg: 0 },
          }}
        >
          {STEPS.map((s, i) => (
            <StepCard key={s.title} step={s} index={i} />
          ))}
        </Box>
      </Box>
    </Container>
  )
}

// md 미만: 아이콘 왼쪽·글 오른쪽 가로형 카드 / md 이상: 세로형 카드
function StepCard({ step, index }) {
  const Icon = step.icon
  const f = step.featured
  return (
    <Box
      component="li"
      sx={{
        position: 'relative',
        overflow: 'hidden',
        minWidth: 0,
        zIndex: 1,
        ...squircle(radius.card),
        bgcolor: f ? ds.primary : { xs: ds.card, lg: 'transparent' },
        color: f ? ds.white : ds.ink,
        px: { xs: 2.5, sm: 3.5, lg: 5 },
        py: { xs: 3, md: 4, lg: 5 },
        minHeight: { lg: f ? 340 : 260 },
        mt: { lg: f ? -10 : 0 },
        display: 'flex',
        flexDirection: { xs: 'row', md: 'column' },
        alignItems: { xs: 'flex-start', md: 'stretch' },
        gap: { xs: 2, md: 0 },
      }}
    >
      {f && (
        <Box
          aria-hidden
          sx={{
            position: 'absolute',
            right: { xs: -70, md: -50 },
            top: { xs: -70, md: -50 },
            width: 170,
            height: 170,
            borderRadius: '50%',
            background: `radial-gradient(circle at 40% 40%, #8FC2FF 0%, #5A9EF9 60%, ${ds.brandTo} 100%)`,
            opacity: { xs: 0.6, md: 1 },
          }}
        />
      )}
      <SquircleTile size={52} bg={f ? 'rgba(255,255,255,.18)' : ds.white} color={f ? ds.white : ds.primary} sx={{ zIndex: 1 }}>
        <Icon size={22} />
      </SquircleTile>
      <Box sx={{ display: { xs: 'none', md: 'block' }, flexGrow: 1 }} />
      <Box sx={{ position: 'relative', minWidth: 0 }}>
        <Typography sx={{ fontSize: 12, fontWeight: 600, opacity: f ? 0.85 : 1, color: f ? 'inherit' : ds.muted, mt: { md: 4 } }}>
          STEP {index + 1}
        </Typography>
        <Typography variant="h3" component="h3" sx={{ whiteSpace: { xs: 'normal', md: 'pre-line' }, mt: 0.5, fontSize: { xs: 18, md: 20 } }}>
          {step.title}
        </Typography>
        <Typography variant="body2" sx={{ mt: { xs: 1, md: 1.5 }, color: f ? 'rgba(255,255,255,.9)' : ds.text2 }}>
          {step.body}
        </Typography>
        {f && (
          // 히어로의 '내 나라 말로 설명' 카드와 같은 배지로 이어지게
          <Stack direction="row" spacing={1.5} sx={{ alignItems: 'center', mt: { xs: 2, md: 2.5 } }}>
            <LangBadges size={34} border={ds.primary} />
            <Typography variant="caption" sx={{ color: 'rgba(255,255,255,.9)' }}>
              베트남어·중국어·영어 등
            </Typography>
          </Stack>
        )}
        {f && (
          <Link
            to="/upload"
            sx={{ mt: { xs: 2, md: 3 }, display: 'inline-flex', alignItems: 'center', gap: 1, fontSize: 13, fontWeight: 700, letterSpacing: '.04em' }}
          >
            지금 해 보기 <ArrowIcon size={16} />
          </Link>
        )}
      </Box>
    </Box>
  )
}
