import { useMemo, useState } from 'react'
import { Alert, Box, Button, CircularProgress, Stack, Typography } from '@mui/material'
import { CheckCircleIcon, ShieldIcon } from '../components/icons.jsx'
import PageHero from '../components/PageHero.jsx'
import PriorInfoField from '../components/prior-info/PriorInfoField.jsx'
import { Container } from '../components/ui.jsx'
import { PRIOR_INFO_FIELDS, PRIOR_INFO_KEYS } from '../i18n/priorInfo.js'
import { ds, radius, squircle } from '../theme.js'
import { groupPriorInfoErrors, validatePriorInfo } from '../utils/validatePriorInfo.js'

// 오류 코드 → 문구 (DESIGN.md "오류" 상태). F-03 API 명세가 나오면 그 오류 코드를 이 표에 더한다.
const ERROR_TEXT = {
  LOGIN_REQUIRED: '로그인이 필요해요. 다시 로그인해 주세요.',
  NETWORK_ERROR: '서버 연결 실패. 잠시 후 다시 시도해 주세요.',
}
const errorText = (code) => ERROR_TEXT[code] ?? '문제가 생겼어요. 다시 시도해 주세요.'

// F-03 사전 정보 입력·관리 (US-04)
// - 화면만 구현했다. F-03 API 명세가 아직 없어서 API 클라이언트·목데이터는 만들지 않았고,
//   데이터와 동작은 모두 props 로 받는다. 명세가 나오면 App 에서 api 모듈을 연결한다.
// - 데이터 모양은 DATA-MODEL.md prior_info 를 따른다.
//   savedInfo:    { [info_key]: value }  이 사용자가 이미 저장한 사전 정보
//   requiredKeys: 이 작성 건 입력 항목에 연결된 prior_info_key 목록. 주면 '작성 건 모드'(흐름 ③),
//                 안 주면 4개 전부를 고치는 '관리 모드'
//   serverErrors: 서버 규칙 엔진 결과 [{ info_key, code }] (화면 미리보기보다 먼저 보여 준다, R3)
// - status: 'loading'(불러오는 중) · 'idle' · 'saving' · 'error'
// - 저장된 값은 입력 칸에 자동으로 채운다(R11 "다시 묻지 않는다"). 작성 건 모드에서 필요한 값이
//   모두 저장돼 있으면 칸을 접고 바로 작성을 시작하게 한다(US-04).
// - savedInfo 가 바뀌면(저장 후 다시 불러옴) App 에서 key 를 바꿔 이 화면을 새로 그린다.
export default function PriorInfoPage({
  language = 'ko',
  savedInfo = {},
  requiredKeys,
  status = 'idle',
  errorCode = null,
  serverErrors = [],
  onSave,
  onStartWriting,
  onRetry,
  onBack,
}) {
  const draftMode = Array.isArray(requiredKeys)
  const keys = useMemo(
    () => (draftMode ? PRIOR_INFO_KEYS.filter((k) => requiredKeys.includes(k)) : PRIOR_INFO_KEYS),
    [draftMode, requiredKeys],
  )

  // 저장된 값으로 칸을 미리 채운다
  const [values, setValues] = useState(() => Object.fromEntries(keys.map((k) => [k, savedInfo[k] ?? ''])))
  // 미리보기 오류는 칸을 떠난 뒤(또는 저장을 누른 뒤)에만 보여 준다
  const [touched, setTouched] = useState({})
  const [triedSave, setTriedSave] = useState(false)
  // 서버 오류는 그 칸을 고치기 전까지 보여 준다
  const [editedSinceServer, setEditedSinceServer] = useState({})
  const allSaved = keys.length > 0 && keys.every((k) => (savedInfo[k] ?? '').trim())
  const [expanded, setExpanded] = useState(!(draftMode && allSaved))

  const server = groupPriorInfoErrors(serverErrors)
  const local = Object.fromEntries(keys.map((k) => [k, validatePriorInfo(k, values[k])]))
  const shownError = (k) => (!editedSinceServer[k] && server[k]) || ((touched[k] || triedSave) && local[k]) || null

  const invalidCount = keys.filter((k) => local[k]).length
  const changedKeys = keys.filter((k) => (values[k] ?? '').trim() !== (savedInfo[k] ?? '').trim())
  const saving = status === 'saving'
  const loading = status === 'loading'
  const canSubmit = Boolean(onSave) && !saving && !loading

  const change = (k, v) => {
    setValues((prev) => ({ ...prev, [k]: v }))
    setEditedSinceServer((prev) => ({ ...prev, [k]: true }))
  }
  const blur = (k) => setTouched((prev) => ({ ...prev, [k]: true }))

  const submit = () => {
    setTriedSave(true)
    // 비었거나 형식이 틀린 칸이 있으면 저장하지 않는다 (US-04 실패 조건)
    if (invalidCount > 0) return
    setEditedSinceServer({})
    onSave(Object.fromEntries(keys.map((k) => [k, values[k].trim()])))
  }

  const originOf = (k) => {
    const saved = (savedInfo[k] ?? '').trim()
    if (!saved) return null
    return values[k].trim() === saved ? 'saved' : 'edited'
  }

  return (
    <>
      <PageHero
        step={draftMode ? 2 : null}
        overline={draftMode ? '3단계 · 사전 정보 입력' : '내 정보'}
        title={draftMode ? '자주 쓰는 내 정보를 적어 두어요' : '내 사전 정보'}
        description="이름·생년월일·연락처·주소를 한 번 적어 두면 다음 문서에서는 다시 묻지 않고 칸에 미리 채워 드려요. 칸마다 뜻을 내 언어로 함께 보여 드려요."
      />

      <Container sx={{ py: { xs: 4, md: 6 } }}>
        {loading ? (
          <Stack sx={{ alignItems: 'center', py: 8 }} spacing={2} aria-live="polite">
            <CircularProgress />
            <Typography sx={{ color: ds.text2 }}>저장된 정보를 불러오고 있어요</Typography>
          </Stack>
        ) : keys.length === 0 ? (
          <EmptyState onStartWriting={onStartWriting} />
        ) : (
          <Stack direction={{ xs: 'column', md: 'row' }} spacing={{ xs: 3, md: 4 }} sx={{ alignItems: 'flex-start' }}>
            <Stack spacing={3} sx={{ flex: 1, minWidth: 0, width: '100%' }}>
              {status === 'error' && (
                <Alert
                  severity="error"
                  action={onRetry && <Button color="inherit" size="small" onClick={onRetry}>다시 시도</Button>}
                >
                  {errorText(errorCode)}
                </Alert>
              )}

              {draftMode && allSaved && !expanded ? (
                <SavedSummary keys={keys} savedInfo={savedInfo} onEdit={() => setExpanded(true)} />
              ) : (
                <Stack component="ul" spacing={2} sx={{ m: 0, p: 0 }}>
                  {keys.map((k) => (
                    <PriorInfoField
                      key={k}
                      infoKey={k}
                      value={values[k]}
                      language={language}
                      origin={originOf(k)}
                      errorCode={shownError(k)}
                      disabled={saving}
                      onChange={change}
                      onBlur={blur}
                    />
                  ))}
                </Stack>
              )}
            </Stack>

            <SummaryPanel
              draftMode={draftMode}
              expanded={expanded}
              allSaved={allSaved}
              total={keys.length}
              invalidCount={invalidCount}
              changedCount={changedKeys.length}
              saving={saving}
              canSubmit={canSubmit}
              onSubmit={submit}
              onStartWriting={onStartWriting}
              onBack={onBack}
            />
          </Stack>
        )}
      </Container>
    </>
  )
}

