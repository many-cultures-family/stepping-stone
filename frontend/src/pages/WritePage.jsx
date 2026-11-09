import { useCallback, useEffect, useMemo, useState } from 'react'
import { Box, Button, ButtonBase, Skeleton, Snackbar, Stack, Typography } from '@mui/material'
import { acknowledgeMismatch, getAnswers, saveAnswer } from '../api/answers.js'
import { useAuth } from '../auth/useAuth.js'
import { AlertCircleIcon, CheckCircleIcon } from '../components/icons.jsx'
import LoginRequired from '../components/LoginRequired.jsx'
import PageHero from '../components/PageHero.jsx'
import { Container, Pill } from '../components/ui.jsx'
import MismatchPopover from '../components/virtual-form/MismatchPopover.jsx'
import MismatchReviewDialog from '../components/virtual-form/MismatchReviewDialog.jsx'
import VirtualFormFrame from '../components/virtual-form/VirtualFormFrame.jsx'
import VirtualFormRow from '../components/virtual-form/VirtualFormRow.jsx'
import { ds, radius, squircle } from '../theme.js'

// API 오류 코드 → 문구 (VIRTUAL-FORM-API.md 실패 응답). 코드 → 문구는 이 표 한 곳에서만 고른다.
const ERROR_TEXT = {
  LOGIN_REQUIRED: '로그인이 필요해요. 다시 로그인해 주세요.',
  FORBIDDEN_DRAFT: '이 문서를 볼 수 있는 권한이 없어요.',
  DRAFT_NOT_FOUND: '문서를 찾을 수 없어요.',
  DRAFT_STEP_INVALID: '아직 이 단계가 아니에요. 입력 항목 확인을 먼저 마쳐 주세요.',
  DRAFT_NOT_EDITABLE: '이 문서는 더 이상 고칠 수 없어요.',
  FIELD_NOT_FOUND: '항목을 찾을 수 없어요. 화면을 새로 불러와 주세요.',
  FORMAT_INVALID: '형식이 맞지 않아요. 예시처럼 적어 주세요.',
  NO_MISMATCH: '저장된 정보와 다른 곳이 없어요.',
  NETWORK_ERROR: '서버 연결 실패. 잠시 후 다시 시도해 주세요.',
}
const errorText = (e) => ERROR_TEXT[e?.code] ?? '문제가 생겼어요. 다시 시도해 주세요.'
// 재시도해도 소용없는 상태 (다음 단계로 갈 수 없음)
const BLOCKING_CODES = ['DRAFT_STEP_INVALID', 'DRAFT_NOT_EDITABLE']

