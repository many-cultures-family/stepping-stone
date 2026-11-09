import { Box, Stack, Typography } from '@mui/material'
import { ds, radius, squircle } from '../../theme.js'
import { GlobeIcon } from '../icons.jsx'
import { Container } from '../ui.jsx'

// 시안의 'Follow' 알약 + 파트너 로고 줄 → 지원 언어 워드마크 줄
// md 미만: 알약 아래에 언어를 3열(xs) / 6열(sm) 격자로 정렬해 들쭉날쭉한 줄바꿈을 막는다
const LANGUAGES = ['한국어', 'Tiếng Việt', '中文', 'English', 'ภาษาไทย', 'Русский']

export default function LanguageStrip() {
  return (
    <Container sx={{ mt: { xs: 4, md: 6 } }}>
      <Stack direction={{ xs: 'column', md: 'row' }} spacing={{ xs: 2.5, md: 6 }} sx={{ alignItems: { xs: 'stretch', md: 'center' } }}>
        <Stack
          direction="row"
          spacing={1.25}
          sx={{
            alignItems: 'center',
            alignSelf: { xs: 'flex-start', md: 'auto' },
            px: 2.5,
            height: 52,
            ...squircle(radius.full),
            border: `1px solid ${ds.line}`,
            flexShrink: 0,
          }}
        >
          <Typography variant="body2" sx={{ color: ds.text2 }}>
            지원 언어
          </Typography>
          <Box sx={{ width: 30, height: 30, ...squircle(15), bgcolor: ds.primary, color: ds.white, display: 'grid', placeItems: 'center' }}>
            <GlobeIcon size={16} />
          </Box>
          <Typography variant="body2" sx={{ fontWeight: 700 }}>
            6개 언어
          </Typography>
        </Stack>
        <Box
          component="ul"
          aria-label="지원 언어 목록"
          sx={{
            listStyle: 'none',
            m: 0,
            p: 0,
            flexGrow: 1,
            minWidth: 0,
            display: 'grid',
            gridTemplateColumns: { xs: 'repeat(3, minmax(0, 1fr))', sm: 'repeat(6, auto)' },
            justifyContent: { sm: 'space-between' },
            gap: { xs: '10px 12px', sm: 2 },
          }}
        >
          {LANGUAGES.map((l) => (
            <Box
              component="li"
              key={l}
              sx={{
                fontSize: { xs: 16, sm: 18, lg: 22 },
                fontWeight: 700,
                color: '#A7AFBA',
                letterSpacing: '-0.01em',
                whiteSpace: 'nowrap',
                overflow: 'hidden',
                textOverflow: 'ellipsis',
              }}
            >
              {l}
            </Box>
          ))}
        </Box>
      </Stack>
    </Container>
  )
}
