import { useState } from 'react'
import { Alert, Button, Paper, Stack, Typography } from '@mui/material'
import { loginWithGoogle } from '../api/auth.js'

// 로그인 화면만 범위 (PM 지시: 로그인 기능/세션 처리는 별도 담당).
// API.md가 권한·로그인을 "오늘은 없음"으로 결정해 두어 실제 엔드포인트는 아직 없다.
// 이 화면은 독립 컴포넌트로만 두고 App.jsx에는 연결하지 않는다
// (연결하면 업로드 화면 접근을 막는 권한 기능까지 만들게 되어 범위를 벗어난다).

// API.md 오류 코드가 아직 없어 NETWORK_ERROR만 공통 코드로 쓰고, 나머지는 기본 문구로 둔다.
const ERROR_MESSAGES = {
  NETWORK_ERROR: '서버 연결 실패. 잠시 후 다시 시도해 주세요.',
}

function errorMessage(e) {
  return ERROR_MESSAGES[e.code] ?? '로그인하는 중 문제가 생겼어요. 다시 시도해 주세요.'
}

export default function LoginPage() {
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState(null)
  const [user, setUser] = useState(null)

  async function handleLogin() {
    setLoading(true)
    setError(null)
    try {
      const { user: loggedInUser } = await loginWithGoogle()
      setUser(loggedInUser)
    } catch (e) {
      setError(errorMessage(e))
    } finally {
      setLoading(false)
    }
  }

  function handleReset() {
    setError(null)
    setUser(null)
  }

  if (user) {
    return (
      <Paper sx={{ p: 4 }}>
        <Stack spacing={3}>
          <Alert severity="success">{user.email}(으)로 로그인했어요.</Alert>
          <Button variant="outlined" onClick={handleReset} sx={{ alignSelf: 'flex-start' }}>
            다시 로그인
          </Button>
        </Stack>
      </Paper>
    )
  }

  return (
    <Paper sx={{ p: 4 }}>
      <Stack spacing={3}>
        <div>
          <Typography variant="h5" sx={{ fontWeight: 700 }}>
            디딤돌에 오신 것을 환영해요
          </Typography>
          <Typography color="text.secondary">
            구글 계정으로 로그인하면 올린 서류를 이어서 확인할 수 있어요.
          </Typography>
        </div>

        {error && (
          <Alert
            severity="error"
            action={
              <Button color="inherit" size="small" disabled={loading} onClick={handleLogin}>
                다시 시도
              </Button>
            }
          >
            {error}
          </Alert>
        )}

        <Button variant="contained" size="large" disabled={loading} onClick={handleLogin}>
          {loading ? '로그인 중…' : 'Google로 로그인'}
        </Button>
      </Stack>
    </Paper>
  )
}