// 작성 건 모드에서 필요한 값이 모두 저장돼 있을 때: 칸 대신 불러온 값을 보여 준다
function SavedSummary({ keys, savedInfo, onEdit }) {
  return (
    <Box sx={{ p: { xs: 2.5, md: 3 }, ...squircle(radius.card), bgcolor: ds.card }}>
      <Stack direction="row" spacing={1} sx={{ alignItems: 'center', color: ds.green }}>
        <CheckCircleIcon size={22} />
        <Typography variant="h3" component="h2" sx={{ fontSize: 20, color: ds.text }}>
          이 문서에 필요한 정보가 모두 있어요
        </Typography>
      </Stack>
      <Typography sx={{ color: ds.text2, mt: 1 }}>저장해 둔 정보를 작성 화면의 칸에 미리 채워 드릴게요.</Typography>
      <Stack component="dl" spacing={1.25} sx={{ m: 0, mt: 2.5, p: 2, ...squircle(radius.inner), bgcolor: ds.white }}>
        {keys.map((k) => (
          <Stack key={k} direction="row" spacing={2}>
            <Typography component="dt" sx={{ width: 80, flexShrink: 0, color: ds.muted, fontSize: 14 }}>
              {PRIOR_INFO_FIELDS[k].label}
            </Typography>
            <Typography component="dd" sx={{ m: 0, fontWeight: 600, wordBreak: 'break-all' }}>{savedInfo[k]}</Typography>
          </Stack>
        ))}
      </Stack>
      <Button color="inherit" onClick={onEdit} sx={{ mt: 2 }}>
        정보가 바뀌었어요, 고칠게요
      </Button>
    </Box>
  )
}