// F-04 가상 작성 환경
// - 실제 웹 신청서와 같은 모양의 연습 폼. 여기 쓴 값은 어디에도 제출되지 않는다 (R4)
// - 입력 중에는 화면 상태, 칸을 벗어날 때(선택형은 고르는 즉시) 저장한다
// - 사전 정보와의 불일치는 서버 응답의 mismatch 가 기준이고, 글자 단위 차이는 화면에서 만든다
// - 단계 전이 API가 명세에 없어서 '연습 마치기'는 화면 상태만 바꾼다
export default function WritePage({ draftId, onDone }) {
  const { status: authStatus, setLoggedOut } = useAuth()
  const [loadState, setLoadState] = useState({ status: 'loading', error: null })
  const [answers, setAnswers] = useState([])
  const [values, setValues] = useState({}) // field_id → 입력 중인 값
  const [saveStates, setSaveStates] = useState({}) // field_id → 'saving' | 'saved'
  const [formatErrors, setFormatErrors] = useState({}) // field_id → true
  const [popover, setPopover] = useState(null) // { fieldId, anchorEl }
  const [reviewOpen, setReviewOpen] = useState(false)
  const [busy, setBusy] = useState(false)
  const [finished, setFinished] = useState(false)
  const [toast, setToast] = useState(null)

  const fetchAnswers = useCallback(
    (isCancelled = () => false) =>
      getAnswers(draftId)
        .then((data) => {
          if (isCancelled()) return
          setAnswers(data.answers)
          setValues(Object.fromEntries(data.answers.map((a) => [a.field_id, a.value ?? ''])))
          setLoadState({ status: 'ready', error: null })
        })
        .catch((e) => {
          if (isCancelled()) return
          if (e?.code === 'LOGIN_REQUIRED') setLoggedOut()
          setLoadState({ status: 'error', error: e })
        }),
    [draftId, setLoggedOut],
  )

  useEffect(() => {
    if (authStatus !== 'authenticated') return
    let cancelled = false
    fetchAnswers(() => cancelled)
    return () => {
      cancelled = true
    }
  }, [authStatus, fetchAnswers])

  function retry() {
    setLoadState({ status: 'loading', error: null })
    fetchAnswers()
  }

  function handleApiError(e) {
    if (e?.code === 'LOGIN_REQUIRED') setLoggedOut()
    setToast(errorText(e))
  }

  const patchAnswer = (fieldId, patch) => setAnswers((prev) => prev.map((a) => (a.field_id === fieldId ? { ...a, ...patch } : a)))

  // 칸을 벗어날 때(blur) 저장. 서버에 있는 값과 같으면 호출하지 않는다.
  async function commit(answer, value) {
    const current = answer.value ?? ''
    if (value === current && !formatErrors[answer.field_id]) return
    const id = answer.field_id
    setSaveStates((p) => ({ ...p, [id]: 'saving' }))
    try {
      const res = await saveAnswer(draftId, id, value)
      patchAnswer(id, { value: res.value, mismatch: res.mismatch })
      setFormatErrors((p) => ({ ...p, [id]: false }))
      setSaveStates((p) => ({ ...p, [id]: 'saved' }))
    } catch (e) {
      setSaveStates((p) => ({ ...p, [id]: undefined }))
      if (e?.code === 'FORMAT_INVALID') setFormatErrors((p) => ({ ...p, [id]: true }))
      else handleApiError(e)
    }
  }

  // 저장된 정보로 바꾸기 → 사전 정보 값을 그대로 저장
  async function useSaved(answer) {
    const prior = answer.mismatch.prior_value
    setBusy(true)
    try {
      const res = await saveAnswer(draftId, answer.field_id, prior)
      patchAnswer(answer.field_id, { value: res.value, mismatch: res.mismatch })
      setValues((p) => ({ ...p, [answer.field_id]: res.value ?? '' }))
      setFormatErrors((p) => ({ ...p, [answer.field_id]: false }))
      setSaveStates((p) => ({ ...p, [answer.field_id]: 'saved' }))
      setPopover(null)
    } catch (e) {
      handleApiError(e)
    } finally {
      setBusy(false)
    }
  }

  // 그대로 둘게요 → 불일치 확인만 남긴다
  async function keep(answer) {
    setBusy(true)
    try {
      const res = await acknowledgeMismatch(draftId, answer.field_id)
      patchAnswer(answer.field_id, { mismatch: { ...answer.mismatch, mismatch_acknowledged: res.mismatch_acknowledged } })
      setPopover(null)
    } catch (e) {
      handleApiError(e)
    } finally {
      setBusy(false)
    }
  }

  const pendingList = useMemo(() => answers.filter((a) => a.mismatch.has_prior_info && a.mismatch.differs && !a.mismatch.mismatch_acknowledged), [answers])
  const acknowledgedCount = answers.filter((a) => a.mismatch.has_prior_info && a.mismatch.differs && a.mismatch.mismatch_acknowledged).length
  const formatErrorCount = Object.values(formatErrors).filter(Boolean).length
  const popoverAnswer = popover ? answers.find((a) => a.field_id === popover.fieldId) : null

  // 오른쪽 '확인할 칸'을 누르면 해당 칸으로 이동하고 입력 칸에 포커스
  function goTo(fieldId) {
    document.querySelector(`[data-field-id="${fieldId}"]`)?.scrollIntoView({ behavior: 'smooth', block: 'center' })
    document.getElementById(`vf-${fieldId}`)?.focus({ preventScroll: true })
  }

  function handleFinish() {
    if (pendingList.length > 0) {
      setReviewOpen(true)
      return
    }
    setReviewOpen(false)
    setFinished(true)
    window.scrollTo({ top: 0 })
  }

  if (authStatus === 'loading') return <LoadingView />

  if (authStatus === 'anonymous') {
    return (
      <Container sx={{ py: 6 }}>
        <LoginRequired />
      </Container>
    )
  }

  if (loadState.status === 'loading') return <LoadingView />

  if (loadState.status === 'error') {
    if (BLOCKING_CODES.includes(loadState.error?.code)) {
      return <EmptyState title="지금은 연습할 수 없어요" body={errorText(loadState.error)} action={<Button variant="contained" size="large" onClick={onDone}>처음으로</Button>} />
    }
    return <EmptyState title="연습 화면을 불러오지 못했어요" body={errorText(loadState.error)} action={<Button variant="contained" size="large" onClick={retry}>다시 시도</Button>} />
  }

  if (finished) return <FinishedView count={answers.length} acknowledgedCount={acknowledgedCount} onDone={onDone} />

  return (
    <>
      <PageHero step={3} overline="STEP 4 · 연습" title="신청서를 미리 써 봐요" description="실제 신청 화면과 같은 모양이에요. 저장된 정보와 다른 칸은 주황색으로 알려 드려요.">
        <Stack direction="row" spacing={1} sx={{ mt: 3, flexWrap: 'wrap', rowGap: 1 }}>
          <Stat label="저장된 정보와 다름" value={pendingList.length} tone={pendingList.length > 0 ? 'orange' : 'white'} />
          <Stat label="확인함" value={acknowledgedCount} />
          {formatErrorCount > 0 && <Stat label="형식 오류" value={formatErrorCount} tone="red" />}
        </Stack>
      </PageHero>

      <Container sx={{ mt: { xs: 4, md: 6 }, pb: 2 }}>
        <Box
          sx={{
            display: 'grid',
            gridTemplateColumns: { xs: 'minmax(0, 1fr)', lg: 'minmax(0, 7fr) minmax(0, 5fr)' },
            gap: { xs: 3, md: 4, lg: 5 },
            alignItems: 'start',
          }}
        >
          <Box sx={{ minWidth: 0 }}>
            <VirtualFormFrame>
              {answers.map((a) => (
                <VirtualFormRow
                  key={a.field_id}
                  answer={a}
                  value={values[a.field_id] ?? ''}
                  saveState={saveStates[a.field_id]}
                  formatError={Boolean(formatErrors[a.field_id])}
                  onChange={(v) => {
                    setValues((p) => ({ ...p, [a.field_id]: v }))
                    setSaveStates((p) => ({ ...p, [a.field_id]: undefined }))
                  }}
                  onCommit={(v) => commit(a, v)}
                  onOpenPopover={(fieldId, anchorEl) => setPopover({ fieldId, anchorEl })}
                />
              ))}
            </VirtualFormFrame>
          </Box>

          {/* 확인할 칸: 데스크톱은 스크롤해도 따라온다 */}
          <Box component="aside" aria-label="확인할 칸" sx={{ position: { lg: 'sticky' }, top: { lg: 96 }, minWidth: 0, bgcolor: ds.card, ...squircle(radius.card), p: { xs: 2.5, md: 3 } }}>
            <Typography variant="h3" component="h2" sx={{ mb: 1.5 }}>
              확인할 칸
            </Typography>
            {pendingList.length === 0 ? (
              <Stack direction="row" spacing={1} sx={{ alignItems: 'center', color: ds.green }}>
                <CheckCircleIcon size={22} color={ds.green} />
                <Typography sx={{ fontWeight: 600 }}>다른 칸이 없어요</Typography>
              </Stack>
            ) : (
              <Stack component="ul" spacing={1} sx={{ m: 0, p: 0, listStyle: 'none' }}>
                {pendingList.map((a) => (
                  <li key={a.field_id}>
                    <ButtonBase
                      onClick={() => goTo(a.field_id)}
                      aria-label={`${a.label} 칸으로 이동`}
                      sx={{ width: '100%', justifyContent: 'flex-start', textAlign: 'left', gap: 1.5, bgcolor: ds.white, color: ds.orange, ...squircle(radius.tile), px: 2, py: 1.5, '&.Mui-focusVisible': { outline: `3px solid ${ds.primaryLine}` } }}
                    >
                      <AlertCircleIcon size={20} />
                      <Box sx={{ minWidth: 0 }}>
                        <Typography sx={{ fontSize: 15, fontWeight: 700, color: ds.ink }}>{a.label}</Typography>
                        <Typography variant="caption" sx={{ color: ds.text2 }}>
                          저장된 정보: {a.mismatch.prior_value}
                        </Typography>
                      </Box>
                    </ButtonBase>
                  </li>
                ))}
              </Stack>
            )}
            <Typography variant="caption" sx={{ display: 'block', color: ds.text2, mt: 2 }}>
              연습 화면이라 쓴 내용은 어디에도 제출되지 않아요.
            </Typography>
          </Box>
        </Box>

        <FinishCard pendingCount={pendingList.length} formatErrorCount={formatErrorCount} onFinish={handleFinish} />
      </Container>

      <MismatchPopover anchorEl={popover?.anchorEl} answer={popoverAnswer} busy={busy} onClose={() => setPopover(null)} onUseSaved={useSaved} onKeep={keep} />

      <MismatchReviewDialog
        open={reviewOpen}
        items={pendingList}
        busy={busy}
        onClose={() => setReviewOpen(false)}
        onUseSaved={useSaved}
        onKeep={keep}
        onFinish={handleFinish}
      />

      <Snackbar
        open={Boolean(toast)}
        autoHideDuration={3000}
        onClose={() => setToast(null)}
        anchorOrigin={{ vertical: 'top', horizontal: 'center' }}
        sx={{ top: { xs: 76, sm: 92 } }}
        message={toast}
        slotProps={{
          content: {
            sx: { bgcolor: ds.ink, ...squircle(radius.full), px: 3, fontSize: 14, fontWeight: 500, boxShadow: ds.floatShadow, justifyContent: 'center' },
          },
        }}
      />
    </>
  )
}

