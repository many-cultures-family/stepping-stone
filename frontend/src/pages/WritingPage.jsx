import { useEffect, useMemo, useRef, useState } from 'react'
import { Box, Button, CircularProgress, Stack, Typography } from '@mui/material'
import { USE_MOCK } from '../api/client.js'
import { getPriorInfo } from '../api/priorInfo.js'
import { getForm, getPriorInfoRules, pageImageUrl } from '../api/writing.js'
import { useAuth } from '../auth/useAuth.js'
import ExplainableText from '../components/explain/ExplainableText.jsx'
import { AlertCircleIcon, CheckCircleIcon, PenIcon, ShieldIcon } from '../components/icons.jsx'
import PageHero from '../components/PageHero.jsx'
import DiffLine from '../components/virtual-form/DiffLine.jsx'
import { Container, Pill } from '../components/ui.jsx'
import { MOCK_FIELDS } from '../mocks/writing.js'
import { navigate } from '../router.js'
import { ds, radius, squircle } from '../theme.js'
import { loadDraftInput, saveDraftInput } from '../utils/browserStore.js'
import { isMismatch, priorValueFor } from '../utils/priorMismatch.js'
import { fontFor, formatError, inputRect, isInput, joinDate, splitDate } from '../utils/writingLayout.js'

// F-04 가상 작성 (VIRTUAL-FORM-API.md 항목 1). 원본 페이지 이미지 위에, 칸 위치(bbox)마다 형식에 맞는 입력칸을 겹쳐 그린다.
// - 입력값은 서버에 보내지 않고(no-server-storage-user-input.md) 브라우저에만 둔다. [제안] sessionStorage(utils/browserStore.js):
//   새로고침해도 남고 탭을 닫으면 지워진다. 작성 건을 취소하거나 로그아웃해도 지운다 (보관 위치는 data-flow.md 5절 #3 팀 결정 전)
// - 형식 검사는 서버가 준 pattern 으로 브라우저가 한다 (R3, 규칙 출처는 서버 input_format 하나)
// - 서명(signature) 칸은 입력받지 않고 '직접 서명' 자리만 표시한다 (R10)
// - 실제 기관에 보내지 않는 연습 화면임을 알린다 (R4)
// - 불일치: 사전 정보와 짝지어진 칸(prior_info_key)에 저장된 값과 다르게 쓰면 주황으로 알린다. 판정은 브라우저가 한다
//   (VIRTUAL-FORM-API.md, utils/priorMismatch.js, 표기 맞춤 규칙은 GET /api/prior-info-rules). 이사 전 주소처럼 일부러 다르게 쓴 칸은 '그대로 둘게요'로 확인만 남긴다
//   (R3 예외). 확인은 그 값에만 붙어서, 값을 다시 고치면 다시 판정한다. 확인 기록도 입력값과 같이 브라우저에 둔다

// API 오류 코드 → 문구
const ERROR_TEXT = {
  DRAFT_STEP_INVALID: '이 작성 건은 아직 가상 작성 단계가 아니에요. 내 작성 목록에서 다음 할 일을 확인해 주세요.',
  DRAFT_NOT_EDITABLE: '반려되었거나 끝난 작성 건이라 고칠 수 없어요.',
  DRAFT_NOT_FOUND: '작성 건을 찾을 수 없어요.',
  FORBIDDEN_DRAFT: '이 작성 건을 볼 수 있는 권한이 없어요.',
  NETWORK_ERROR: '서버 연결 실패. 잠시 후 다시 시도해 주세요.',
}


