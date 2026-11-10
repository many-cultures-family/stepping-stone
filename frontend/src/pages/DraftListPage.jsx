import { useCallback, useEffect, useMemo, useState } from 'react'
import {
  Box,
  Button,
  ButtonBase,
  CircularProgress,
  Dialog,
  DialogActions,
  DialogContent,
  DialogContentText,
  DialogTitle,
  Skeleton,
  Snackbar,
  Stack,
  Typography,
} from '@mui/material'
import { cancelDraft, listDrafts, submitDraft } from '../api/drafts.js'
import { useAuth } from '../auth/useAuth.js'
import { AlertCircleIcon, ArrowIcon, CheckCircleIcon, DocumentIcon, UploadIcon } from '../components/icons.jsx'
import LoginRequired from '../components/LoginRequired.jsx'
import PageHero from '../components/PageHero.jsx'
import { Container, Pill } from '../components/ui.jsx'
import { navigate } from '../router.js'
import { ds, radius, squircle } from '../theme.js'

// API 오류 코드 → 문구 (DRAFT-STATUS-API.md 실패 응답). 코드 → 문구는 이 표 한 곳에서만 고른다.
const ERROR_TEXT = {
  LOGIN_REQUIRED: '로그인이 필요해요. 다시 로그인해 주세요.',
  FORBIDDEN_DRAFT: '이 작성 건을 볼 수 있는 권한이 없어요.',
  DRAFT_NOT_FOUND: '작성 건을 찾을 수 없어요. 이미 지워졌을 수 있어요.',
  DRAFT_NOT_READY: '아직 검토가 끝나지 않아 제출 완료로 표시할 수 없어요.',
  ALREADY_SUBMITTED: '이미 제출 완료로 표시한 작성 건이에요.',
  ALREADY_CANCELED: '이미 취소한 작성 건이에요.',
  NETWORK_ERROR: '서버 연결 실패. 잠시 후 다시 시도해 주세요.',
}
const errorText = (e) => ERROR_TEXT[e?.code] ?? '문제가 생겼어요. 다시 시도해 주세요.'

// 반려 사유 코드 → 문구 (DATA-MODEL.md draft.reject_reason, R3: 문장은 프론트가 만든다)
const REJECT_TEXT = {
  OCR_FAILED: '문서 글자를 읽지 못했어요.',
  PAGE_MISSING: '빠진 페이지가 있어요.',
  FIELD_INVALID: '입력 항목 확인에서 고칠 곳이 남았어요.',
  CONDITION_UNMET: '완성 조건이 아직 남아 있어요.',
}

// 화면 필터. status/step 과 '작성중·검토완료·제출완료'는 1:1이 아니라서(PRD.md 8절 미정) 여기서 묶는다.
// - 작성중: status=수정 (어느 단계든)
// - 검토완료: status=성공, 아직 제출 기록 없음 (next_action SUBMIT)
// - 제출완료: status=성공, 제출 기록 있음 (next_action DONE)
// - 취소: 서버 목록에는 안 나온다(DRAFT-STATUS-API.md 항목 1). 이 화면에서 방금 취소한 건만 보여 준다
// - 반려는 '전체'에만 나온다
// 탭은 여러 개지만 패널은 하나(내용만 바뀜). 모든 탭이 이 패널 하나를 가리킨다
const PANEL_ID = 'drafts-panel'
const TABS = [
  { key: 'all', label: '전체' },
  { key: 'writing', label: '작성중' },
  { key: 'reviewed', label: '검토완료' },
  { key: 'submitted', label: '제출완료' },
  { key: 'canceled', label: '취소' },
]

function categoryOf(d) {
  if (d.status === '취소') return 'canceled'
  if (d.status === '반려') return 'rejected'
  if (d.status === '성공') return d.submitted_at ? 'submitted' : 'reviewed'
  return 'writing'
}

const CATEGORY_PILL = {
  writing: { tone: 'soft', label: '작성중' },
  rejected: { tone: 'red', label: '반려' },
  reviewed: { tone: 'orange', label: '검토완료' },
  submitted: { tone: 'green', label: '제출완료' },
  canceled: { tone: 'grey', label: '취소' },
}