// 아래에 붙어 따라오는(sticky) 마무리 카드 (입력 항목 확인 화면의 ActionCard와 같은 모양)
function FinishCard({ pendingCount, formatErrorCount, onFinish }) {
  return (
    <Box
      sx={{
        position: 'sticky',
        bottom: { xs: 12, md: 24 },
        zIndex: 5,
        mt: 3,
        bgcolor: ds.white,
        ...squircle(radius.card),
        boxShadow: `0 0 0 1px ${ds.line}, ${ds.floatShadow}`,
        p: { xs: 2, md: 2.5 },
        pl: { md: 3.5 },
        display: 'flex',
        flexDirection: { xs: 'column', sm: 'row' },
        alignItems: { sm: 'center' },
        gap: 2,
      }}
    >
      <Box sx={{ flexGrow: 1 }}>
        <Typography sx={{ fontWeight: 700, fontSize: 15, color: pendingCount > 0 ? ds.orange : ds.ink }}>
          {pendingCount > 0 ? `저장된 정보와 다른 칸 ${pendingCount}개` : '다 썼다면 연습을 마쳐요'}
        </Typography>
        <Typography variant="caption" sx={{ color: ds.text2 }}>
          {formatErrorCount > 0 ? `형식이 맞지 않은 칸이 ${formatErrorCount}개 있어요. ` : ''}연습 화면이라 어디에도 제출되지 않아요.
        </Typography>
      </Box>
      <Button variant="contained" color="secondary" size="large" onClick={onFinish} sx={{ minWidth: 140, flexShrink: 0 }}>
        연습 마치기
      </Button>
    </Box>
  )
}