export default function WritingPage({ draftId }) {
  const { setLoggedOut } = useAuth()
  const [state, setState] = useState({ status: 'loading', error: null, form: null })
  const [values, setValues] = useState({})
  const [touched, setTouched] = useState({})
  const [focusedId, setFocusedId] = useState(null)
  const [showMissing, setShowMissing] = useState(false)
  const [prior, setPrior] = useState({})
  const [priorRules, setPriorRules] = useState(null)
  // '그대로 둘게요'로 확인한 칸: { [field_id]: 확인할 때의 값 }. 값이 바뀌면 확인이 풀린다
  const [acks, setAcks] = useState({})
  const inputRefs = useRef({})
  const ready = state.status === 'ready'

  // 쓰는 값·확인 기록을 브라우저에 남긴다 (새로고침해도 이어서 쓰게). 불러오기 전 빈 값으로 덮어쓰지 않게 ready 뒤에만
  useEffect(() => {
    if (ready) saveDraftInput(draftId, { values, acks })
  }, [ready, draftId, values, acks])

  useEffect(() => {
    let cancelled = false
    getForm(draftId)
      .then(async (form) => {
        // 불일치 규칙을 못 받으면 불일치 표시만 끄고(null) 작성은 그대로 한다
        const [prior, rules] = await Promise.all([
          getPriorInfo().catch(() => ({})),
          getPriorInfoRules().catch(() => null),
        ])
        if (cancelled) return
        // 이 탭에서 쓰던 값이 있으면 그대로 이어서 쓴다 (새로고침). 지금 칸 목록에 있는 칸 값만 살린다
        const ids = new Set(form.fields.map((f) => String(f.field_id)))
        const pick = (obj) => Object.fromEntries(Object.entries(obj ?? {}).filter(([id]) => ids.has(id)))
        const saved = loadDraftInput(draftId)
        let initial
        if (saved) {
          initial = pick(saved.values)
          setAcks(pick(saved.acks))
        } else {
          // 처음 열면 사전 정보가 있는 칸을 미리 채운다
          initial = {}
          for (const f of form.fields) {
            if (f.prior_info_key && prior?.[f.prior_info_key]) initial[f.field_id] = prior[f.prior_info_key]
          }
        }
        setPrior(prior ?? {})
        setPriorRules(rules)
        setValues(initial)
        setState({ status: 'ready', error: null, form })
      })
      .catch((e) => {
        if (cancelled) return
        if (e?.code === 'LOGIN_REQUIRED') setLoggedOut()
        setState({ status: 'error', error: e, form: null })
      })
    return () => {
      cancelled = true
    }
  }, [draftId, setLoggedOut])

  // 위→아래, 왼→오 순서 (Tab 이동 순서도 이 순서)
  const fields = useMemo(() => {
    const list = state.form?.fields ?? []
    return [...list].sort((a, b) => (a.bbox.page - b.bbox.page) || (a.bbox.y - b.bbox.y) || (a.bbox.x - b.bbox.x))
  }, [state.form])

  const inputFields = fields.filter(isInput)
  const errors = Object.fromEntries(inputFields.map((f) => [f.field_id, formatError(f, values[f.field_id]?.trim())]))
  const missing = inputFields.filter((f) => f.required && !values[f.field_id]?.trim())
  const filledCount = inputFields.filter((f) => values[f.field_id]?.trim()).length
  const errorCount = Object.values(errors).filter(Boolean).length
  const focused = fields.find((f) => f.field_id === focusedId) ?? null

  // 불일치: 'mismatch' (아직 확인 안 함) · 'acknowledged' (그대로 두기로 함) · null
  const mismatch = Object.fromEntries(
    inputFields.map((f) => {
      const v = values[f.field_id]
      // 형식이 틀린 값은 형식 오류로만 알린다 (더 급한 문제이고, 덜 쓴 값이 '다름'으로 보이지 않게)
      if (errors[f.field_id] || !isMismatch(f, v, prior, priorRules)) return [f.field_id, null]
      return [f.field_id, f.field_id in acks && acks[f.field_id] === v ? 'acknowledged' : 'mismatch']
    }),
  )
  // 칸을 벗어났거나(touched) 전체 확인을 누른 칸만 센다. 쓰는 도중 글자마다 숫자가 바뀌지 않게
  const openMismatches = inputFields.filter((f) => mismatch[f.field_id] === 'mismatch' && (touched[f.field_id] || showMissing))

  function setValue(id, v) {
    setValues((prev) => ({ ...prev, [id]: v }))
  }

  function applySaved(field) {
    setValue(field.field_id, priorValueFor(field, prior))
    setAcks((prev) => {
      const next = { ...prev }
      delete next[field.field_id]
      return next
    })
  }

  function keepValue(field) {
    setAcks((prev) => ({ ...prev, [field.field_id]: values[field.field_id] }))
  }

  function focusField(id) {
    inputRefs.current[id]?.focus()
  }

  function checkAll() {
    setShowMissing(true)
    setTouched(Object.fromEntries(inputFields.map((f) => [f.field_id, true])))
    const first = inputFields.find((f) => errors[f.field_id] || (f.required && !values[f.field_id]?.trim()) || mismatch[f.field_id] === 'mismatch')
    if (first) focusField(first.field_id)
  }

  if (state.status === 'loading') {
    return (
      <Container sx={{ py: 10, display: 'grid', placeItems: 'center' }}>
        <CircularProgress aria-label="불러오는 중" />
      </Container>
    )
  }

  if (state.status === 'error') {
    return (
      <>
        <PageHero step={null} overline="가상 작성" title="작성 화면을 열 수 없어요" />
        <Container sx={{ py: 4 }}>
          <Box role="alert" sx={{ p: 3, bgcolor: ds.redSoft, ...squircle(radius.card) }}>
            <Typography sx={{ color: ds.red, fontWeight: 600 }}>
              {ERROR_TEXT[state.error?.code] ?? '문제가 생겼어요. 다시 시도해 주세요.'}
            </Typography>
            <Button variant="contained" sx={{ mt: 2 }} onClick={() => navigate('/drafts')}>
              내 작성 목록 보기
            </Button>
          </Box>
        </Container>
      </>
    )
  }

  const pageCount = Math.max(1, state.form.document?.page_count ?? 1, ...fields.map((f) => f.bbox.page))

  return (
    <>
      <PageHero
        step={null}
        overline="가상 작성 · 연습"
        title="실제 신청서 위에서 미리 써 보세요"
        description="종이의 빈칸·□를 눌러 실제처럼 써 보세요. 형식이 틀리면 바로 알려 드려요."
      />

      <Container sx={{ mt: { xs: 3, md: 5 }, pb: 8 }}>
        <Box sx={{ display: 'grid', gridTemplateColumns: { xs: 'minmax(0, 1fr)', lg: 'minmax(0, 1fr) 340px' }, gap: 3, alignItems: 'start' }}>
          {/* 원본 페이지 + 겹친 입력칸. 좁은 화면에서는 가로로 스크롤해 칸 크기를 지킨다 */}
          <Box sx={{ overflowX: 'auto', ...squircle(radius.hero), bgcolor: ds.card, p: { xs: 1.5, md: 3 } }}>
            <Stack spacing={3} sx={{ minWidth: 640 }}>
              {Array.from({ length: pageCount }, (_, i) => i + 1).map((page) => (
                <FormPage
                  key={page}
                  draftId={draftId}
                  page={page}
                  fields={fields.filter((f) => f.bbox.page === page)}
                  values={values}
                  errors={errors}
                  mismatch={mismatch}
                  touched={touched}
                  showMissing={showMissing}
                  focusedId={focusedId}
                  inputRefs={inputRefs}
                  onChange={setValue}
                  onFocus={setFocusedId}
                  onBlur={(id) => setTouched((t) => ({ ...t, [id]: true }))}
                />
              ))}
            </Stack>
          </Box>

          <Stack spacing={2} sx={{ position: { lg: 'sticky' }, top: { lg: 96 } }}>
            <FieldHelp
              field={focused}
              value={focused ? values[focused.field_id] : ''}
              error={focused ? errors[focused.field_id] : null}
              mismatch={focused && (touched[focused.field_id] || showMissing) ? mismatch[focused.field_id] : null}
              priorValue={focused ? priorValueFor(focused, prior) : ''}
              onUseSaved={() => applySaved(focused)}
              onKeep={() => keepValue(focused)}
            />

            <Box sx={{ ...squircle(radius.card), bgcolor: ds.card, p: 3 }}>
              <Typography variant="h4" component="h2" sx={{ mb: 1.5 }}>
                작성 현황
              </Typography>
              <Stack direction="row" spacing={1} sx={{ flexWrap: 'wrap', rowGap: 1 }}>
                <Pill tone="soft">
                  {filledCount}/{inputFields.length}칸 작성
                </Pill>
                {errorCount > 0 && <Pill tone="red">형식 확인 {errorCount}칸</Pill>}
                {showMissing && missing.length > 0 && <Pill tone="orange">필수 빈칸 {missing.length}칸</Pill>}
                {openMismatches.length > 0 && <Pill tone="orange">저장된 정보와 다름 {openMismatches.length}칸</Pill>}
                {showMissing && missing.length === 0 && errorCount === 0 && openMismatches.length === 0 && (
                  <Pill tone="green" sx={{ color: ds.ink }}>
                    <CheckCircleIcon size={12} color={ds.green} />
                    모두 확인했어요
                  </Pill>
                )}
              </Stack>
              {showMissing && openMismatches.length > 0 && (
                <Box sx={{ mt: 2 }}>
                  <Typography variant="body2" sx={{ color: ds.text2 }}>
                    저장된 정보와 다른 칸이에요. 눌러서 확인해 주세요.
                  </Typography>
                  <Stack direction="row" spacing={0.75} sx={{ mt: 1, flexWrap: 'wrap', rowGap: 0.75 }}>
                    {openMismatches.map((f) => (
                      <Button key={f.field_id} size="small" variant="outlined" color="warning" onClick={() => focusField(f.field_id)}>
                        {f.label}
                      </Button>
                    ))}
                  </Stack>
                </Box>
              )}
              <Stack direction={{ xs: 'column', sm: 'row', lg: 'column' }} spacing={1} sx={{ mt: 2.5 }}>
                <Button variant="contained" onClick={checkAll}>
                  빠진 칸·형식 확인
                </Button>
                <Button variant="outlined" onClick={() => navigate('/drafts')}>
                  내 작성 목록으로
                </Button>
              </Stack>
            </Box>

            <Stack direction="row" spacing={1.5} sx={{ ...squircle(radius.card), bgcolor: ds.primarySoft, p: 2.5, alignItems: 'flex-start' }}>
              <Box sx={{ color: ds.primary, pt: 0.25 }}>
                <ShieldIcon size={22} />
              </Box>
              <Typography variant="body2" sx={{ color: ds.primaryDeep, fontWeight: 600 }}>
                연습용 화면이에요. 여기 쓴 내용은 기관에 보내지 않고 서버에도 저장하지 않아요. 이 브라우저 탭에만 남고, 탭을 닫으면 지워져요.
              </Typography>
            </Stack>
          </Stack>
        </Box>
      </Container>
    </>
  )
}

