import { Box, Button, Popover, Stack, Typography } from '@mui/material'
import { ds, radius, squircle } from '../../theme.js'
import DiffLine from './DiffLine.jsx'

// 불일치 칸의 경고 아이콘을 누르면 열리는 작은 창: 글자 차이 + 두 가지 선택
// R3 예외: 이사 전 주소처럼 일부러 다르게 쓴 경우는 '그대로 둘게요'로 확인만 남긴다.
export default function MismatchPopover({ anchorEl, answer, busy, onClose, onUseSaved, onKeep }) {
  const open = Boolean(anchorEl && answer)
  const m = answer?.mismatch
  return (
    <Popover
      open={open}
      anchorEl={anchorEl}
      onClose={onClose}
      anchorOrigin={{ vertical: 'bottom', horizontal: 'right' }}
      transformOrigin={{ vertical: 'top', horizontal: 'right' }}
      slotProps={{ paper: { sx: { width: 340, maxWidth: 'calc(100vw - 32px)', p: 2.5 } } }}
    >
      {answer && m?.has_prior_info && (
        <Stack spacing={1.5}>
          <Typography variant="h4" component="p">
            저장된 정보와 달라요
          </Typography>
          <Typography variant="body2" sx={{ color: ds.text2 }}>
            {answer.label}
          </Typography>
          <Box sx={{ bgcolor: ds.card, ...squircle(radius.inner), px: 1.75, py: 1.25 }}>
            <Typography variant="caption" sx={{ color: ds.text2 }}>
              저장된 정보
            </Typography>
            <DiffLine prior={m.prior_value} current={answer.value ?? ''} mode="prior" />
          </Box>
          <Box sx={{ bgcolor: ds.card, ...squircle(radius.inner), px: 1.75, py: 1.25 }}>
            <Typography variant="caption" sx={{ color: ds.text2 }}>
              지금 쓴 값
            </Typography>
            <DiffLine prior={m.prior_value} current={answer.value ?? ''} mode="current" />
          </Box>
          <Typography variant="caption" sx={{ color: ds.text2 }}>
            이사 전 주소처럼 일부러 다르게 쓴 거라면 그대로 두세요.
          </Typography>
          <Stack direction="row" spacing={1}>
            <Button variant="contained" size="small" disabled={busy} onClick={() => onUseSaved(answer)} sx={{ flex: 1 }}>
              저장된 정보로 바꾸기
            </Button>
            <Button variant="outlined" size="small" disabled={busy} onClick={() => onKeep(answer)} sx={{ flex: 1 }}>
              그대로 둘게요
            </Button>
          </Stack>
        </Stack>
      )}
    </Popover>
  )
}