// 오른쪽(모바일은 아래) 요약: 남은 칸 수 → 저장(또는 바로 작성 시작)
function SummaryPanel({ draftMode, expanded, allSaved, total, invalidCount, changedCount, saving, canSubmit, onSubmit, onStartWriting, onBack }) {
  const skip = draftMode && allSaved && !expanded
  const done = total - invalidCount

  let heading
  if (skip) heading = '바로 작성을 시작해도 돼요'
  else if (invalidCount > 0) heading = `${invalidCount}칸을 더 확인해 주세요`
  else if (!draftMode && changedCount === 0) heading = '바뀐 내용이 없어요'
  else heading = '저장할 준비가 됐어요'

  const submitLabel = draftMode ? '저장하고 작성 시작' : '저장하기'

  return (
    <Box
      component="aside"
      aria-label="사전 정보 진행 상황"
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
          <Typography sx={{ fontSize: 13, fontWeight: 700, color: ds.muted }}>
            {draftMode ? '이 문서에 필요한 정보' : '사전 정보'} {done}/{total}칸
          </Typography>
          <Typography variant="h3" component="p" sx={{ fontSize: 22, mt: 0.5, wordBreak: 'keep-all' }} aria-live="polite">
            {heading}
          </Typography>
        </Box>

        {skip ? (
          <Button variant="contained" size="large" disabled={!onStartWriting} onClick={onStartWriting}>
            바로 작성 시작
          </Button>
        ) : (
          <Button
            variant="contained"
            size="large"
            disabled={!canSubmit || (!draftMode && changedCount === 0)}
            onClick={onSubmit}
            startIcon={saving ? <CircularProgress size={18} color="inherit" /> : null}
          >
            {saving ? '저장하고 있어요' : submitLabel}
          </Button>
        )}

        {!skip && invalidCount > 0 && (
          <Typography sx={{ fontSize: 13, color: ds.text2 }}>
            필요한 칸을 모두 형식에 맞게 써야 저장할 수 있어요.
          </Typography>
        )}

        <Stack direction="row" spacing={1} sx={{ alignItems: 'flex-start', p: 1.5, ...squircle(radius.inner), bgcolor: ds.card }}>
          <Box sx={{ color: ds.primaryDeep, flexShrink: 0, mt: '1px' }}>
            <ShieldIcon size={18} />
          </Box>
          <Typography sx={{ fontSize: 13, color: ds.text2 }}>
            사전 정보는 나만 보고 고칠 수 있고, AI에는 보내지 않아요.
          </Typography>
        </Stack>

        {onBack && (
          <Button color="inherit" onClick={onBack}>
            {draftMode ? '입력 항목 확인으로 돌아가기' : '돌아가기'}
          </Button>
        )}
      </Stack>
    </Box>
  )
}

// 이 문서에 사전 정보와 연결된 칸이 하나도 없을 때 (DESIGN.md "빈 화면")
function EmptyState({ onStartWriting }) {
  return (
    <Box sx={{ p: { xs: 3, md: 5 }, ...squircle(radius.card), bgcolor: ds.card, textAlign: 'center' }}>
      <Typography variant="h3" component="h2" sx={{ fontSize: 22 }}>이 문서에는 미리 적을 정보가 없어요</Typography>
      <Typography sx={{ color: ds.text2, mt: 1 }}>이름·연락처처럼 미리 채울 칸이 없는 문서예요. 바로 작성을 시작해요.</Typography>
      {onStartWriting && (
        <Button variant="contained" size="large" onClick={onStartWriting} sx={{ mt: 3 }}>
          작성 시작
        </Button>
      )}
    </Box>
  )
}