function FormPage({ draftId, page, fields, values, errors, mismatch, touched, showMissing, focusedId, inputRefs, onChange, onFocus, onBlur }) {
  const url = pageImageUrl(draftId, page)
  const [imgState, setImgState] = useState(url ? 'loading' : 'ready')
  // 페이지 높이/폭 (칸 높이 → 글자 크기 계산용). 원본을 읽으면 실제 비율로 바꾼다
  const [ratio, setRatio] = useState(1.414)

  return (
    <Box
      aria-label={`${page}쪽`}
      role="group"
      sx={{
        position: 'relative',
        bgcolor: 'white',
        ...squircle(radius.inner),
        overflow: 'hidden',
        boxShadow: '0 2px 12px rgba(0,0,0,0.06)',
        // 입력칸 글자 크기를 페이지 폭에 맞춘다 (cqw = 이 상자 폭의 1%)
        containerType: 'inline-size',
      }}
    >
      {url ? (
        <>
          <Box
            component="img"
            src={url}
            alt={`올린 원본 ${page}쪽`}
            onLoad={(e) => {
              const { naturalWidth: w, naturalHeight: h } = e.currentTarget
              if (w && h) setRatio(h / w)
              setImgState('ready')
            }}
            onError={() => setImgState('error')}
            sx={{ display: 'block', width: '100%', minHeight: imgState === 'ready' ? 0 : 400 }}
          />
          {imgState === 'loading' && (
            <Box sx={{ position: 'absolute', inset: 0, display: 'grid', placeItems: 'center' }}>
              <CircularProgress size={28} aria-label="원본 불러오는 중" />
            </Box>
          )}
          {imgState === 'error' && (
            <Typography role="status" sx={{ position: 'absolute', top: 16, left: 0, right: 0, textAlign: 'center', color: ds.text2 }}>
              원본 {page}쪽을 불러오지 못했어요. 칸만 보여 드려요.
            </Typography>
          )}
        </>
      ) : (
        <MockPage />
      )}

      {fields.map((f) => (
        <OverlayField
          key={f.field_id}
          field={f}
          value={values[f.field_id] ?? ''}
          error={touched[f.field_id] ? errors[f.field_id] : null}
          missing={showMissing && f.required && isInput(f) && !values[f.field_id]?.trim()}
          warn={(touched[f.field_id] || showMissing) && mismatch[f.field_id] === 'mismatch'}
          focused={focusedId === f.field_id}
          ratio={ratio}
          registerInput={(el) => {
            inputRefs.current[f.field_id] = el
          }}
          onChange={(v) => onChange(f.field_id, v)}
          onFocus={() => onFocus(f.field_id)}
          onBlur={() => onBlur(f.field_id)}
        />
      ))}
    </Box>
  )
}

