import { useEffect, useState } from 'react'
import { Alert } from '@mui/material'
import Layout from './components/Layout.jsx'
import UploadPage from './pages/UploadPage.jsx'
import LoginRequired from './components/LoginRequired.jsx'
import { AuthProvider } from './auth/AuthContext.jsx'
import { useAuth } from './auth/useAuth.js'

// LOGIN-API.md 항목 2 실패 응답: /?login_error=<코드>로 돌아온다.
const LOGIN_ERROR_MESSAGES = {
  GOOGLE_LOGIN_CANCELED: '로그인을 취소했어요.',
  GOOGLE_EMAIL_NOT_VERIFIED: '이메일 인증이 안 된 구글 계정이에요.',
  GOOGLE_LOGIN_FAILED: '로그인 중 문제가 생겼어요. 다시 시도해 주세요.',
}

function AppContent() {
  const { status } = useAuth()
  // 쿼리의 login_error를 초기값으로만 읽는다(처음 렌더에서 한 번). 쿼리 자체를 지우는 건
  // React 상태와 무관한 브라우저 URL 조작이라 아래 effect에서 따로 한다.
  const [loginError, setLoginError] = useState(() => {
    const code = new URLSearchParams(window.location.search).get('login_error')
    return code ? (LOGIN_ERROR_MESSAGES[code] ?? LOGIN_ERROR_MESSAGES.GOOGLE_LOGIN_FAILED) : null
  })

  useEffect(() => {
    const params = new URLSearchParams(window.location.search)
    if (!params.has('login_error')) return
    params.delete('login_error')
    const query = params.toString()
    window.history.replaceState({}, '', window.location.pathname + (query ? `?${query}` : ''))
  }, [])

  return (
    <Layout>
      {loginError && (
        <Alert severity="error" onClose={() => setLoginError(null)} sx={{ mb: 3 }}>
          {loginError}
        </Alert>
      )}
      {/* US-01 #1(서류 올리기)만 만드는 동안은 업로드 화면만 보여준다.
          입력 항목 확인(ResultPage, US-02 이후 범위)은 아직 연결하지 않는다. */}
      {status === 'authenticated' && <UploadPage />}
      {status === 'anonymous' && <LoginRequired />}
    </Layout>
  )
}

export default function App() {
  return (
    <AuthProvider>
      <AppContent />
    </AuthProvider>
  )
}
