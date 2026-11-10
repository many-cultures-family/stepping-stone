import { useEffect, useState } from 'react'
import { Alert, Box, CircularProgress } from '@mui/material'
import { AuthProvider } from './auth/AuthContext.jsx'
import { useAuth } from './auth/useAuth.js'
import Layout from './components/Layout.jsx'
import LoginRequired from './components/LoginRequired.jsx'
import { Container } from './components/ui.jsx'
import AnswerReviewPage from './pages/AnswerReviewPage.jsx'
import DraftListPage from './pages/DraftListPage.jsx'
import FieldCheckPage from './pages/FieldCheckPage.jsx'
import LandingPage from './pages/LandingPage.jsx'
import UploadPage from './pages/UploadPage.jsx'
import { useAnswerReview } from './hooks/useAnswerReview.js'
import { getPendingFile, matchRoute, navigate, usePath } from './router.js'

// LOGIN-API.md 항목 2 실패 응답: /?login_error=<코드>로 돌아온다.
const LOGIN_ERROR_MESSAGES = {
  GOOGLE_LOGIN_CANCELED: '로그인을 취소했어요.',
  GOOGLE_EMAIL_NOT_VERIFIED: '이메일 인증이 안 된 구글 계정이에요.',
  GOOGLE_LOGIN_FAILED: '로그인 중 문제가 생겼어요. 다시 시도해 주세요.',
}

// /  랜딩 · /upload  서류 올리기(US-01) · /drafts  내 작성 목록(F-08, US-06·US-07) · /drafts/:id/fields  입력 항목 확인(F-02, US-02·US-03)
// /drafts/:id/review  서술형 답변 검토(F-06, US-05)
function AppContent() {
  const route = matchRoute(usePath())
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
      {route.name === 'drafts' && <DraftListPage />}
      {route.name === 'fields' && (
        <FieldCheckPage
          key={route.params.draftId}
          draftId={route.params.draftId}
          file={getPendingFile(route.params.draftId)}
          onDone={() => navigate('/')}
          onReupload={() => navigate('/upload')}
        />
      )}
      {route.name === 'review' && status === 'authenticated' && (
        <AnswerReviewRoute key={route.params.draftId} draftId={route.params.draftId} />
      )}
      {route.name === 'review' && status === 'anonymous' && (
        <Container sx={{ py: 6 }}>
          <LoginRequired />
        </Container>
      )}
    </Layout>
  )
}

// F-06 서술형 답변 검토. 데이터·검토 요청은 api/review.js(명세 전이라 [제안])를 거친다.
// '검토 마치기'(onFinish)는 단계 전이 API 가 정해질 때까지 연결하지 않아 버튼이 막혀 있다.
function AnswerReviewRoute({ draftId }) {
  const { loaded, answers, suggestions, reviewStatus, errorCode, request, decide } = useAnswerReview(draftId)
  if (!loaded) {
    return (
      <Box sx={{ py: 10, display: 'grid', placeItems: 'center' }}>
        <CircularProgress aria-label="불러오는 중" />
      </Box>
    )
  }
  return (
    <AnswerReviewPage
      answers={answers}
      suggestions={suggestions}
      reviewStatus={reviewStatus}
      errorCode={errorCode}
      onRequestReview={request}
      onDecide={decide}
      onBack={() => navigate(`/drafts/${draftId}/write`)}
    />
  )
}

export default function App() {
  return (
    <AuthProvider>
      <AppContent />
    </AuthProvider>
  )
}