function Stat({ label, value, tone = 'white' }) {
  const t = {
    white: { bg: 'rgba(255,255,255,.85)', fg: ds.ink },
    red: { bg: ds.redSoft, fg: ds.red },
    orange: { bg: ds.orangeSoft, fg: ds.orange },
  }[tone]
  return (
    <Box sx={{ display: 'inline-flex', alignItems: 'baseline', gap: 0.75, px: 2, height: 38, lineHeight: '38px', ...squircle(radius.full), bgcolor: t.bg }}>
      <Typography component="span" sx={{ fontSize: 14, color: tone === 'white' ? ds.text2 : t.fg }}>
        {label}
      </Typography>
      <Typography component="span" sx={{ fontSize: 16, fontWeight: 700, color: t.fg, fontFeatureSettings: '"tnum"' }}>
        {value}
      </Typography>
    </Box>
  )
}

function LoadingView() {
  return (
    <Box role="status" aria-label="연습 화면을 불러오는 중">
      <PageHero step={3} overline="STEP 4 · 연습" title="연습 화면을 준비하고 있어요" description="잠시만 기다려 주세요." />
      <Container sx={{ mt: { xs: 4, md: 6 } }}>
        <Box sx={{ display: 'grid', gridTemplateColumns: { xs: '1fr', lg: '7fr 5fr' }, gap: { xs: 3, lg: 5 } }}>
          <Skeleton variant="rounded" height={520} sx={{ ...squircle(radius.hero) }} />
          <Skeleton variant="rounded" height={220} sx={{ ...squircle(radius.card) }} />
        </Box>
      </Container>
    </Box>
  )
}

function EmptyState({ title, body, action }) {
  return (
    <>
      <PageHero step={3} overline="STEP 4 · 연습" title={title} description={body} />
      <Container sx={{ mt: 4 }}>{action}</Container>
    </>
  )
}

function FinishedView({ count, acknowledgedCount, onDone }) {
  return (
    <>
      <PageHero step={3} overline="STEP 4 · 연습 완료" title="연습을 마쳤어요" description="실제로는 아무 곳에도 보내지 않았어요. 연습 화면이라 쓴 내용은 어디에도 제출되지 않아요." />
      <Container sx={{ mt: { xs: 4, md: 6 } }}>
        <Stack direction="row" spacing={3} sx={{ alignItems: 'center', flexWrap: 'wrap', rowGap: 2, bgcolor: ds.card, ...squircle(radius.card), p: { xs: 3, md: 4 } }}>
          <CheckCircleIcon size={56} color={ds.primary} />
          <Stack direction="row" spacing={5}>
            {[
              ['연습한 칸', count],
              ['그대로 둔 칸', acknowledgedCount],
            ].map(([k, v]) => (
              <Box key={k}>
                <Typography variant="caption" sx={{ color: ds.text2 }}>
                  {k}
                </Typography>
                <Typography sx={{ fontSize: 32, fontWeight: 700, lineHeight: 1.2 }}>{v}개</Typography>
              </Box>
            ))}
          </Stack>
          <Pill tone="grey">제출 없음</Pill>
        </Stack>
        <Button variant="contained" color="secondary" size="large" onClick={onDone} sx={{ mt: 3 }}>
          처음으로
        </Button>
      </Container>
    </>
  )
}