// 진행 단계 (draft.step 순서 + 마지막 '제출')
const PROGRESS = [
  { step: 'upload', label: '올리기' },
  { step: 'field_check', label: '항목 확인' },
  { step: 'prior_info', label: '사전 정보' },
  { step: 'writing', label: '작성' },
  { step: 'review', label: '검토' },
  { step: 'submit', label: '제출' },
]

/** 지금 머무는 단계 위치. 이보다 앞은 끝난 단계. PROGRESS.length 면 모두 끝남 */
function progressIndex(d) {
  if (d.status === '성공') return d.submitted_at ? PROGRESS.length : PROGRESS.length - 1
  const i = PROGRESS.findIndex((p) => p.step === d.step)
  return i < 0 ? 0 : i
}

// next_action → '다음 할 일' 문구와 이동 경로 (DRAFT-STATUS-API.md 항목 1 표).
// 버튼은 실제 서버에서 그 화면이 열리는 경우에만 둔다. 막다른 길이면 안내 문구만 보여 준다.
// - PRIOR_INFO·REVIEW: 화면이 아직 없다
// - UPLOAD: 서버에 upload → field_check 전이가 없어 /fields 로 가면 409 DRAFT_STEP_INVALID 에 막힌다
// - REJECTED: 같은 작성 건에 다시 올리는 API가 없다(DATA-MODEL.md 는 같은 건의 문서를 바꾼다고 적음).
//   /upload 로 보내면 새 작성 건이 생기고 반려 건은 목록에 그대로 남는다
// 단계 전이·재업로드 담당이 정해지면 cta·to 를 다시 붙인다.
const NEXT_ACTION = {
  UPLOAD: { title: '입력 항목 찾기를 기다리고 있어요', body: '올린 문서에서 적어야 할 칸을 찾는 다음 단계는 준비 중이에요.' },
  FIELD_CHECK: { title: '입력 항목을 확인해 주세요', body: 'AI가 찾은 칸이 원본과 같은지 확인해요.', cta: '입력 항목 확인하기', to: (id) => `/drafts/${id}/fields` },
  PRIOR_INFO: { title: '사전 정보를 입력해 주세요', body: '이름·생년월일처럼 자주 쓰는 정보를 먼저 저장해요. (화면 준비 중)' },
  WRITING: { title: '가상 작성을 이어서 해 주세요', body: '실제 신청서와 같은 모양에서 미리 적어 봐요.', cta: '가상 작성 이어하기', to: (id) => `/drafts/${id}/write` },
  REVIEW: { title: '작성한 내용을 검토해 주세요', body: '빠진 칸과 틀린 형식이 없는지 마지막으로 확인해요. (화면 준비 중)' },
  REJECTED: { title: '이 작성 건은 더 진행할 수 없어요', body: '' },
  SUBMIT: { title: '공식 사이트에서 직접 제출해 주세요', body: "제출을 마쳤다면 '제출 완료'를 눌러 기록을 남겨요. 디딤돌은 기관에 아무것도 보내지 않아요." },
  DONE: { title: '할 일을 모두 마쳤어요', body: '제출 기록이 남아 있어요.' },
}

const EMPTY_TEXT = {
  all: '아직 올린 문서가 없어요.',
  writing: '작성 중인 문서가 없어요.',
  reviewed: '검토를 마치고 제출을 기다리는 문서가 없어요.',
  submitted: '제출 완료로 표시한 문서가 없어요.',
  canceled: '이번에 취소한 문서가 없어요.',
}

const dateFormat = new Intl.DateTimeFormat('ko-KR', { dateStyle: 'medium', timeStyle: 'short' })
const formatDate = (iso) => {
  const d = new Date(iso)
  return Number.isNaN(d.getTime()) ? iso : dateFormat.format(d)
}

