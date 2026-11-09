import { useCallback, useEffect, useMemo, useState } from 'react'
import { Box, Button, ButtonBase, CircularProgress, Collapse, Skeleton, Snackbar, Stack, Typography } from '@mui/material'
import { confirmFields, getFields, requestReanalysis } from '../api/fields.js'
import DocumentPreview from '../components/DocumentPreview.jsx'
import FieldEditSheet from '../components/FieldEditSheet.jsx'
import FieldRow from '../components/FieldRow.jsx'
import { CheckCircleIcon, ChevronIcon, SparkleIcon } from '../components/icons.jsx'
import PageHero from '../components/PageHero.jsx'
import { Container, Pill } from '../components/ui.jsx'
import { ds, radius, squircle } from '../theme.js'
import { validateFields } from '../utils/validateFields.js'

// 설명 언어 (실제 지원 언어는 고객사 답변 대기 — backlog US-02 미확정)
const LANGUAGES = [
  { code: 'ko', label: '한국어' },
  { code: 'vi', label: 'Tiếng Việt' },
]

// API 오류 코드 → 문구 (DESIGN.md "오류" 상태)
const ERROR_TEXT = {
  FIELD_INVALID: '확인이 필요한 항목이 있어요. 빨간 항목을 고쳐 주세요.',
  REANALYSIS_LIMIT: '다시 분석은 3번까지만 할 수 있어요. 직접 고쳐 주세요.',
  NO_FLAGGED_FIELD: "'원본과 달라요'로 표시한 항목이 없어요.",
  FORBIDDEN_DRAFT: '이 문서를 볼 수 있는 권한이 없어요.',
  DRAFT_NOT_FOUND: '문서를 찾을 수 없어요.',
  NETWORK_ERROR: '서버 연결 실패. 잠시 후 다시 시도해 주세요.',
}
const errorText = (e) => ERROR_TEXT[e?.code] ?? '문제가 생겼어요. 다시 시도해 주세요.'