// 원본 종이에 펜으로 쓴 것처럼 보이게: 바탕은 거의 투명, 글자는 파란 잉크색. 비어 있을 때만 옅은 칠로 '여기 쓰는 곳'을 알린다
const INK = '#1D3FA0'
const pct = (r) => ({
  position: 'absolute',
  left: `${r.left * 100}%`,
  top: `${r.top * 100}%`,
  width: `${r.width * 100}%`,
  height: `${r.height * 100}%`,
})
const toRect = (b) => ({ left: b.x, top: b.y, width: b.w, height: b.h })

// warn = 저장된 정보와 다름 (형식 오류·빈칸(bad)이 더 급해서 bad 가 있으면 bad 색을 쓴다)
function paperSx({ bad, warn, focused, empty, height, ratio }) {
  return {
    boxSizing: 'border-box',
    m: 0,
    px: '0.25em',
    py: 0,
    border: 'none',
    borderBottom: `2px solid ${bad ? ds.red : warn ? ds.orange : focused ? ds.primary : empty ? 'rgba(65,105,214,0.45)' : 'transparent'}`,
    borderRadius: '3px 3px 0 0',
    bgcolor: bad ? 'rgba(253,236,236,0.85)' : warn ? 'rgba(255,242,226,0.9)' : focused ? 'rgba(236,241,252,0.9)' : empty ? 'rgba(65,105,214,0.09)' : 'transparent',
    color: INK,
    fontFamily: 'inherit',
    fontWeight: 600,
    fontSize: fontFor(height, ratio),
    lineHeight: 1.1,
    outline: 'none',
    transition: 'background-color .15s, border-color .15s',
    '&::placeholder': { color: 'rgba(65,105,214,0.55)', fontWeight: 500, opacity: 1 },
  }
}