// F-08 내 작성 목록 (US-06 제출 기록, US-07 취소)
// - 목록은 '취소'를 뺀 전체를 한 번 받아 탭 필터는 화면에서 나눈다 (검토완료·제출완료가 submitted_at 으로만 갈려 서버 필터로 못 나눔)
// - '제출 완료'는 사용자가 공식 사이트에서 직접 제출한 뒤 누르는 기록용 버튼이다. 상태(status)는 그대로다 (R10)
// - 취소는 되돌릴 수 없고, 서버가 업로드 문서·입력값을 지운다 (R12, T3)
export default function DraftListPage() {
  const { status: authStatus, setLoggedOut } = useAuth()
  const [loadState, setLoadState] = useState({ status: 'loading', error: null })
  const [drafts, setDrafts] = useState([])
  const [canceled, setCanceled] = useState([]) // 이 화면에서 취소한 건 (서버 목록에는 없음)
  const [tab, setTab] = useState('all')
  const [ask, setAsk] = useState(null) // { type: 'submit' | 'cancel', draft, open }. 닫혀도 내용은 남겨 닫히는 동안 문구가 안 바뀐다
  const closeAsk = () => setAsk((a) => (a ? { ...a, open: false } : a))
  const [busyId, setBusyId] = useState(null)
  const [toast, setToast] = useState(null)

  const fetchDrafts = useCallback(
    (isCancelled = () => false) =>
      listDrafts()
        .then((data) => {
          if (isCancelled()) return
          setDrafts(data.drafts)
          setLoadState({ status: 'ready', error: null })
        })
        .catch((e) => {
          if (isCancelled()) return
          if (e?.code === 'LOGIN_REQUIRED') setLoggedOut()
          setLoadState({ status: 'error', error: e })
        }),
    [setLoggedOut],
  )

  useEffect(() => {
    if (authStatus !== 'authenticated') return
    let cancelled = false
    fetchDrafts(() => cancelled)
    return () => {
      cancelled = true
    }
  }, [authStatus, fetchDrafts])

  function retry() {
    setLoadState({ status: 'loading', error: null })
    fetchDrafts()
  }

  const counts = useMemo(() => {
    const c = { all: drafts.length, writing: 0, reviewed: 0, submitted: 0, canceled: canceled.length }
    for (const d of drafts) {
      const cat = categoryOf(d)
      if (cat in c) c[cat] += 1
    }
    return c
  }, [drafts, canceled])

  const visible = useMemo(() => {
    const list = tab === 'canceled' ? canceled : tab === 'all' ? drafts : drafts.filter((d) => categoryOf(d) === tab)
    // 최근 것이 위로
    return [...list].sort((a, b) => b.id - a.id)
  }, [tab, drafts, canceled])

  async function handleConfirm() {
    if (!ask?.open) return
    const { type, draft } = ask
    closeAsk()
    setBusyId(draft.id)
    try {
      if (type === 'submit') {
        const res = await submitDraft(draft.id)
        setDrafts((list) => list.map((d) => (d.id === res.id ? { ...d, status: res.status, submitted_at: res.submitted_at, next_action: 'DONE' } : d)))
        // 검토완료 탭에서 눌렀다면 카드가 사라지지 않게 제출완료 탭으로 따라간다
        setTab((t) => (t === 'reviewed' ? 'submitted' : t))
        setToast({ severity: 'success', text: '제출 완료로 기록했어요.' })
      } else {
        const res = await cancelDraft(draft.id)
        setDrafts((list) => list.filter((d) => d.id !== res.id))
        setCanceled((list) => [{ ...draft, status: res.status, next_action: null }, ...list.filter((d) => d.id !== res.id)])
        setTab('canceled')
        setToast({ severity: 'success', text: draft.submitted_at ? '디딤돌에 남은 기록을 지웠어요.' : '작성 건을 취소했어요.' })
      }
    } catch (e) {
      if (e?.code === 'LOGIN_REQUIRED') setLoggedOut()
      setToast({ severity: 'error', text: errorText(e) })
      // 이미 처리됐거나 없어진 건이면 서버 기준으로 다시 맞춘다
      if (['ALREADY_SUBMITTED', 'ALREADY_CANCELED', 'DRAFT_NOT_FOUND', 'DRAFT_NOT_READY'].includes(e?.code)) fetchDrafts()
    } finally {
      setBusyId(null)
    }
  }

  const askSubmitted = Boolean(ask?.draft?.submitted_at)

  const hero = (
    <PageHero
      step={null}
      overline="내 작성 목록"
      title="작성 건마다 지금 할 일을 알려 드려요"
      description="공식 사이트에서 직접 제출했다면 '제출 완료'를 눌러 기록을 남겨 두세요."
    />
  )

  if (authStatus === 'anonymous') {
    return (
      <>
        {hero}
        <Container sx={{ py: 6 }}>
          <LoginRequired />
        </Container>
      </>
    )
  }

  return (
    <>
      {hero}
      <Container sx={{ py: { xs: 4, md: 6 } }}>
        <FilterTabs tab={tab} onChange={setTab} counts={counts} disabled={loadState.status !== 'ready'} />

        {tab === 'canceled' && (
          <Typography variant="body2" sx={{ color: ds.text2, mt: 2 }}>
            취소한 작성 건은 업로드한 문서와 입력값이 지워지고, 새로고침하면 목록에서 사라져요.
          </Typography>
        )}

        <Box role="tabpanel" id={PANEL_ID} aria-labelledby={`drafts-tab-${tab}`} sx={{ mt: 3 }}>
          {(loadState.status === 'loading' || authStatus !== 'authenticated') && (
            <Stack spacing={2} aria-busy="true" aria-label="불러오는 중">
              {[0, 1, 2].map((i) => (
                <Skeleton key={i} variant="rounded" height={180} sx={{ ...squircle(radius.card) }} />
              ))}
            </Stack>
          )}

          {loadState.status === 'error' && authStatus === 'authenticated' && (
            <Box sx={{ p: { xs: 3, md: 4 }, bgcolor: ds.redSoft, ...squircle(radius.card) }} role="alert">
              <Stack direction="row" spacing={1} sx={{ alignItems: 'center', color: ds.red }}>
                <AlertCircleIcon size={20} />
                <Typography sx={{ fontWeight: 600 }}>{errorText(loadState.error)}</Typography>
              </Stack>
              <Button variant="contained" onClick={retry} sx={{ mt: 2 }}>
                다시 시도
              </Button>
            </Box>
          )}

          {loadState.status === 'ready' && authStatus === 'authenticated' && visible.length === 0 && (
            <EmptyState text={EMPTY_TEXT[tab]} showUpload={tab === 'all' || tab === 'writing'} />
          )}

          {loadState.status === 'ready' && authStatus === 'authenticated' && visible.length > 0 && (
            <Stack component="ul" spacing={2} sx={{ listStyle: 'none', m: 0, p: 0 }}>
              {visible.map((d) => (
                <DraftCard
                  key={d.id}
                  draft={d}
                  busy={busyId === d.id}
                  onSubmit={() => setAsk({ type: 'submit', draft: d, open: true })}
                  onCancel={() => setAsk({ type: 'cancel', draft: d, open: true })}
                />
              ))}
            </Stack>
          )}
        </Box>
      </Container>

      <Dialog open={Boolean(ask?.open && ask.type === 'submit')} onClose={closeAsk} aria-labelledby="submit-title">
        <DialogTitle id="submit-title">공식 사이트에서 제출을 마치셨나요?</DialogTitle>
        <DialogContent>
          <DialogContentText>
            디딤돌은 기관에 아무것도 보내지 않아요. &lsquo;제출 완료&rsquo;는 직접 제출했다는 기록만 남기고, 한 번 남기면 지울 수 없어요.
          </DialogContentText>
        </DialogContent>
        <DialogActions sx={{ px: 3, pb: 2 }}>
          <Button onClick={closeAsk}>아직 안 했어요</Button>
          <Button variant="contained" onClick={handleConfirm}>
            제출 완료로 기록
          </Button>
        </DialogActions>
      </Dialog>

      {/* 제출 기록이 있는 건의 취소는 실제 신청 취소가 아니라 디딤돌에 남은 연습 데이터 삭제다 (#109).
          제출 후 취소를 허용할지는 팀 투표 전이다 (DRAFT-STATUS-API.md 항목 3) */}
      <Dialog open={Boolean(ask?.open && ask.type === 'cancel')} onClose={closeAsk} aria-labelledby="cancel-title">
        <DialogTitle id="cancel-title">{askSubmitted ? '디딤돌에 남은 기록을 지울까요?' : '이 작성 건을 취소할까요?'}</DialogTitle>
        <DialogContent>
          <DialogContentText>
            {askSubmitted
              ? '공식 사이트의 신청은 취소되지 않아요. 디딤돌에 남은 문서와 입력값만 지워요. 지우면 되돌릴 수 없고, 저장해 둔 사전 정보는 그대로 남아요.'
              : '취소하면 되돌릴 수 없어요. 올린 문서와 입력한 값이 모두 지워져요. 저장해 둔 사전 정보는 그대로 남아요.'}
          </DialogContentText>
        </DialogContent>
        <DialogActions sx={{ px: 3, pb: 2 }}>
          <Button onClick={closeAsk}>{askSubmitted ? '그대로 둘게요' : '계속 작성할게요'}</Button>
          <Button variant="contained" color="error" onClick={handleConfirm}>
            {askSubmitted ? '디딤돌 기록 지우기' : '작성 건 취소'}
          </Button>
        </DialogActions>
      </Dialog>

      <Snackbar
        open={Boolean(toast)}
        autoHideDuration={3500}
        onClose={() => setToast(null)}
        message={toast?.text}
        anchorOrigin={{ vertical: 'top', horizontal: 'center' }}
        sx={{ top: { xs: 76, sm: 92 } }}
        slotProps={{
          content: {
            role: toast?.severity === 'error' ? 'alert' : 'status',
            sx: { bgcolor: toast?.severity === 'error' ? ds.red : ds.ink, ...squircle(radius.full), px: 3, fontSize: 14, fontWeight: 500, boxShadow: ds.floatShadow, justifyContent: 'center' },
          },
        }}
      />
    </>
  )
}

