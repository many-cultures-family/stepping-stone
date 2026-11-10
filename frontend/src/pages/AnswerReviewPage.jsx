import { useMemo, useState } from 'react'
import { Alert, Box, Button, CircularProgress, Stack, Typography } from '@mui/material'
import AnswerReviewCard from '../components/answer-review/AnswerReviewCard.jsx'
import { SparkleIcon } from '../components/icons.jsx'
import PageHero from '../components/PageHero.jsx'
import { Container } from '../components/ui.jsx'
import { ds, radius, squircle } from '../theme.js'

// 오류 코드 → 문구 (DESIGN.md "오류" 상태). F-06 API 명세가 나오면 그 오류 코드를 이 표에 더한다.
const ERROR_TEXT = {
  LOGIN_REQUIRED: '로그인이 필요해요. 다시 로그인해 주세요.',
  LLM_CALL_FAILED: 'AI 검토를 받지 못했어요. 잠시 후 다시 시도해 주세요.',
  NETWORK_ERROR: '서버 연결 실패. 잠시 후 다시 시도해 주세요.',
}
const errorText = (code) => ERROR_TEXT[code] ?? '문제가 생겼어요. 다시 시도해 주세요.'

// F-06 서술형 답변 검토 (US-05)
// - 데이터와 동작은 props 로 받는다. App.jsx 의 AnswerReviewRoute 가 hooks/useAnswerReview.js → api/review.js 로 연결한다.
//   F-06 API 명세가 아직 없어서 api/review.js 의 경로·응답은 [제안]이고, VITE_USE_MOCK=true 에서는 mocks/review.js 가 응답한다.
// - PageHero 의 단계 표시는 step={null} 로 숨긴다. Stepper 는 3단계(서류 올리기·입력 항목 확인·사전 정보 입력)뿐이라
//   4번째를 가리킬 수 없고, 전체 단계 구성이 정해질 때까지 '○단계' 문구도 쓰지 않는다.
// - 데이터 모양은 DATA-MODEL.md 를 따른다.
//   answers:     [{ id(field_answer id), label(칸 제목), guide(안내 문구), value(사용자 답변) }]
//   suggestions: [{ id, field_answer_id, kind(맞춤법·문법·질문 의도·보충), suggested_text, explanation, decision }]
// - reviewStatus: 'idle'(검토 요청 전) · 'loading' · 'done' · 'error'
// - 제안은 자동으로 반영하지 않는다(R6). 사용자가 고른 반영·무시는 화면 상태로 들고 있다가
//   onDecide 로 알린다(서버 저장은 API 연결 때). 미결정이 하나라도 남으면 '검토 마치기'를 막는다(R9).
export default function AnswerReviewPage({
  answers = [],
  suggestions = [],
  reviewStatus = 'idle',
  errorCode = null,
  onRequestReview,
  onDecide,
  onFinish,
  onBack,
}) {
  // 사용자가 화면에서 고른 결정. props 의 decision 위에 덮어쓴다.
  const [picked, setPicked] = useState({})

  const decided = useMemo(
    () => suggestions.map((s) => ({ ...s, decision: picked[s.id] ?? s.decision ?? '미결정' })),
    [suggestions, picked],
  )
  const reviewed = reviewStatus === 'done'
  const pendingCount = reviewed ? decided.filter((s) => s.decision === '미결정').length : 0
  const emptyAnswers = answers.filter((a) => !a.value?.trim())
  // 서술형 답변을 비워 두면 검토를 거절한다 (US-05 인수 조건)
  const canRequest = Boolean(onRequestReview) && answers.length > 0 && emptyAnswers.length === 0 && reviewStatus !== 'loading'
  const canFinish = reviewed && pendingCount === 0 && Boolean(onFinish)

  const decide = (id, decision) => {
    setPicked((prev) => ({ ...prev, [id]: decision }))
    onDecide?.(id, decision)
  }

  const requestReview = () => {
    setPicked({})
    onRequestReview()
  }

  return (
    <>
      <PageHero
        step={null}
        overline="서술형 검토"
        title="쓴 답변을 AI와 함께 다듬어요"
        description="맞춤법·문법과 질문에 맞게 썼는지 AI가 살펴봐요. 제안은 자동으로 바뀌지 않아요. 하나씩 보고 반영할지 직접 골라 주세요."
      />

      <Container sx={{ py: { xs: 4, md: 6 } }}>
        {answers.length === 0 && reviewStatus === 'error' ? (
          // 답변 목록을 불러오지 못한 경우. 서술형 칸이 없는 빈 화면과 구분한다.
          <Alert severity="error">{errorText(errorCode)}</Alert>
        ) : answers.length === 0 ? (
          <EmptyState onBack={onBack} />
        ) : (
          <Stack direction={{ xs: 'column', md: 'row' }} spacing={{ xs: 3, md: 4 }} sx={{ alignItems: 'flex-start' }}>
            <Stack spacing={3} sx={{ flex: 1, minWidth: 0, width: '100%' }}>
              {reviewStatus === 'error' && (
                <Alert
                  severity="error"
                  action={canRequest && <Button color="inherit" size="small" onClick={requestReview}>다시 시도</Button>}
                >
                  {errorText(errorCode)}
                </Alert>
              )}
              {answers.map((answer) => (
                <AnswerReviewCard
                  key={answer.id}
                  answer={answer}
                  reviewed={reviewed}
                  suggestions={decided.filter((s) => s.field_answer_id === answer.id)}
                  onDecide={decide}
                />
              ))}
            </Stack>

            <ReviewPanel
              reviewStatus={reviewStatus}
              answerCount={answers.length}
              emptyCount={emptyAnswers.length}
              suggestionCount={decided.length}
              pendingCount={pendingCount}
              canRequest={canRequest}
              canFinish={canFinish}
              onRequest={requestReview}
              onFinish={onFinish}
              onBack={onBack}
            />
          </Stack>
        )}
      </Container>
    </>
  )
}