function OverlayField({ field, value, error, missing, warn, focused, ratio, registerInput, onChange, onFocus, onBlur }) {
  const bad = Boolean(error) || missing
  // 화면 읽기 프로그램에도 불일치를 알린다 (색만으로 알리지 않는다)
  const label = `${field.label}${field.format_example ? ` (예: ${field.format_example})` : ''}${warn && !bad ? ', 저장된 정보와 달라요' : ''}`

  if (field.format_code === 'signature') {
    // 서명은 입력받지 않는다 (R10). '(인)' 자리에 표시만 하고, 눌러서 설명을 볼 수 있게 버튼으로 둔다
    const rect = inputRect(field)
    return (
      <Box
        component="button"
        type="button"
        ref={registerInput}
        onFocus={onFocus}
        title="실제 서류에 직접 서명하는 칸"
        aria-label={`${field.label}: 실제 서류에 직접 서명하는 칸`}
        sx={{
          ...pct(rect),
          p: 0,
          border: `2px dashed ${ds.orange}`,
          borderRadius: '999px',
          bgcolor: focused ? 'rgba(255,242,226,0.9)' : 'rgba(255,242,226,0.35)',
          color: ds.orange,
          display: 'grid',
          placeItems: 'center',
          cursor: 'pointer',
          '&:focus-visible': { outline: `3px solid ${ds.primaryLine}` },
        }}
      >
        <PenIcon size={14} />
      </Box>
    )
  }

  if (field.format_code === 'choice') {
    return <ChoiceField field={field} value={value} bad={bad} focused={focused} ratio={ratio} registerInput={registerInput} onChange={onChange} onFocus={onFocus} onBlur={onBlur} />
  }

  if (field.format_code === 'date' && field.part_bboxes) {
    return <DateParts field={field} value={value} bad={bad} warn={warn} focused={focused} ratio={ratio} registerInput={registerInput} onChange={onChange} onFocus={onFocus} onBlur={onBlur} />
  }

  const rect = inputRect(field)
  const common = {
    value,
    onFocus,
    onBlur,
    'aria-label': label,
    'aria-invalid': bad || undefined,
    'aria-required': field.required || undefined,
    onChange: (e) => onChange(e.target.value),
  }
  const sx = { ...pct(rect), ...paperSx({ bad, warn, focused, empty: !value, height: Math.min(rect.height, 0.03), ratio }) }

  if (field.format_code === 'long_text') {
    return <Box component="textarea" ref={registerInput} {...common} sx={{ ...sx, py: '0.2em', resize: 'none', lineHeight: 1.35 }} />
  }

  return (
    <Box
      component="input"
      ref={registerInput}
      {...common}
      type={field.format_code === 'email' ? 'email' : 'text'}
      inputMode={field.format_code === 'phone' || field.format_code === 'number' || field.format_code === 'date' ? 'numeric' : undefined}
      autoComplete="off"
      // 예시는 칸을 눌렀을 때만 옅게 보인다 (평소엔 종이처럼 비워 둔다)
      placeholder={focused ? (field.format_example ?? '') : ''}
      sx={sx}
    />
  )
}