function FilterTabs({ tab, onChange, counts, disabled }) {
  function onKeyDown(e) {
    // 좌우 화살표·Home·End 로 탭 이동 (WAI-ARIA tabs 패턴)
    const i = TABS.findIndex((t) => t.key === tab)
    const target = {
      ArrowRight: (i + 1) % TABS.length,
      ArrowLeft: (i + TABS.length - 1) % TABS.length,
      Home: 0,
      End: TABS.length - 1,
    }[e.key]
    if (target === undefined) return
    e.preventDefault()
    const next = TABS[target]
    onChange(next.key)
    document.getElementById(`drafts-tab-${next.key}`)?.focus()
  }

  return (
    <Box
      role="tablist"
      aria-label="작성 상태로 거르기"
      onKeyDown={onKeyDown}
      sx={{ display: 'flex', gap: 1, overflowX: 'auto', pb: 0.5, mx: { xs: -0.5, sm: 0 }, px: { xs: 0.5, sm: 0 }, scrollbarWidth: 'none' }}
    >
      {TABS.map((t) => {
        const on = tab === t.key
        return (
          <ButtonBase
            key={t.key}
            id={`drafts-tab-${t.key}`}
            role="tab"
            aria-selected={on}
            aria-controls={PANEL_ID}
            tabIndex={on ? 0 : -1}
            onClick={() => onChange(t.key)}
            sx={{
              flexShrink: 0,
              gap: 0.75,
              height: 40,
              px: 2,
              ...squircle(radius.full),
              fontSize: 15,
              fontWeight: on ? 700 : 500,
              bgcolor: on ? ds.ink : ds.card,
              color: on ? ds.white : ds.text2,
              transition: 'background-color .15s ease',
              '&:hover': { bgcolor: on ? ds.inkHover : ds.cardHover },
              '&.Mui-focusVisible': { outline: `3px solid ${ds.primaryLine}`, outlineOffset: 2 },
            }}
          >
            {t.label}
            <Box component="span" sx={{ fontSize: 13, fontWeight: 600, opacity: on ? 0.8 : 1, color: on ? ds.white : ds.muted }}>
              {disabled ? '' : counts[t.key]}
            </Box>
          </ButtonBase>
        )
      })}
    </Box>
  )
}

