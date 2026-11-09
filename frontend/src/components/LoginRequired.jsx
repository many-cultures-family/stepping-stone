import { Button, Paper, Stack, Typography } from '@mui/material'
import { startGoogleLogin } from '../api/auth.js'

// 로그인이 필요한 곳에서 공통으로 쓰는 안내 (LOGIN-API.md "화면 약속").
// 별도 로그인 화면/에러 화면을 두지 않고 이 블록을 그대로 재사용한다.
export default function LoginRequired() {
  return (
    <Paper sx={{ p: 4 }}>
      <Stack spacing={3}>
        <Typography color="text.secondary">로그인한 뒤 문서를 올릴 수 있어요.</Typography>
        <Button
          variant="contained"
          size="large"
          onClick={() => startGoogleLogin()}
          sx={{ alignSelf: 'flex-start' }}
        >
          Google로 로그인
        </Button>
      </Stack>
    </Paper>
  )
}
