import { useState } from 'react'
import { Alert, Button, Paper, Stack, Typography } from '@mui/material'
import { ds, radius, squircle } from '../theme.js'
import { startGoogleLogin } from '../api/auth.js'
import { loginErrorText } from '../auth/loginErrors.js'

// 로그인이 필요한 곳에서 공통으로 쓰는 안내 (LOGIN-API.md "화면 약속").
// 별도 로그인 화면/에러 화면을 두지 않고 이 블록을 그대로 재사용한다.
// message: 화면마다 이유가 다르므로 받는다. 로그인 시작이 실패하면 블록 안에 오류 문구를 보여 준다.
export default function LoginRequired({ message = '로그인이 필요해요.' }) {
  const [error, setError] = useState(null)

  async function handleLogin() {
    setError(null)
    try {
      await startGoogleLogin()
    } catch (e) {
      setError(loginErrorText(e))
    }
  }

  return (
    <Paper sx={{ p: { xs: 3, md: 4 }, bgcolor: ds.card, ...squircle(radius.card) }}>
      <Stack spacing={3}>
        <Typography color="text.secondary">{message}</Typography>
        {error && <Alert severity="error">{error}</Alert>}
        <Button variant="contained" size="large" onClick={handleLogin} sx={{ alignSelf: 'flex-start' }}>
          Google로 로그인
        </Button>
      </Stack>
    </Paper>
  )
}
