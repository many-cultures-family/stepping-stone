import { useCallback, useEffect, useMemo, useState } from 'react'
import { Box, Button, ButtonBase, CircularProgress, Collapse, Dialog, DialogActions, DialogContent, DialogContentText, DialogTitle, Skeleton, Snackbar, Stack, Typography } from '@mui/material'
import { USE_MOCK } from '../api/client.js'
import { confirmFields, editField, getFields, inferFields, requestReanalysis } from '../api/fields.js'
import { REANALYSIS_LIMIT } from '../api/limits.js'
import { useAuth } from '../auth/useAuth.js'
import DocumentPreview from '../components/DocumentPreview.jsx'
import FieldEditSheet from '../components/FieldEditSheet.jsx'
import FieldRow from '../components/FieldRow.jsx'
import { CheckCircleIcon, ChevronIcon, SparkleIcon } from '../components/icons.jsx'
import LoginRequired from '../components/LoginRequired.jsx'
import PageHero from '../components/PageHero.jsx'
import { Container, Pill } from '../components/ui.jsx'
import { ds, radius, squircle } from '../theme.js'
import { groupErrors } from '../utils/validateFields.js'

// API 오류 코드 → 문구 (FIELD-CHECK-API.md 오류 코드, DESIGN.md "오류" 상태). 코드 → 문구는 이 표 한 곳에서만 고른다.
const ERROR_TEXT = {
  LOGIN_REQUIRED: '로그인이 필요해요. 다시 로그인해 주세요.',
  FORBIDDEN_DRAFT: '이 문서를 볼 수 있는 권한이 없어요.',
  DRAFT_NOT_FOUND: '문서를 찾을 수 없어요.',
  DRAFT_STEP_INVALID: '이 작성 건은 지금 입력 항목 확인 단계가 아니에요(이미 확정했거나 글자 인식 전이에요).',
  DRAFT_NOT_EDITABLE: '이 문서는 더 이상 고칠 수 없어요.',
  FIELD_NOT_FOUND: '항목을 찾을 수 없어요. 화면을 새로 불러와 주세요.',
  NO_FIELDS_FLAGGED: "'원본과 달라요'로 표시한 항목이 없어요.",
  REANALYSIS_LIMIT_EXCEEDED: '다시 분석은 3번까지만 할 수 있어요.',
  FIELDS_INVALID: '확인이 필요한 항목이 있어요. 빨간 항목을 확인해 주세요.',
  INVALID_FLAGGED_FIELD_IDS: '표시한 항목을 확인하지 못했어요. 화면을 새로 불러와 주세요.',
  // 422: 글자 인식(OCR)이 안 됐거나 실패한 문서. 다시 시도해도 같으니 문서를 다시 올리게 안내한다
  DOCUMENT_NOT_READY: '문서의 글자를 읽지 못했어요. 글자가 잘 보이게 다시 찍어서 올려 주세요.',
  LLM_CALL_FAILED: 'AI가 항목을 찾지 못했어요. 잠시 후 다시 시도해 주세요.',
  NETWORK_ERROR: '서버 연결 실패. 잠시 후 다시 시도해 주세요.',
}
const errorText = (e) => ERROR_TEXT[e?.code] ?? '문제가 생겼어요. 다시 시도해 주세요.'
// 이 코드들은 화면을 그대로 두고 안내만 해 줘도 되는 것이 아니라 다음 단계로 갈 수 없는 상태다. 다시 올리기는 DOCUMENT_NOT_READY 에서만 권한다
const BLOCKING_CODES = ['DRAFT_STEP_INVALID', 'DRAFT_NOT_EDITABLE', 'DOCUMENT_NOT_READY']

