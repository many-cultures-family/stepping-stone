import { useEffect, useState } from 'react'
import { Alert } from '@mui/material'
import { AuthProvider } from './auth/AuthContext.jsx'
import { useAuth } from './auth/useAuth.js'
import Layout from './components/Layout.jsx'
import LoginRequired from './components/LoginRequired.jsx'
import { Container } from './components/ui.jsx'
import { PRIOR_INFO_KEYS } from './i18n/priorInfo.js'
import FieldCheckPage from './pages/FieldCheckPage.jsx'
import LandingPage from './pages/LandingPage.jsx'
import PriorInfoPage from './pages/PriorInfoPage.jsx'
import UploadPage from './pages/UploadPage.jsx'
import { getPendingFile, matchRoute, navigate, usePath } from './router.js'

// LOGIN-API.md 항목 2 실패 응답: /?login_error=<코드>로 돌아온다.
const LOGIN_ERROR_MESSAGES = {
  GOOGLE_LOGIN_CANCELED: '로그인을 취소했어요.',
  GOOGLE_EMAIL_NOT_VERIFIED: '이메일 인증이 안 된 구글 계정이에요.',
  GOOGLE_LOGIN_FAILED: '로그인 중 문제가 생겼어요. 다시 시도해 주세요.',
}

// /  랜딩 · /upload  서류 올리기(US-01) · /drafts/:id/fields  입력 항목 확인(F-02, US-02·US-03)
// /drafts/:id/prior-info  사전 정보 입력 · /prior-info  내 사전 정보 관리 (F-03, US-04)
function AppContent() {
  const route = matchRoute(usePath())
  const { status, user } = useAuth()
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
        <Container sx={{ pt: 2 }}>
          <Alert severity="error" onClose={() => setLoginError(null)}>
            {loginError}
          </Alert>
        </Container>
      )}
      {route.name === 'landing' && <LandingPage />}
      {/* 업로드는 로그인이 필요하다. 별도 로그인 화면 없이 LoginRequired 블록을 재사용한다. */}
      {route.name === 'upload' && status === 'authenticated' && <UploadPage />}
      {route.name === 'upload' && status === 'anonymous' && (
        <Container sx={{ py: 6 }}>
          <LoginRequired />
        </Container>
      )}
      {route.name === 'fields' && (
        <FieldCheckPage
          key={route.params.draftId}
          draftId={route.params.draftId}
          file={getPendingFile(route.params.draftId)}
          onDone={() => navigate('/')}
          onReupload={() => navigate('/upload')}
        />
      )}
      {/* F-03 API 명세가 아직 없어 저장된 사전 정보·저장 동작을 연결하지 않았다.
          명세가 나오면 여기서 savedInfo·status·serverErrors·onSave·onStartWriting 을 넘기고,
          작성 건 모드의 requiredKeys 는 이 작성 건 fields 의 prior_info_key 목록으로 바꾼다. */}
      {route.name === 'prior-info' && status === 'authenticated' && (
        <PriorInfoPage
          key={route.params.draftId ?? 'manage'}
          language={user?.language}
          requiredKeys={route.params.draftId ? PRIOR_INFO_KEYS : undefined}
          onBack={() => navigate(route.params.draftId ? `/drafts/${route.params.draftId}/fields` : '/')}
        />
      )}
      {route.name === 'prior-info' && status === 'anonymous' && (
        <Container sx={{ py: 6 }}>
          <LoginRequired />
        </Container>
      )}
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