// 선택형. 원본에 □ 상자가 있으면(option_bboxes) 그 상자에 바로 체크한다. 동의 여부처럼 하나만 고른다
function ChoiceField({ field, value, bad, focused, ratio, registerInput, onChange, onFocus, onBlur }) {
  const options = field.options?.length ? field.options : null
  const boxes = field.option_bboxes
  const select = (o) => onChange(value === o && !field.required ? '' : o)
  const keyNav = (e, i) => {
    if (!options) return
    const step = e.key === 'ArrowRight' || e.key === 'ArrowDown' ? 1 : e.key === 'ArrowLeft' || e.key === 'ArrowUp' ? -1 : 0
    if (!step) return
    e.preventDefault()
    const next = (i + step + options.length) % options.length
    onChange(options[next])
    e.currentTarget.parentElement?.querySelectorAll('[role=radio]')[next]?.focus()
  }

  if (!options) {
    // 보기를 못 받았으면 글자로 받는다
    const rect = inputRect(field)
    return (
      <Box
        component="input"
        ref={registerInput}
        value={value}
        aria-label={field.label}
        onFocus={onFocus}
        onBlur={onBlur}
        onChange={(e) => onChange(e.target.value)}
        sx={{ ...pct(rect), ...paperSx({ bad, focused, empty: !value, height: Math.min(rect.height, 0.03), ratio }) }}
      />
    )
  }

  const selectedIndex = options.indexOf(value)
  return (
    <Box role="radiogroup" aria-label={field.label} aria-required={field.required || undefined} aria-invalid={bad || undefined} sx={{ display: 'contents' }}>
      {options.map((o, i) => {
        const checked = value === o
        const tabbable = selectedIndex === -1 ? i === 0 : checked
        const ref = i === 0 ? registerInput : undefined
        if (boxes && boxes[i]) {
          // □ 위에 겹친 체크 상자. 누를 자리가 너무 작지 않게 상자보다 조금 크게 잡는다
          const b = boxes[i]
          const grow = Math.max(0, 0.024 - b.w) / 2
          const rect = { left: b.x - grow, top: b.y - grow / ratio, width: b.w + grow * 2, height: b.h + (grow * 2) / ratio }
          return (
            <Box
              key={o}
              component="button"
              type="button"
              role="radio"
              ref={ref}
              aria-checked={checked}
              aria-label={o}
              tabIndex={tabbable ? 0 : -1}
              onClick={() => select(o)}
              onKeyDown={(e) => keyNav(e, i)}
              onFocus={onFocus}
              onBlur={onBlur}
              sx={{
                ...pct(rect),
                p: 0,
                border: `2px solid ${bad ? ds.red : focused ? ds.primary : 'transparent'}`,
                borderRadius: '4px',
                bgcolor: bad ? 'rgba(253,236,236,0.6)' : checked ? 'transparent' : 'rgba(65,105,214,0.12)',
                color: INK,
                cursor: 'pointer',
                display: 'grid',
                placeItems: 'center',
                overflow: 'visible',
                '&:focus-visible': { outline: `3px solid ${ds.primaryLine}`, outlineOffset: 1 },
              }}
            >
              {checked && (
                <Box component="svg" viewBox="0 0 24 24" aria-hidden sx={{ width: '150%', height: '150%', overflow: 'visible', transform: 'translate(10%, -15%)' }}>
                  <path d="M3 13 L9.5 19 L22 3" fill="none" stroke={INK} strokeWidth="3.2" strokeLinecap="round" strokeLinejoin="round" />
                </Box>
              )}
            </Box>
          )
        }
        // 상자를 못 찾았으면 줄 자리에 보기를 나란히 둔다
        const r = inputRect(field)
        const w = r.width / options.length
        const rect = { left: r.left + w * i, top: r.top, width: w - 0.006, height: Math.min(r.height, 0.028) }
        return (
          <Box
            key={o}
            component="button"
            type="button"
            role="radio"
            ref={ref}
            aria-checked={checked}
            tabIndex={tabbable ? 0 : -1}
            onClick={() => select(o)}
            onKeyDown={(e) => keyNav(e, i)}
            onFocus={onFocus}
            onBlur={onBlur}
            sx={{
              ...pct(rect),
              px: '0.4em',
              border: `1.5px solid ${bad ? ds.red : checked ? INK : ds.primaryLine}`,
              borderRadius: '999px',
              bgcolor: checked ? INK : 'rgba(255,255,255,0.92)',
              color: checked ? 'white' : INK,
              fontFamily: 'inherit',
              fontWeight: 600,
              fontSize: fontFor(rect.height, ratio),
              whiteSpace: 'nowrap',
              overflow: 'hidden',
              textOverflow: 'ellipsis',
              cursor: 'pointer',
              '&:focus-visible': { outline: `3px solid ${ds.primaryLine}` },
            }}
          >
            {o}
          </Box>
        )
      })}
    </Box>
  )
}

// 날짜줄 '    년    월    일': 년·월·일 글자 앞 빈자리 세 곳에 따로 쓴다 (part_bboxes)
const DATE_PARTS = [
  { key: 'year', max: 4, name: '년', hint: 'YYYY' },
  { key: 'month', max: 2, name: '월', hint: 'MM' },
  { key: 'day', max: 2, name: '일', hint: 'DD' },
]

function DateParts({ field, value, bad, warn, focused, ratio, registerInput, onChange, onFocus, onBlur }) {
  const parts = splitDate(value)
  const refs = useRef({})
  const change = (key, raw, max, i) => {
    const v = raw.replace(/\D/g, '').slice(0, max)
    onChange(joinDate({ ...parts, [key]: v }))
    // 다 쓰면 다음 칸으로
    if (v.length === max && i < DATE_PARTS.length - 1) refs.current[DATE_PARTS[i + 1].key]?.focus()
  }
  return (
    <Box role="group" aria-label={field.label} sx={{ display: 'contents' }}>
      {DATE_PARTS.map(({ key, max, name, hint }, i) => {
        const r = toRect(field.part_bboxes[key])
        return (
          <Box
            key={key}
            component="input"
            ref={(el) => {
              refs.current[key] = el
              if (i === 0) registerInput(el)
            }}
            value={parts[key]}
            aria-label={`${field.label} ${name}${warn && !bad ? ', 저장된 정보와 달라요' : ''}`}
            aria-invalid={bad || undefined}
            aria-required={field.required || undefined}
            inputMode="numeric"
            autoComplete="off"
            maxLength={max}
            placeholder={focused ? hint : ''}
            onFocus={onFocus}
            onBlur={onBlur}
            onChange={(e) => change(key, e.target.value, max, i)}
            onKeyDown={(e) => {
              if (e.key === 'Backspace' && !parts[key] && i > 0) refs.current[DATE_PARTS[i - 1].key]?.focus()
            }}
            sx={{ ...pct(r), ...paperSx({ bad, warn, focused, empty: !parts[key], height: r.height, ratio }), textAlign: 'center', px: 0 }}
          />
        )
      })}
    </Box>
  )
}

