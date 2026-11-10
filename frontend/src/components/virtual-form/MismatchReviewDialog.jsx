import { Box, Button, Dialog, DialogActions, DialogContent, DialogContentText, DialogTitle, Stack, Typography } from '@mui/material'
import { ds, radius, squircle } from '../../theme.js'
import DiffLine from './DiffLine.jsx'

// '연습 마치기' 때 아직 확인하지 않은 불일치를 한 번에 정리하는 모달
export default function MismatchReviewDialog({ open, items, busy, onClose, onUseSaved, onKeep, onFinish }) {
  const done = items.length === 0
  return (
    <Dialog open={open} onClose={onClose} fullWidth maxWidth="sm" aria-labelledby="mismatch-review-title">
      <DialogTitle id="mismatch-review-title">{done ? '모두 확인했어요' : `저장된 정보와 다른 칸이 ${items.length}개 있어요`}</DialogTitle>
      <DialogContent>
        <DialogContentText sx={{ mb: 2 }}>
          {done ? '이제 연습을 마칠 수 있어요.' : '바꾸거나, 일부러 다르게 쓴 거라면 그대로 둘 수 있어요.'} 연습 화면이라 어디에도 제출되지 않아요.
        </DialogContentText>
        <Stack spacing={1.5}>
          {items.map((a) => (
            <Box key={a.field_id} sx={{ bgcolor: ds.card, ...squircle(radius.tile), p: 2 }}>
              <Typography variant="h4" component="p" sx={{ mb: 1 }}>
                {a.label}
              </Typography>
              <Typography variant="caption" sx={{ color: ds.text2 }}>
                저장된 정보
              </Typography>
              <DiffLine prior={a.mismatch.prior_value} current={a.value ?? ''} mode="prior" />
              <Typography variant="caption" sx={{ color: ds.text2 }}>
                지금 쓴 값
              </Typography>
              <DiffLine prior={a.mismatch.prior_value} current={a.value ?? ''} mode="current" />
              <Stack direction={{ xs: 'column', sm: 'row' }} spacing={1} sx={{ mt: 1.5 }}>
                <Button variant="contained" size="small" disabled={busy} onClick={() => onUseSaved(a)}>
                  저장된 정보로 바꾸기
                </Button>
                <Button variant="outlined" size="small" disabled={busy} onClick={() => onKeep(a)}>
                  그대로 둘게요
                </Button>
              </Stack>
            </Box>
          ))}
        </Stack>
      </DialogContent>
      <DialogActions sx={{ px: 3, pb: 2 }}>
        <Button onClick={onClose}>돌아가기</Button>
        <Button variant="contained" color="secondary" disabled={!done || busy} onClick={onFinish}>
          연습 마치기
        </Button>
      </DialogActions>
    </Dialog>
  )
}