// F-02 입력 항목 확인 (US-02 확정, US-03 원본과 다름·재분석)
// - LLM(L1)이 찾은 항목은 'AI가 찾은 항목'으로 표시하고, 사용자가 '확인했어요'를 눌러야만 확정된다
// - 오류 판정은 서버 응답의 errors 가 기준이다. errors 가 1개라도 있으면 '확인했어요'를 막는다
// - '원본과 달라요' 표시는 재분석 요청 전까지는 화면 상태일 뿐 서버에 저장되지 않는다
// - 재분석하면 서버가 전체 목록을 새 id 로 바꾼다. 사용자가 고친 값은 모두 사라진다
export default function FieldCheckPage({ draftId, file, onDone, onNext, onReupload }) {
  const { status: authStatus, setLoggedOut } = useAuth()
  const [loadState, setLoadState] = useState({ status: 'loading', error: null })
  const [draft, setDraft] = useState(null)
  const [fields, setFields] = useState([])
  const [serverErrors, setServerErrors] = useState([])
  const [selectedId, setSelectedId] = useState(null)
  const [editingId, setEditingId] = useState(null)
  const [busy, setBusy] = useState(null) // 'confirm' | 'reanalyze' | null
  const [toast, setToast] = useState(null)
  const [confirmed, setConfirmed] = useState(null)
  const [previewOpen, setPreviewOpen] = useState(true)
  const [reanalyzeAsk, setReanalyzeAsk] = useState(false)

  const applyResponse = useCallback((data) => {
    setDraft(data.draft)
    setFields(data.fields)
    setServerErrors(data.errors ?? [])
  }, [])

  // 처음 불러오기와 '다시 시도'가 같이 쓴다. 먼저 GET 으로 저장된 항목을 읽는다(step 이 field_check 가 아니면 LLM 을 부르기 전에 409).
  // 항목이 하나도 없을 때만 최초 추론(inferFields)을 부른다.
  const fetchFields = useCallback(
    (isCancelled = () => false) =>
      getFields(draftId)
        .then((data) => (data.fields.length === 0 ? inferFields(draftId) : data))
        .then((data) => {
          if (isCancelled()) return
          applyResponse(data)
          setLoadState({ status: 'ready', error: null })
        })
        .catch((e) => {
          if (isCancelled()) return
          if (e?.code === 'LOGIN_REQUIRED') setLoggedOut()
          setLoadState({ status: 'error', error: e })
        }),
    [draftId, applyResponse, setLoggedOut],
  )

  useEffect(() => {
    if (authStatus !== 'authenticated') return
    let cancelled = false
    fetchFields(() => cancelled)
    return () => {
      cancelled = true
    }
  }, [authStatus, fetchFields])

  function retry() {
    setLoadState({ status: 'loading', error: null })
    fetchFields()
  }

  // 401 은 머리 영역까지 로그아웃으로 맞춘다
  function handleApiError(e) {
    if (e?.code === 'LOGIN_REQUIRED') setLoggedOut()
    setToast(errorText(e))
  }

  const fieldErrors = useMemo(() => groupErrors(serverErrors), [serverErrors])
  const errorCount = Object.keys(fieldErrors).length
  const flaggedIds = fields.filter((f) => f.flagged_wrong).map((f) => f.id)
  const requiredCount = fields.filter((f) => f.required === true).length
  const optionalCount = fields.filter((f) => f.required === false).length
  const editingField = fields.find((f) => f.id === editingId)
  const reanalysisLeft = draft ? REANALYSIS_LIMIT - draft.reanalysis_count : 0

  function select(id) {
    setSelectedId((cur) => (cur === id ? null : id))
    setPreviewOpen(true)
  }

  // 원본 칸을 눌렀을 때는 목록의 해당 항목이 보이게 스크롤
  function selectFromPreview(id) {
    setSelectedId(id)
    document.querySelector(`[data-field-id="${id}"]`)?.scrollIntoView({ behavior: 'smooth', block: 'center' })
  }

  function toggleFlag(id) {
    setFields((prev) => prev.map((f) => (f.id === id ? { ...f, flagged_wrong: !f.flagged_wrong } : f)))
  }

  // [목 모드 전용] 수정 창 저장. 실서버에는 항목을 고치는 API가 없다
  function saveField(next) {
    const flagged = new Set(flaggedIds)
    const data = editField(draftId, next)
    setDraft(data.draft)
    setFields(data.fields.map((f) => ({ ...f, flagged_wrong: flagged.has(f.id) })))
    setServerErrors(data.errors ?? [])
    setEditingId(null)
    setSelectedId(next.id)
  }

  async function handleConfirm() {
    setBusy('confirm')
    try {
      const res = await confirmFields(draftId)
      setDraft(res.draft)
      setConfirmed(res)
      window.scrollTo({ top: 0 })
    } catch (e) {
      // 서버가 다시 검증해서 400 FIELDS_INVALID 와 errors 를 주면 그 errors 를 화면에 그린다
      if (e?.code === 'FIELDS_INVALID' && e.errors) setServerErrors(e.errors)
      handleApiError(e)
    } finally {
      setBusy(null)
    }
  }

  async function handleReanalyze() {
    setReanalyzeAsk(false)
    setBusy('reanalyze')
    try {
      const data = await requestReanalysis(draftId, flaggedIds)
      // 응답이 전체 목록 교체이고 id 가 새로 발급된다. 이전 목록과 합치지 않는다
      applyResponse(data)
      setSelectedId(null)
      window.scrollTo({ top: 0, behavior: 'smooth' })
      setToast('AI가 다시 살펴봤어요. 새 결과를 확인해 주세요.')
    } catch (e) {
      handleApiError(e)
    } finally {
      setBusy(null)
    }
  }

  if (authStatus === 'loading') return <LoadingView />

  if (authStatus === 'anonymous') {
    return (
      <Container sx={{ py: 6 }}>
        <LoginRequired />
      </Container>
    )
  }

  if (confirmed) {
    return <ConfirmedView count={fields.length} requiredCount={requiredCount} onDone={onDone} onNext={onNext} />
  }

  if (loadState.status === 'loading') return <LoadingView />

  if (loadState.status === 'error') {
    // 409·422: 재시도해도 소용없는 상태다. 내 작성 목록으로 안내한다
    if (BLOCKING_CODES.includes(loadState.error?.code)) {
      return (
        <EmptyState
          title="지금은 항목을 확인할 수 없어요"
          body={errorText(loadState.error)}
          action={
            <Stack direction="row" spacing={1.5}>
              <Button variant="contained" size="large" onClick={onDone}>내 작성 목록 보기</Button>
              {loadState.error?.code === 'DOCUMENT_NOT_READY' && (
                <Button variant="outlined" size="large" onClick={onReupload}>다시 올리기</Button>
              )}
            </Stack>
          }
        />
      )
    }
    return (
      <EmptyState
        title="항목을 불러오지 못했어요"
        body={errorText(loadState.error)}
        action={<Button variant="contained" size="large" onClick={retry}>다시 시도</Button>}
      />
    )
  }

  if (fields.length === 0) {
    return (
      <EmptyState
        title="입력할 칸을 찾지 못했어요"
        body="글자가 잘 보이게 다시 찍어서 올려 주세요."
        action={<Button variant="contained" size="large" onClick={onReupload}>다시 올리기</Button>}
      />
    )
  }

  return (
    <>
      <PageHero
        step={1}
        overline={
          <Stack direction="row" spacing={1} component="span" sx={{ alignItems: 'center' }}>
            <Pill tone="white" size="sm">
              <SparkleIcon size={11} color={ds.primary} />
              AI가 찾은 항목 · 확인 전
            </Pill>
          </Stack>
        }
        title={`입력할 칸 ${fields.length}개를 찾았어요`}
        description="원본과 같은지 확인해 주세요. 다르면 '원본과 달라요'를 눌러 AI에게 다시 살펴보게 할 수 있어요."
      >
        <Stack direction="row" spacing={1} sx={{ mt: 3, flexWrap: 'wrap', rowGap: 1 }}>
          <Stat label="필수" value={requiredCount} />
          <Stat label="선택" value={optionalCount} />
          {errorCount > 0 && <Stat label="확인 필요" value={errorCount} tone="red" />}
          {flaggedIds.length > 0 && <Stat label="원본과 다름" value={flaggedIds.length} tone="orange" />}
        </Stack>
      </PageHero>

      <Container sx={{ mt: { xs: 4, md: 6 } }}>
        <Box
          sx={{
            display: 'grid',
            gridTemplateColumns: { xs: 'minmax(0, 1fr)', lg: 'minmax(0, 5fr) minmax(0, 7fr)' },
            gap: { xs: 3, md: 4, lg: 5 },
            alignItems: 'start',
          }}
        >
          {/* 원본: 데스크톱은 스크롤해도 따라오고, 폰은 접을 수 있음 */}
          <Box sx={{ position: { lg: 'sticky' }, top: { lg: 96 }, minWidth: 0 }}>
            <Stack direction="row" sx={{ alignItems: 'center', justifyContent: 'space-between', mb: 2 }}>
              <Typography variant="h3" component="h2">
                올린 원본
              </Typography>
              <ButtonBase
                onClick={() => setPreviewOpen((v) => !v)}
                aria-expanded={previewOpen}
                sx={{ display: { xs: 'inline-flex', lg: 'none' }, gap: 0.5, color: ds.text2, fontSize: 14, ...squircle(radius.full), px: 1, py: 0.5 }}
              >
                {previewOpen ? '접기' : '펼치기'}
                <ChevronIcon size={18} direction={previewOpen ? 'up' : 'down'} />
              </ButtonBase>
            </Stack>
            <Collapse in={previewOpen}>
              <DocumentPreview
                file={file}
                fields={fields}
                selectedId={selectedId}
                onSelect={selectFromPreview}
                maxHeight={{ xs: 340, sm: 460, lg: 'calc(100vh - 170px)' }}
              />
            </Collapse>
          </Box>

          {/* 항목 목록 + 따라오는 확인 카드 */}
          <Box sx={{ minWidth: 0 }}>
            <Stack direction="row" sx={{ alignItems: 'baseline', justifyContent: 'space-between', mb: 2, gap: 2 }}>
              <Typography variant="h3" component="h2">
                입력 항목
              </Typography>
              <Typography variant="body2" sx={{ color: ds.text2, display: { xs: 'none', sm: 'block' } }}>
                항목을 누르면 원본에서 위치를 보여 드려요
              </Typography>
            </Stack>

            <Box sx={{ position: 'relative' }}>
              <Stack
                component="ol"
                spacing={1.5}
                sx={{ m: 0, p: 0, opacity: busy === 'reanalyze' ? 0.35 : 1, transition: 'opacity .2s' }}
              >
                {fields.map((f, i) => (
                  <FieldRow
                    key={f.id}
                    index={i}
                    field={f}
                    errors={fieldErrors[f.id]}
                    selected={selectedId === f.id}
                    onSelect={select}
                    onEdit={setEditingId}
                    onToggleFlag={toggleFlag}
                    disabled={busy !== null}
                  />
                ))}
              </Stack>
              {busy === 'reanalyze' && (
                <Box role="status" sx={{ position: 'absolute', inset: 0 }}>
                  <Stack spacing={2} sx={{ position: 'sticky', top: '40vh', alignItems: 'center', pt: 8 }}>
                    <CircularProgress size={36} thickness={5} />
                    <Typography sx={{ fontWeight: 600 }}>AI가 다시 살펴보고 있어요</Typography>
                  </Stack>
                </Box>
              )}
            </Box>

            <Typography variant="caption" sx={{ display: 'block', color: ds.text2, mt: 2 }}>
              항목 설명은 사용하는 언어로 한 번 만들어져요. 언어를 바꾼 뒤에는 다시 분석해야 설명이 바뀌어요.
            </Typography>

            <ActionCard
              errorCount={errorCount}
              flaggedCount={flaggedIds.length}
              reanalysisLeft={reanalysisLeft}
              busy={busy}
              onReanalyze={() => setReanalyzeAsk(true)}
              onConfirm={handleConfirm}
            />
          </Box>
        </Box>
      </Container>

      {USE_MOCK && editingField && (
        <FieldEditSheet
          key={editingField.id}
          open
          field={editingField}
          onClose={() => setEditingId(null)}
          onSave={saveField}
        />
      )}

      <Dialog open={reanalyzeAsk} onClose={() => setReanalyzeAsk(false)} aria-labelledby="reanalyze-title">
        <DialogTitle id="reanalyze-title">다시 분석할까요?</DialogTitle>
        <DialogContent>
          <DialogContentText>
            AI가 항목 전체를 새로 찾아요. 지금 고친 내용과 '원본과 달라요' 표시는 모두 사라지고 새 항목으로 바뀌어요.
            {Number.isFinite(reanalysisLeft) && ` (${reanalysisLeft}번 남음)`}
          </DialogContentText>
        </DialogContent>
        <DialogActions sx={{ px: 3, pb: 2 }}>
          <Button onClick={() => setReanalyzeAsk(false)}>취소</Button>
          <Button variant="contained" onClick={handleReanalyze}>다시 분석하기</Button>
        </DialogActions>
      </Dialog>

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

// 목록 아래에 붙어 따라오는(sticky) 확인 카드. 시안의 흰 떠 있는 카드 + 알약 버튼
function ActionCard({ errorCount, flaggedCount, reanalysisLeft, busy, onReanalyze, onConfirm }) {
  const ready = errorCount === 0
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
        <Typography sx={{ fontWeight: 700, fontSize: 15, color: ready ? ds.ink : ds.red }}>
          {ready ? '모든 칸을 확인할 수 있어요' : `확인이 필요한 항목 ${errorCount}개`}
        </Typography>
        <Typography variant="caption" sx={{ color: ds.text2 }}>
          {ready ? '원본과 같다면 확인을 눌러 주세요.' : '빨간 항목의 수정을 눌러 고쳐 주세요.'}
        </Typography>
      </Box>
      <Stack direction="row" spacing={1} sx={{ flexShrink: 0 }}>
        {flaggedCount > 0 && (
          <Button
            variant="outlined"
            size="large"
            disabled={busy !== null || reanalysisLeft <= 0}
            onClick={onReanalyze}
            sx={{ flex: { xs: 1, sm: 'none' } }}
          >
            {busy === 'reanalyze' ? (
              <Stack direction="row" spacing={1} sx={{ alignItems: 'center' }}>
                <CircularProgress size={18} thickness={5} />
                <span>다시 살펴보는 중</span>
              </Stack>
            ) : reanalysisLeft > 0 ? (
              `다시 분석 (${reanalysisLeft}번 남음)`
            ) : (
              '다시 분석 횟수 끝'
            )}
          </Button>
        )}
        <Button
          variant="contained"
          color="secondary"
          size="large"
          disabled={!ready || busy !== null}
          onClick={onConfirm}
          sx={{ flex: { xs: 1, sm: 'none' }, minWidth: 140 }}
        >
          {busy === 'confirm' ? <CircularProgress size={22} thickness={5} sx={{ color: 'white' }} /> : '확인했어요'}
        </Button>
      </Stack>
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
    <Box role="status" aria-label="항목을 불러오는 중">
      <PageHero step={1} overline="STEP 2" title="AI가 입력할 칸을 찾고 있어요" description="잠시만 기다려 주세요." />
      <Container sx={{ mt: { xs: 4, md: 6 } }}>
        <Box sx={{ display: 'grid', gridTemplateColumns: { xs: '1fr', lg: '5fr 7fr' }, gap: { xs: 3, lg: 5 } }}>
          <Skeleton variant="rounded" height={460} sx={{ ...squircle(radius.hero) }} />
          <Stack spacing={1.5}>
            {[0, 1, 2, 3, 4].map((i) => (
              <Skeleton key={i} variant="rounded" height={96} sx={{ ...squircle(radius.card) }} />
            ))}
          </Stack>
        </Box>
      </Container>
    </Box>
  )
}

function EmptyState({ title, body, action }) {
  return (
    <>
      <PageHero step={1} overline="STEP 2" title={title} description={body} />
      <Container sx={{ mt: 4 }}>{action}</Container>
    </>
  )
}

function ConfirmedView({ count, requiredCount, onDone, onNext }) {
  return (
    <>
      <PageHero step={2} overline="STEP 2 완료" title="입력할 칸을 확정했어요" description={onNext ? '다음 단계는 자주 쓰는 정보(이름·연락처 등)를 적어 두는 사전 정보 입력이에요.' : '다음 단계는 자주 쓰는 정보(이름·연락처 등)를 적어 두는 사전 정보 입력이에요. 이 단계는 준비 중이에요.'} />
      <Container sx={{ mt: { xs: 4, md: 6 } }}>
        <Box sx={{ display: 'grid', gridTemplateColumns: { xs: '1fr', md: '1fr 1fr' }, gap: 3, alignItems: 'stretch' }}>
          <Stack direction="row" spacing={3} sx={{ alignItems: 'center', flexWrap: 'wrap', rowGap: 2, bgcolor: ds.card, ...squircle(radius.card), p: { xs: 3, md: 4 } }}>
            <CheckCircleIcon size={56} color={ds.primary} />
            <Stack direction="row" spacing={5}>
              {[
                ['확정한 칸', count],
                ['필수 칸', requiredCount],
              ].map(([k, v]) => (
                <Box key={k}>
                  <Typography variant="caption" sx={{ color: ds.text2 }}>
                    {k}
                  </Typography>
                  <Typography sx={{ fontSize: 32, fontWeight: 700, lineHeight: 1.2 }}>{v}개</Typography>
                </Box>
              ))}
            </Stack>
          </Stack>
          <Stack
            spacing={2}
            sx={{ justifyContent: 'center', ...squircle(radius.card), background: ds.sky, p: { xs: 3, md: 4 } }}
          >
            <Typography variant="h3" component="p">
              {onNext ? '사전 정보를 입력하러 가요' : '다음 단계(사전 정보)는 준비 중이에요'}
            </Typography>
            <Stack direction={{ xs: 'column', sm: 'row' }} spacing={1.5}>
              {onNext && (
                <Button variant="contained" size="large" onClick={onNext}>
                  사전 정보 입력하기
                </Button>
              )}
              <Button variant={onNext ? 'outlined' : 'contained'} color={onNext ? 'inherit' : 'secondary'} size="large" onClick={onDone}>
                내 작성 목록 보기
              </Button>
            </Stack>
          </Stack>
        </Box>
      </Container>
    </>
  )
}