// 지금 고른 칸의 설명·형식 예시·오류 (오른쪽 패널)
function FieldHelp({ field, value, error, mismatch, priorValue, onUseSaved, onKeep }) {
  if (!field) {
    return (
      <Box sx={{ ...squircle(radius.card), bgcolor: ds.white, border: `1px solid ${ds.line}`, p: 3 }}>
        <Typography sx={{ fontWeight: 700 }}>칸을 눌러 보세요</Typography>
        <Typography variant="body2" sx={{ color: ds.text2, mt: 0.5 }}>
          무엇을 어떤 형식으로 쓰는지 여기서 알려 드려요. 저장해 둔 사전 정보와 다르게 쓰면 주황색으로 알려 드려요.
        </Typography>
      </Box>
    )
  }
  const signature = field.format_code === 'signature'
  return (
    <Box aria-live="polite" sx={{ ...squircle(radius.card), bgcolor: ds.white, border: `1px solid ${ds.line}`, p: 3 }}>
      <Stack direction="row" spacing={1} sx={{ alignItems: 'center', flexWrap: 'wrap', rowGap: 1 }}>
        <Typography variant="h4" component="h2">
          {/* 칸 제목은 문서 속 글자라 설명(F-05)을 붙인다. 내가 쓴 값·사전 정보에는 붙이지 않는다 (L2에 보내면 안 됨) */}
          <ExplainableText text={field.label} />
        </Typography>
        {field.format_label && (
          <Pill tone={signature ? 'orange' : 'soft'} size="sm">
            {field.format_label}
          </Pill>
        )}
        {field.required && !signature && (
          <Pill tone="grey" size="sm">
            필수
          </Pill>
        )}
      </Stack>
      {field.description && (
        <Typography variant="body2" sx={{ color: ds.text2, mt: 1.5, wordBreak: 'keep-all' }}>
          {field.description}
        </Typography>
      )}
      {/* 선택형 보기도 문서 속 글자다. 종이 위 보기는 누르면 바로 골라지므로 설명은 여기서 본다 */}
      {field.options?.length > 0 && (
        <Box sx={{ mt: 1.5 }}>
          <Typography variant="body2" sx={{ fontWeight: 700 }}>
            보기
          </Typography>
          <Stack component="ul" spacing={0.5} sx={{ m: 0, mt: 0.5, pl: 2.5 }}>
            {field.options.map((o) => (
              <ExplainableText key={o} text={o} component="li" variant="body2" />
            ))}
          </Stack>
        </Box>
      )}
      {signature ? (
        <Typography variant="body2" sx={{ mt: 1.5, fontWeight: 600, color: ds.orange }}>
          디딤돌은 서명을 받지 않아요. 실제 서류나 공식 사이트에서 직접 서명해 주세요.
        </Typography>
      ) : (
        field.format_example && (
          <Typography variant="body2" sx={{ mt: 1.5 }}>
            예시 <Box component="span" sx={{ fontWeight: 700 }}>{field.format_example}</Box>
          </Typography>
        )
      )}
      {error && value && (
        <Stack direction="row" spacing={0.75} role="alert" sx={{ mt: 1.5, alignItems: 'center', color: ds.red }}>
          <AlertCircleIcon size={16} />
          <Typography variant="body2" sx={{ fontWeight: 600 }}>
            형식이 달라요. {field.format_example} 처럼 써 주세요.
          </Typography>
        </Stack>
      )}
      {mismatch && <MismatchNote state={mismatch} prior={priorValue} current={value ?? ''} onUseSaved={onUseSaved} onKeep={onKeep} />}
    </Box>
  )
}