// 오른쪽(모바일은 아래) 요약: 검토 요청 → 남은 결정 수 → 검토 마치기
function ReviewPanel({ reviewStatus, answerCount, emptyCount, suggestionCount, pendingCount, canRequest, canFinish, onRequest, onFinish, onBack }) {
  const loading = reviewStatus === 'loading'
  const reviewed = reviewStatus === 'done'

  return (
    <Box
      component="aside"
      aria-label="검토 진행 상황"
      sx={{
        width: { xs: '100%', md: 340 },
        flexShrink: 0,
        position: { md: 'sticky' },
        top: { md: 96 },
        p: { xs: 2.5, md: 3 },
        ...squircle(radius.card),
        bgcolor: ds.white,
        border: `1px solid ${ds.line}`,
        boxShadow: ds.floatShadow,
      }}
    >
      <Stack spacing={2.5}>
        <Box>
          <Typography sx={{ fontSize: 13, fontWeight: 700, color: ds.muted }}>서술형 답변 {answerCount}개</Typography>
          <Typography variant="h3" component="p" sx={{ fontSize: 22, mt: 0.5, wordBreak: 'keep-all' }} aria-live="polite">
            {loading && 'AI가 답변을 읽고 있어요'}
            {reviewStatus === 'idle' && '검토를 받아 볼까요?'}
            {reviewStatus === 'error' && '검토를 받지 못했어요'}
            {reviewed && (suggestionCount === 0
              ? '고칠 곳이 없어요'
              : pendingCount > 0 ? `고를 제안이 ${pendingCount}개 남았어요` : '모든 제안을 골랐어요')}
          </Typography>
        </Box>

        {emptyCount > 0 && (
          <Alert severity="warning">답변이 비어 있는 칸이 {emptyCount}개 있어요. 답변을 먼저 써야 검토를 받을 수 있어요.</Alert>
        )}

        {!reviewed && (
          <Button
            variant="contained"
            size="large"
            disabled={!canRequest}
            onClick={onRequest}
            startIcon={loading ? <CircularProgress size={18} color="inherit" /> : <SparkleIcon size={16} />}
          >
            {loading ? '검토 중이에요' : 'AI 검토 받기'}
          </Button>
        )}

        {reviewed && (
          <>
            <Button variant="contained" size="large" disabled={!canFinish} onClick={onFinish}>
              검토 마치기
            </Button>
            {pendingCount > 0 && (
              <Typography sx={{ fontSize: 13, color: ds.text2 }}>
                제안마다 '반영' 또는 '그대로 둘게요'를 골라야 검토를 마칠 수 있어요.
              </Typography>
            )}
            <Button color="inherit" disabled={!canRequest} onClick={onRequest}>
              답변을 고쳤어요, 다시 검토 받기
            </Button>
          </>
        )}

        {onBack && (
          <Button color="inherit" onClick={onBack}>
            작성 화면으로 돌아가기
          </Button>
        )}
      </Stack>
    </Box>
  )
}

// 검토할 서술형 답변이 없을 때 (DESIGN.md "빈 화면")
function EmptyState({ onBack }) {
  return (
    <Box sx={{ p: { xs: 3, md: 5 }, ...squircle(radius.card), bgcolor: ds.card, textAlign: 'center' }}>
      <Typography variant="h3" component="h2" sx={{ fontSize: 22 }}>검토할 서술형 답변이 없어요</Typography>
      <Typography sx={{ color: ds.text2, mt: 1 }}>작성 화면에서 서술형 칸에 답변을 쓰면 여기서 AI 검토를 받을 수 있어요.</Typography>
      {onBack && (
        <Button variant="contained" size="large" onClick={onBack} sx={{ mt: 3 }}>
          작성 화면으로 가기
        </Button>
      )}
    </Box>
  )
}