function EmptyState({ text, showUpload }) {
  return (
    <Stack spacing={2} sx={{ p: { xs: 4, md: 6 }, bgcolor: ds.card, ...squircle(radius.card), alignItems: 'center', textAlign: 'center' }}>
      <Box sx={{ color: ds.muted }}>
        <DocumentIcon size={36} />
      </Box>
      <Typography sx={{ color: ds.text2 }}>{text}</Typography>
      {showUpload && (
        <Button variant="contained" startIcon={<UploadIcon size={18} />} onClick={() => navigate('/upload')}>
          서류 올리기
        </Button>
      )}
    </Stack>
  )
}

function DraftCard({ draft, busy, onSubmit, onCancel }) {
  const category = categoryOf(draft)
  const pill = CATEGORY_PILL[category]
  const isCanceled = category === 'canceled'
  const action = draft.next_action ? NEXT_ACTION[draft.next_action] : null
  const body =
    draft.next_action === 'REJECTED'
      ? `${REJECT_TEXT[draft.reject_reason] ?? '문서를 처리하지 못했어요.'} 같은 작성 건에 다시 올리는 기능은 준비 중이에요. 필요 없으면 이 작성 건을 취소해 주세요.`
      : action?.body
  const titleId = `draft-${draft.id}-title`

  return (
    <Box
      component="li"
      aria-labelledby={titleId}
      sx={{
        p: { xs: 2.5, md: 3.5 },
        // 취소 건은 투명도 대신 배경·테두리 색으로 약하게 보인다 (opacity 를 주면 text2·muted 글자가 4.5:1 아래로 떨어짐)
        bgcolor: isCanceled ? ds.card : ds.white,
        border: `1px ${isCanceled ? 'dashed' : 'solid'} ${isCanceled ? ds.lineStrong : ds.line}`,
        ...squircle(radius.card),
      }}
    >
      <Stack direction="row" spacing={1.5} sx={{ alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', rowGap: 1 }}>
        <Stack direction="row" spacing={1.5} sx={{ alignItems: 'center', minWidth: 0 }}>
          <Typography id={titleId} component="h2" sx={{ fontSize: 18, fontWeight: 700 }}>
            작성 건 #{draft.id}
          </Typography>
          {category === 'submitted' ? (
            // 초록 글자(green/greenSoft 3.03:1)는 글자 대비 미달 → 글자는 ink, 초록은 아이콘에만 (#13과 같은 방식)
            <Pill tone="green" size="sm" sx={{ color: ds.ink }}>
              <CheckCircleIcon size={12} color={ds.green} />
              {pill.label}
            </Pill>
          ) : (
            <Pill tone={pill.tone} size="sm">
              {pill.label}
            </Pill>
          )}
        </Stack>
        {draft.submitted_at && (
          <Typography variant="body2" sx={{ color: ds.text2 }}>
            제출 기록 {formatDate(draft.submitted_at)}
          </Typography>
        )}
      </Stack>

      <ProgressSteps draft={draft} />

      {isCanceled ? (
        <Typography variant="body2" sx={{ mt: 2.5, color: ds.text2 }}>
          {draft.submitted_at
            ? '디딤돌에 남은 기록을 지운 작성 건이에요. 공식 사이트의 신청은 그대로예요.'
            : '취소한 작성 건이에요. 올린 문서와 입력값은 지워졌어요.'}
        </Typography>
      ) : (
        <Stack
          direction={{ xs: 'column', md: 'row' }}
          spacing={2}
          sx={{
            mt: 2.5,
            p: { xs: 2, md: 2.5 },
            bgcolor: category === 'rejected' ? ds.redSoft : category === 'submitted' ? ds.greenSoft : ds.primarySoft,
            ...squircle(radius.inner),
            alignItems: { md: 'center' },
            justifyContent: 'space-between',
          }}
        >
          <Box sx={{ minWidth: 0 }}>
            <Typography variant="overline" component="div" sx={{ color: ds.text2, lineHeight: 1.6 }}>
              다음 할 일
            </Typography>
            <Stack direction="row" spacing={0.75} sx={{ alignItems: 'center' }}>
              {category === 'submitted' && <CheckCircleIcon size={18} color={ds.green} />}
              {category === 'rejected' && <AlertCircleIcon size={18} color={ds.red} />}
              <Typography sx={{ fontWeight: 700 }}>{action?.title}</Typography>
            </Stack>
            {body && (
              <Typography variant="body2" sx={{ color: ds.text2, mt: 0.5, wordBreak: 'keep-all' }}>
                {body}
              </Typography>
            )}
          </Box>
          <Stack direction="row" spacing={1} sx={{ flexShrink: 0 }}>
            {draft.next_action === 'SUBMIT' && (
              <Button
                variant="contained"
                onClick={onSubmit}
                disabled={busy}
                startIcon={busy ? <CircularProgress size={16} color="inherit" /> : <CheckCircleIcon size={18} />}
              >
                제출 완료
              </Button>
            )}
            {action?.cta && (
              <Button variant="contained" onClick={() => navigate(action.to(draft.id))} endIcon={<ArrowIcon size={18} />}>
                {action.cta}
              </Button>
            )}
          </Stack>
        </Stack>
      )}

      {!isCanceled && (
        <Box sx={{ mt: 1.5, display: 'flex', justifyContent: 'flex-end' }}>
          {/* 제출한 건은 실제 신청 취소로 오해하지 않게 '기록 지우기'로 부른다 (#109) */}
          <Button
            size="small"
            onClick={onCancel}
            disabled={busy}
            sx={{ color: ds.text2 }}
            aria-label={draft.submitted_at ? `작성 건 #${draft.id} 디딤돌 기록 지우기` : `작성 건 #${draft.id} 취소`}
          >
            {draft.submitted_at ? '디딤돌 기록 지우기' : '작성 건 취소'}
          </Button>
        </Box>
      )}
    </Box>
  )
}

function ProgressSteps({ draft }) {
  const current = progressIndex(draft)
  const rejected = draft.status === '반려'
  const canceled = draft.status === '취소'
  return (
    <Box
      component="ol"
      aria-label="진행 단계"
      sx={{ listStyle: 'none', m: 0, mt: 2.5, p: 0, display: 'grid', gridTemplateColumns: `repeat(${PROGRESS.length}, 1fr)`, gap: { xs: 0.5, sm: 1 } }}
    >
      {PROGRESS.map((p, i) => {
        const done = i < current
        const active = i === current
        const color = canceled ? ds.lineStrong : rejected && active ? ds.red : done ? ds.primary : active ? ds.ink : ds.line
        return (
          <Box component="li" key={p.step} aria-current={active ? 'step' : undefined} sx={{ minWidth: 0 }}>
            <Box sx={{ height: 6, bgcolor: color, ...squircle(radius.full) }} />
            <Typography
              variant="caption"
              sx={{
                position: 'relative',
                display: 'block',
                mt: 0.75,
                fontSize: 12,
                fontWeight: active ? 700 : 500,
                color: active && !canceled ? (rejected ? ds.red : ds.ink) : ds.muted,
                whiteSpace: 'nowrap',
                overflow: 'hidden',
                textOverflow: 'ellipsis',
              }}
            >
              <Box component="span" sx={{ position: 'absolute', left: 0, top: 0, width: '1px', height: '1px', m: '-1px', p: 0, overflow: 'hidden', clip: 'rect(0 0 0 0)', whiteSpace: 'nowrap', border: 0 }}>
                {done ? '완료: ' : active ? '현재: ' : ''}
              </Box>
              {p.label}
            </Typography>
          </Box>
        )
      })}
    </Box>
  )
}