// 저장된 정보(사전 정보)와 다른 칸: 글자 차이 + 두 가지 선택 (오른쪽 도움말 패널 안)
function MismatchNote({ state, prior, current, onUseSaved, onKeep }) {
  const kept = state === 'acknowledged'
  return (
    <Box sx={{ mt: 2, p: 2, bgcolor: ds.orangeSoft, ...squircle(radius.inner) }}>
      <Stack direction="row" spacing={0.75} sx={{ alignItems: 'center', color: ds.orange }}>
        <AlertCircleIcon size={16} />
        <Typography variant="body2" sx={{ fontWeight: 700 }}>
          {kept ? '일부러 다르게 쓴 칸으로 두었어요' : '저장된 정보와 달라요'}
        </Typography>
      </Stack>
      <Box sx={{ mt: 1.25, px: 1.5, py: 1, bgcolor: ds.white, ...squircle(radius.inner) }}>
        <Typography variant="caption" sx={{ color: ds.text2 }}>
          저장된 정보
        </Typography>
        <DiffLine prior={prior} current={current} mode="prior" />
        <Typography variant="caption" sx={{ color: ds.text2 }}>
          지금 쓴 값
        </Typography>
        <DiffLine prior={prior} current={current} mode="current" />
      </Box>
      {!kept && (
        <Typography variant="caption" component="p" sx={{ color: ds.text2, mt: 1 }}>
          이사 전 주소처럼 일부러 다르게 쓴 거라면 그대로 두세요.
        </Typography>
      )}
      <Stack direction="row" spacing={1} sx={{ mt: 1.25 }}>
        <Button variant="contained" size="small" onClick={onUseSaved} sx={{ flex: 1 }}>
          저장된 정보로 바꾸기
        </Button>
        {!kept && (
          <Button variant="outlined" size="small" color="inherit" onClick={onKeep} sx={{ flex: 1 }}>
            그대로 둘게요
          </Button>
        )}
      </Stack>
    </Box>
  )
}

// 목 모드 샘플 서식 (A4 비율). MOCK_FIELDS 위치에 라벨을 그린다. 실제 개인정보는 없다
function MockPage() {
  const W = 1000
  const H = 1414
  const rows = MOCK_FIELDS.filter((f) => f.bbox.w < 0.15)
  const top = Math.min(...rows.map((f) => f.bbox.y)) - 0.012
  const rowH = 0.045
  return (
    <svg viewBox={`0 0 ${W} ${H}`} width="100%" style={{ display: 'block' }} role="img" aria-label={USE_MOCK ? '샘플 신청서' : undefined}>
      <rect width={W} height={H} fill="#fff" />
      <text x={W / 2} y={0.075 * H} textAnchor="middle" fontSize="40" fontWeight="700" fill={ds.ink}>
        보육료 지원 신청서 (샘플)
      </text>
      <rect x={0.08 * W} y={top * H} width={0.84 * W} height={rows.length * rowH * H} fill="none" stroke={ds.ink} strokeWidth="2" />
      <line x1={0.3 * W} x2={0.3 * W} y1={top * H} y2={(top + rows.length * rowH) * H} stroke={ds.ink} strokeWidth="1.5" />
      {rows.map((f, i) => (
        <g key={f.field_id}>
          {i > 0 && <line x1={0.08 * W} x2={0.92 * W} y1={(top + i * rowH) * H} y2={(top + i * rowH) * H} stroke={ds.ink} strokeWidth="1.5" />}
          <text x={f.bbox.x * W} y={(f.bbox.y + f.bbox.h * 0.8) * H} fontSize="22" fill={ds.ink}>
            {f.label}
          </text>
        </g>
      ))}
      <text x={0.1 * W} y={0.413 * H} fontSize="20" fill={ds.ink}>
        ※ 개인정보 수집·이용에 동의합니까? 동의하지 않으면 지원이 제한될 수 있습니다.
      </text>
      <text x={0.588 * W} y={0.4395 * H} fontSize="22" fill={ds.ink} textAnchor="end">
        동의합니다
      </text>
      <rect x={0.6 * W} y={0.4295 * H} width="16" height="16" fill="none" stroke={ds.ink} strokeWidth="2" />
      <text x={0.848 * W} y={0.4395 * H} fontSize="22" fill={ds.ink} textAnchor="end">
        동의하지 않습니다
      </text>
      <rect x={0.86 * W} y={0.4295 * H} width="16" height="16" fill="none" stroke={ds.ink} strokeWidth="2" />
      <text x={0.3 * W} y={0.475 * H} fontSize="22" fill={ds.ink}>
        위와 같이 보육료 지원을 신청합니다.
      </text>
      {[
        ['년', 0.53],
        ['월', 0.61],
        ['일', 0.69],
      ].map(([t, x]) => (
        <text key={t} x={x * W} y={0.516 * H} fontSize="22" fill={ds.ink}>
          {t}
        </text>
      ))}
      <text x={0.38 * W} y={0.568 * H} fontSize="22" fill={ds.ink}>
        신청인 성명:
      </text>
      <line x1={0.5 * W} x2={0.76 * W} y1={0.569 * H} y2={0.569 * H} stroke={ds.ink} strokeWidth="1.5" />
      <text x={0.78 * W} y={0.567 * H} fontSize="18" fill={ds.ink}>
        (서명 또는 인)
      </text>
      <text x={W / 2} y={0.64 * H} textAnchor="middle" fontSize="34" fontWeight="700" fill={ds.ink}>
        가나구청장 귀하
      </text>
    </svg>
  )
}