// F-02 입력 항목 확인·수정 (US-02 확정, US-03 원본과 다름·재분석)
// - LLM(L1)이 찾은 항목은 'AI가 찾은 항목'으로 표시하고, 사용자가 '확인했어요'를 눌러야만 확정된다
// - 규칙 검증 오류가 1개라도 있으면 '확인했어요'를 막는다
export default function FieldCheckPage({ draftId, file, onDone, onReupload }) {
  const [lang, setLang] = useState('ko')
  const [loadState, setLoadState] = useState({ status: 'loading', error: null })
  const [draft, setDraft] = useState(null)
  const [formats, setFormats] = useState([])
  const [fields, setFields] = useState([])
  const [selectedId, setSelectedId] = useState(null)
  const [editingId, setEditingId] = useState(null)
  const [busy, setBusy] = useState(null) // 'confirm' | 'reanalyze' | null
  const [toast, setToast] = useState(null)
  const [confirmed, setConfirmed] = useState(null)
  const [previewOpen, setPreviewOpen] = useState(true)

  // 처음 불러오기와 '다시 시도'가 같이 쓴다. 언어를 바꿀 때는 changeLang 이 설명만 바꾼다 (사용자가 고친 값 유지)
  const fetchFields = useCallback(
    (isCancelled = () => false) =>
      getFields(draftId, 'ko')
        .then((data) => {
          if (isCancelled()) return
          setDraft(data.draft)
          setFormats(data.formats)
          setFields(data.fields)
          setLoadState({ status: 'ready', error: null })
        })
        .catch((e) => !isCancelled() && setLoadState({ status: 'error', error: e })),
    [draftId],
  )

  useEffect(() => {
    let cancelled = false
    fetchFields(() => cancelled)
    return () => {
      cancelled = true
    }
  }, [fetchFields])

  function retry() {
    setLang('ko')
    setLoadState({ status: 'loading', error: null })
    fetchFields()
  }

  // 언어 바꾸기: 설명(description)만 새 언어로 바꾸고, 사용자가 고친 항목 값은 그대로 둔다
  async function changeLang(next) {
    if (next === lang) return
    setLang(next)
    try {
      const data = await getFields(draftId, next)
      const byId = Object.fromEntries(data.fields.map((f) => [f.id, f.description]))
      setFields((prev) => prev.map((f) => ({ ...f, description: byId[f.id] ?? f.description })))
    } catch (e) {
      setToast(errorText(e))
    }
  }

  const fieldErrors = useMemo(() => validateFields(fields, formats), [fields, formats])
  const errorCount = Object.keys(fieldErrors).length
  const flaggedIds = fields.filter((f) => f.flagged_wrong).map((f) => f.id)
  const requiredCount = fields.filter((f) => f.required === true).length
  const optionalCount = fields.filter((f) => f.required === false).length
  const formatByCode = useMemo(() => Object.fromEntries(formats.map((f) => [f.code, f])), [formats])
  const reanalysisLeft = draft ? draft.reanalysis_limit - draft.reanalysis_count : 0
  const editingField = fields.find((f) => f.id === editingId)

  function select(id) {
    setSelectedId((cur) => (cur === id ? null : id))
    setPreviewOpen(true)
  }

  // 원본 칸을 눌렀을 때는 목록의 해당 항목이 보이게 스크롤
  function selectFromPreview(id) {
    setSelectedId(id)
    document.querySelector(`[data-field-id="${id}"]`)?.scrollIntoView({ behavior: 'smooth', block: 'center' })
  }

  function saveField(next) {
    setFields((prev) => prev.map((f) => (f.id === next.id ? next : f)))
    setEditingId(null)
    setSelectedId(next.id)
  }

  async function handleConfirm() {
    setBusy('confirm')
    try {
      const res = await confirmFields(draftId, fields)
      setConfirmed(res)
      window.scrollTo({ top: 0 })
    } catch (e) {
      setToast(errorText(e))
    } finally {
      setBusy(null)
    }
  }

  async function handleReanalyze() {
    setBusy('reanalyze')
    try {
      const data = await requestReanalysis(draftId, flaggedIds, lang)
      // '원본과 달라요'로 표시한 항목만 새 결과로 바꾸고, 사용자가 직접 고친 다른 항목은 그대로 둔다
      const mine = Object.fromEntries(fields.filter((f) => !f.flagged_wrong).map((f) => [f.id, f]))
      setDraft(data.draft)
      setFormats(data.formats)
      setFields(data.fields.map((f) => (mine[f.id] ? { ...mine[f.id], description: f.description } : f)))
      setSelectedId(null)
      window.scrollTo({ top: 0, behavior: 'smooth' })
      setToast('AI가 다시 살펴봤어요. 새 결과를 확인해 주세요.')
    } catch (e) {
      setToast(errorText(e))
    } finally {
      setBusy(null)
    }
  }

  if (confirmed) {
    return <ConfirmedView count={fields.length} requiredCount={requiredCount} onDone={onDone} onReupload={onReupload} />
  }

  if (loadState.status === 'loading') return <LoadingView />

  if (loadState.status === 'error') {
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
        description="원본과 같은지 확인해 주세요. 다르면 바로 고칠 수 있어요."
        aside={<LangToggle value={lang} onChange={changeLang} />}
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
                draftId={draftId}
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
                    format={formatByCode[f.format_code]}
                    errors={fieldErrors[f.id]}
                    selected={selectedId === f.id}
                    onSelect={select}
                    onEdit={setEditingId}
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

            <ActionCard
              errorCount={errorCount}
              flaggedCount={flaggedIds.length}
              reanalysisLeft={reanalysisLeft}
              busy={busy}
              onReanalyze={handleReanalyze}
              onConfirm={handleConfirm}
            />
          </Box>
        </Box>
      </Container>

      {editingField && (
        <FieldEditSheet
          key={editingField.id}
          open
          field={editingField}
          formats={formats}
          onClose={() => setEditingId(null)}
          onSave={saveField}
        />
      )}

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

function LangToggle({ value, onChange }) {
  return (
    <Box
      role="radiogroup"
      aria-label="설명 언어"
      sx={{ display: 'inline-flex', p: 0.5, gap: 0.5, bgcolor: 'rgba(255,255,255,.7)', ...squircle(radius.full), alignSelf: { xs: 'flex-start', md: 'auto' }, flexShrink: 0 }}
    >
      {LANGUAGES.map((l) => {
        const active = l.code === value
        return (
          <ButtonBase
            key={l.code}
            role="radio"
            aria-checked={active}
            onClick={() => onChange(l.code)}
            sx={{
              height: 38,
              px: 2,
              ...squircle(radius.full),
              fontSize: 14,
              fontWeight: 600,
              whiteSpace: 'nowrap',
              color: active ? ds.white : ds.text2,
              bgcolor: active ? ds.ink : 'transparent',
              transition: 'all .15s ease',
            }}
          >
            {l.label}
          </ButtonBase>
        )
      })}
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

function ConfirmedView({ count, requiredCount, onDone, onReupload }) {
  return (
    <>
      <PageHero step={2} overline="STEP 2 완료" title="입력할 칸을 확정했어요" description="다음은 자주 쓰는 정보(이름·연락처 등)를 한 번만 적어 두는 단계예요." />
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
              사전 정보 입력은 곧 열려요
            </Typography>
            <Stack direction={{ xs: 'column', sm: 'row' }} spacing={1.5}>
              <Button variant="contained" color="secondary" size="large" onClick={onDone}>
                처음으로
              </Button>
              <Button variant="outlined" size="large" onClick={onReupload}>
                다른 서류 올리기
              </Button>
            </Stack>
          </Stack>
        </Box>
      </Container>
    </>
  )
}
