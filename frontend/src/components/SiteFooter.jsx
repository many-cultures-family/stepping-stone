import { Box, Stack, Typography } from '@mui/material'
import { ds } from '../theme.js'
import { Logo } from './SiteHeader.jsx'
import { Container } from './ui.jsx'

export default function SiteFooter() {
  return (
    <Box component="footer" sx={{ borderTop: `1px solid ${ds.line}`, mt: { xs: 9, md: 15 } }}>
      <Container>
        <Stack
          direction={{ xs: 'column', md: 'row' }}
          spacing={3}
          sx={{ py: 5, justifyContent: 'space-between', alignItems: { md: 'center' } }}
        >
          <Stack spacing={1}>
            <Logo />
            <Typography variant="body2" sx={{ color: ds.text2 }}>
              결혼이민자를 위한 한국 행정 서류 작성 도우미
            </Typography>
          </Stack>
          <Stack spacing={0.5} sx={{ textAlign: { md: 'right' } }}>
            <Typography variant="body2" sx={{ color: ds.text2 }}>
              디딤돌은 실제 기관에 서류를 제출하지 않아요. 제출은 공식 사이트에서 직접 해 주세요.
            </Typography>
            <Typography variant="caption" sx={{ color: ds.muted }}>
              © 2026 Team IDPD · 디딤돌
            </Typography>
          </Stack>
        </Stack>
      </Container>
    </Box>
  )
}
