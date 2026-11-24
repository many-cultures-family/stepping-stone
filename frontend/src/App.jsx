import { useCallback, useEffect, useRef, useState } from 'react'
import { Alert, Box, Button, CircularProgress, Typography } from '@mui/material'
import { USE_MOCK } from './api/client.js'
import { startWriting } from './api/priorInfo.js'
import { AuthProvider } from './auth/AuthContext.jsx'
import { LOGIN_ERROR_MESSAGES } from './auth/loginErrors.js'
import { useAuth } from './auth/useAuth.js'
import { ExplainProvider } from './explain/ExplainProvider.jsx'
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
import WritingPage from './pages/WritingPage.jsx'
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
      {/* F-04 가상 작성 (VIRTUAL-FORM-API.md 항목 1). 원본 위에 입력칸을 겹쳐 그린다 */}
      {route.name === 'writing' && status === 'authenticated' && <WritingPage key={route.params.draftId} draftId={route.params.draftId} />}
      {route.name === 'writing' && status === 'anonymous' && (
        <Container sx={{ py: 6 }}>
          <LoginRequired />
        </Container>
      )}
      {/* F-03 API 명세가 아직 없어 저장된 사전 정보·저장 동작을 연결하지 않았다.
          명세가 나오면 여기서 savedInfo·status·serverErrors·onSave·onStartWriting 을 넘기고,
          작성 건 모드의 requiredKeys 는 이 작성 건 fields 의 prior_info_key 목록으로 바꾼다. */}
      {/* 사전 정보는 서버 API가 아직 없어 목(VITE_USE_MOCK=true)에서만 연다 */}
      {USE_MOCK && route.name === 'prior-info' && status === 'authenticated' && (
        <PriorInfoRoute key={route.params.draftId ?? 'manage'} draftId={route.params.draftId} language={user?.language} />
      )}
      {USE_MOCK && route.name === 'prior-info' && status === 'anonymous' && (
        <Container sx={{ py: 6 }}>
          <LoginRequired />
        </Container>
      )}
      {/* 실서버 모드에서 북마크·뒤로 가기로 이 경로에 들어와도 빈 화면이 아니라 준비 중 안내를 보여 준다 */}
      {!USE_MOCK && route.name === 'prior-info' && <ComingSoon title="사전 정보 입력 화면은 준비 중이에요" />}
      {/* F-06 답변 검토 + F-07 개인정보 감지. 목·실서버 모두 연다 (api/review.js) */}
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

// F-03 사전 정보 입력·관리. 데이터·저장은 api/priorInfo.js(목 전용)를 거친다.
function PriorInfoRoute({ draftId, language }) {
  const { loaded, savedInfo, status, errorCode, save, retry } = usePriorInfo()
  const { busy, error, run, clearError } = useSingleFlight()
  if (!loaded) return <Loading />
  return (
    <>
      <ActionError error={error} onClose={clearError} />
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
        onStartWriting={draftId ? () => run(() => startWriting(draftId).then(() => navigate(`/drafts/${draftId}/writing`))) : undefined}
        startingWriting={busy}
        onBack={() => navigate(draftId ? `/drafts/${draftId}/fields` : '/drafts')}
      />
    </>
  )
}

// F-06 서술형 답변 검토 + F-07 개인정보 감지. 검토는 api/review.js([제안] 경로), 감지 규칙은 api/privacy.js(GET /api/privacy-rules)를 거친다.
function AnswerReviewRoute({ draftId }) {
  const review = useAnswerReview(draftId)
  const { busy, error, run, clearError } = useSingleFlight()
  if (!review.loaded) return <Loading />
  return (
    <>
      <ActionError error={error} onClose={clearError} />
      <AnswerReviewPage
        answers={review.answers}
        suggestions={review.suggestions}
        reviewStatus={review.reviewStatus}
        reviewCount={review.reviewCount}
        reviewLimit={review.reviewLimit}
        errorCode={review.errorCode}
        detections={review.detections}
        pendingDetections={review.pendingDetections}
        privacyError={review.privacyError}
        onRequestReview={review.request}
        onConfirmPrivacy={review.confirmPrivacy}
        onCancelPrivacy={review.cancelPrivacy}
        // 요청 중에는 undefined 를 넘겨 '검토 마치기' 버튼을 끈다(AnswerReviewPage 의 canFinish)
        onFinish={busy ? undefined : (undecidedSuggestions) => run(() => review.finish(undecidedSuggestions).then(() => navigate('/drafts')))}
        onBack={() => navigate('/drafts')}
      />
    </>
  )
}

// 다음 단계로 넘어가는 요청(작성 시작·검토 마치기)을 한 번에 하나만 보낸다.
// 버튼을 빠르게 두 번 눌러도 상태 갱신 전에 ref 로 막고, 실패하면 오류를 남긴다(401 은 로그아웃으로 맞춘다).
function useSingleFlight() {
  const { setLoggedOut } = useAuth()
  const inFlight = useRef(false)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState(null)
  const run = useCallback(
    (fn) => {
      if (inFlight.current) return
      inFlight.current = true
      setBusy(true)
      setError(null)
      return Promise.resolve()
        .then(fn)
        .catch((e) => {
          if (e?.code === 'LOGIN_REQUIRED') setLoggedOut()
          setError(e)
        })
        .finally(() => {
          inFlight.current = false
          setBusy(false)
        })
    },
    [setLoggedOut],
  )
  return { busy, error, run, clearError: () => setError(null) }
}

const ACTION_ERROR_TEXT = {
  LOGIN_REQUIRED: '로그인이 필요해요. 다시 로그인해 주세요.',
  NETWORK_ERROR: '서버 연결 실패. 잠시 후 다시 시도해 주세요.',
}

function ActionError({ error, onClose }) {
  if (!error) return null
  return (
    <Container sx={{ pt: 2 }}>
      <Alert severity="error" onClose={onClose}>
        {ACTION_ERROR_TEXT[error.code] ?? '문제가 생겼어요. 다시 시도해 주세요.'}
      </Alert>
    </Container>
  )
}

function ComingSoon({ title }) {
  return (
    <Container sx={{ py: 6 }}>
      <Typography variant="h3" component="h1">{title}</Typography>
      <Typography sx={{ mt: 1, color: 'text.secondary' }}>작성 건은 내 작성 목록에서 이어서 볼 수 있어요.</Typography>
      <Button variant="contained" size="large" onClick={() => navigate('/drafts')} sx={{ mt: 3 }}>
        내 작성 목록 보기
      </Button>
    </Container>
  )
}

function Loading() {
  return (
    <Box sx={{ py: 10, display: 'grid', placeItems: 'center' }}>
      <CircularProgress aria-label="불러오는 중" />
    </Box>
  )
}

export default function App() {
  return (
    <AuthProvider>
      {/* F-05 단어·문장 설명: 로그인한 사용자의 언어로 용어 사전을 불러와 화면 전체에서 같이 쓴다 */}
      <ExplainProvider>
        <AppContent />
      </ExplainProvider>
    </AuthProvider>
  )
}
