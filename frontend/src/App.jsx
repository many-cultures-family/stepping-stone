import { useEffect, useState } from 'react'
import { Alert, Box, CircularProgress } from '@mui/material'
import { USE_MOCK } from './api/client.js'
import { finishReview } from './api/review.js'
import { startWriting } from './api/priorInfo.js'
import { AuthProvider } from './auth/AuthContext.jsx'
import { LOGIN_ERROR_MESSAGES } from './auth/loginErrors.js'
import { useAuth } from './auth/useAuth.js'
import Layout from './components/Layout.jsx'
import LoginRequired from './components/LoginRequired.jsx'
import { Container } from './components/ui.jsx'
import { PRIOR_INFO_KEYS } from './i18n/priorInfo.js'
import AnswerReviewPage from './pages/AnswerReviewPage.jsx'
import DraftListPage from './pages/DraftListPage.jsx'
import FieldCheckPage from './pages/FieldCheckPage.jsx'
import LandingPage from './pages/LandingPage.jsx'
import PriorInfoPage from './pages/PriorInfoPage.jsx'
import UploadPage from './pages/UploadPage.jsx'
import { useAnswerReview } from './hooks/useAnswerReview.js'
import { usePriorInfo } from './hooks/usePriorInfo.js'
import { getPendingFile, matchRoute, navigate, usePath } from './router.js'

// LOGIN-API.md 항목 2 실패 응답은 /?login_error=<코드>로 돌아온다. 문구 표는 auth/loginErrors.js 에 있다.
// /  랜딩 · /upload  서류 올리기(US-01) · /drafts  내 작성 목록(F-08, US-06·US-07) · /drafts/:id/fields  입력 항목 확인(F-02, US-02·US-03)
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
          <LoginRequired message="로그인한 뒤 문서를 올릴 수 있어요." />
        </Container>
      )}
      {route.name === 'drafts' && <DraftListPage />}
      {route.name === 'fields' && (
        <FieldCheckPage
          key={route.params.draftId}
          draftId={route.params.draftId}
          file={getPendingFile(route.params.draftId)}
          onDone={() => navigate('/drafts')}
          onNext={USE_MOCK ? () => navigate(`/drafts/${route.params.draftId}/prior-info`) : undefined}
          onReupload={() => navigate('/upload')}
        />
      )}
      {/* F-03 API 명세가 아직 없어 저장된 사전 정보·저장 동작을 연결하지 않았다.
          명세가 나오면 여기서 savedInfo·status·serverErrors·onSave·onStartWriting 을 넘기고,
          작성 건 모드의 requiredKeys 는 이 작성 건 fields 의 prior_info_key 목록으로 바꾼다. */}
      {/* 사전 정보·답변 검토는 서버 API가 아직 없어 목(VITE_USE_MOCK=true)에서만 연다 */}
      {USE_MOCK && route.name === 'prior-info' && status === 'authenticated' && (
        <PriorInfoRoute key={route.params.draftId ?? 'manage'} draftId={route.params.draftId} language={user?.language} />
      )}
      {USE_MOCK && route.name === 'review' && status === 'authenticated' && (
        <AnswerReviewRoute key={route.params.draftId} draftId={route.params.draftId} />
      )}
      {USE_MOCK && (route.name === 'prior-info' || route.name === 'review') && status === 'anonymous' && (
        <Container sx={{ py: 6 }}>
          <LoginRequired />
        </Container>
      )}
    </Layout>
  )
}

// F-03 사전 정보 입력·관리. 데이터·저장은 api/priorInfo.js(목 전용)를 거친다.
function PriorInfoRoute({ draftId, language }) {
  const { loaded, savedInfo, status, errorCode, save, retry } = usePriorInfo()
  if (!loaded) return <Loading />
  return (
    <PriorInfoPage
      // 저장하면 저장된 값이 바뀌므로 key 를 바꿔 화면을 새로 그린다(PriorInfoPage 주석)
      key={JSON.stringify(savedInfo)}
      language={language}
      savedInfo={savedInfo}
      requiredKeys={draftId ? PRIOR_INFO_KEYS : undefined}
      status={status}
      errorCode={errorCode}
      onSave={save}
      onRetry={retry}
      onStartWriting={draftId ? () => startWritingAndGo(draftId) : undefined}
      onBack={() => navigate(draftId ? `/drafts/${draftId}/fields` : '/drafts')}
    />
  )
}

// F-06 서술형 답변 검토. 데이터·검토 요청은 api/review.js(명세 전이라 [제안], 목 전용)를 거친다.
function AnswerReviewRoute({ draftId }) {
  const { loaded, answers, suggestions, reviewStatus, errorCode, request, decide } = useAnswerReview(draftId)
  if (!loaded) return <Loading />
  return (
    <AnswerReviewPage
      answers={answers}
      suggestions={suggestions}
      reviewStatus={reviewStatus}
      errorCode={errorCode}
      onRequestReview={request}
      onDecide={decide}
      onFinish={() => finishReview(draftId).then(() => navigate('/drafts'))}
      onBack={() => navigate('/drafts')}
    />
  )
}

function Loading() {
  return (
    <Box sx={{ py: 10, display: 'grid', placeItems: 'center' }}>
      <CircularProgress aria-label="불러오는 중" />
    </Box>
  )
}

function startWritingAndGo(draftId) {
  return startWriting(draftId).then(() => navigate('/drafts'))
}

export default function App() {
  return (
    <AuthProvider>
      <AppContent />
    </AuthProvider>
  )
}
