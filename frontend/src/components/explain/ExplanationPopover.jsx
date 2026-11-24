import { useEffect, useState } from 'react'
import { Alert, Box, Button, CircularProgress, IconButton, Popover, Stack, Typography } from '@mui/material'
import { EXPLAIN_MAX_LENGTH, TERM_MAX_LENGTH } from '../../api/explain.js'
import { ds, radius, squircle } from '../../theme.js'
import { CloseIcon, SparkleIcon } from '../icons.jsx'
import { Pill } from '../ui.jsx'

const ERROR_TEXT = {
  LLM_CALL_FAILED: 'AI 풀이를 받지 못했어요. 잠시 후 다시 시도해 주세요.',
  NETWORK_ERROR: '서버 연결 실패. 잠시 후 다시 시도해 주세요.',
  LOGIN_REQUIRED: '로그인이 필요해요. 다시 로그인해 주세요.',
  TEXT_TOO_LONG: `설명은 ${EXPLAIN_MAX_LENGTH}자까지 받을 수 있어요. 조금 짧게 골라 주세요.`,
  TEXT_NOT_IN_DOCUMENT: '신청서에 있는 글자만 풀이를 받을 수 있어요. 문서 글자에서 골라 주세요.',
  PII_REMAINING: '개인정보가 들어 있는 글자라 AI에게 보낼 수 없어요. 다른 부분을 골라 주세요.',
  EXPLANATION_LIMIT_EXCEEDED: '이 작성 건에서 받을 수 있는 AI 풀이 횟수를 다 썼어요.',
  DRAFT_STEP_INVALID: 'AI 풀이는 가상 작성·서술형 검토 단계에서 받을 수 있어요.',
  DRAFT_NOT_EDITABLE: '반려되었거나 끝난 작성 건이라 AI 풀이를 받을 수 없어요.',
}

/**
 * 단어·문장 설명 창 (F-05, R5)
 * 1) 창을 열면 용어 사전(GET /api/glossary?term=)을 묻고, 있으면 사전 설명을 먼저 보여 준다.
 * 2) '이해하지 못했어요'(사전에 없으면 'AI 쉬운 풀이 받기')를 눌러야 AI 풀이(L2)를 요청한다.
 * 3) AI 풀이는 'AI 풀이'로 표시하고, 사전 설명과 섞지 않는다. 상태(작성 건)는 바꾸지 않는다.
 * target: { text, anchor: { el } | { rect } }
 * lookup(text) → Promise<{ found, explanation? }>, requestEasy(text) → Promise<{ explanation }> 또는 null(작성 건 화면 밖)
 */
export default function ExplanationPopover({ target, language, lookup, requestEasy, onClose }) {
  const { text, anchor } = target
  // 사전은 50자까지만 묻는다. 그보다 긴 문장은 사전에 없는 것으로 보고 바로 AI 풀이를 권한다
  const askable = text.length <= TERM_MAX_LENGTH
  const [dict, setDict] = useState(askable ? { status: 'loading', term: null } : { status: 'done', term: null })
  const [ai, setAi] = useState({ status: 'idle', data: null, code: null })
  const tooLong = text.length > EXPLAIN_MAX_LENGTH

  useEffect(() => {
    if (!askable) return undefined
    let ignore = false
    lookup(text).then(
      (data) => !ignore && setDict({ status: 'done', term: data.found ? data : null }),
      // 사전을 못 불러와도 AI 풀이는 받을 수 있게 '사전에 없음'처럼 둔다
      () => !ignore && setDict({ status: 'done', term: null }),
    )
    return () => {
      ignore = true
    }
  }, [askable, lookup, text])

  const term = dict.term

  const askAi = async () => {
    setAi({ status: 'loading', data: null, code: null })
    try {
      const data = await requestEasy(text)
      setAi({ status: 'done', data, code: null })
    } catch (e) {
      setAi({ status: 'error', data: null, code: e.code ?? null })
    }
  }

  const position = anchor.rect
    ? { anchorReference: 'anchorPosition', anchorPosition: { top: anchor.rect.bottom, left: anchor.rect.left + anchor.rect.width / 2 } }
    : { anchorEl: anchor.el }

  return (
    <Popover
      open
      onClose={onClose}
      {...position}
      anchorOrigin={{ vertical: 'bottom', horizontal: 'center' }}
      transformOrigin={{ vertical: 'top', horizontal: 'center' }}
      slotProps={{
        paper: {
          role: 'dialog',
          'aria-label': `'${text}' 설명`,
          sx: { mt: 1, width: 'min(380px, calc(100vw - 32px))', p: 2.5, ...squircle(radius.tile), boxShadow: ds.floatShadow },
        },
      }}
    >
      <Stack direction="row" spacing={1} sx={{ alignItems: 'flex-start' }}>
        <Typography component="p" sx={{ fontWeight: 700, fontSize: 18, flexGrow: 1, wordBreak: 'keep-all', minWidth: 0 }}>
          {tooLong ? `${text.slice(0, 40)}…` : text}
        </Typography>
        <IconButton size="small" aria-label="설명 닫기" onClick={onClose} sx={{ mt: -0.5, mr: -1 }}>
          <CloseIcon size={18} />
        </IconButton>
      </Stack>

      {tooLong ? (
        <Typography sx={{ mt: 1.5, color: ds.text2 }}>{ERROR_TEXT.TEXT_TOO_LONG}</Typography>
      ) : (
        <>
          {dict.status === 'loading' ? (
            <Stack direction="row" spacing={1} role="status" sx={{ mt: 1.5, alignItems: 'center', color: ds.text2 }}>
              <CircularProgress size={16} />
              <Typography sx={{ fontSize: 14 }}>용어 사전에서 찾고 있어요</Typography>
            </Stack>
          ) : term ? (
            <Box sx={{ mt: 1.5 }}>
              <Pill tone="soft" size="sm">용어 사전</Pill>
              <Typography lang={language} sx={{ mt: 1, color: ds.text, wordBreak: 'keep-all' }}>
                {term.explanation}
              </Typography>
            </Box>
          ) : (
            <Typography sx={{ mt: 1.5, color: ds.text2, wordBreak: 'keep-all' }}>
              {requestEasy
                ? '용어 사전에 없는 말이에요. AI에게 쉬운 풀이를 받아 볼 수 있어요.'
                : '용어 사전에 없는 말이에요.'}
            </Typography>
          )}

          {dict.status === 'done' && requestEasy && ai.status === 'idle' && (
            <Button
              variant={term ? 'outlined' : 'contained'}
              size="small"
              onClick={askAi}
              startIcon={<SparkleIcon size={14} />}
              sx={{ mt: 2 }}
            >
              {term ? '이해하지 못했어요' : 'AI 쉬운 풀이 받기'}
            </Button>
          )}

          {ai.status === 'loading' && (
            <Stack direction="row" spacing={1} role="status" sx={{ mt: 2, alignItems: 'center', color: ds.text2 }}>
              <CircularProgress size={16} />
              <Typography sx={{ fontSize: 14 }}>AI가 쉬운 말로 풀고 있어요</Typography>
            </Stack>
          )}

          {ai.status === 'error' && (
            <Alert
              severity="error"
              sx={{ mt: 2 }}
              action={<Button color="inherit" size="small" onClick={askAi}>다시 시도</Button>}
            >
              {ERROR_TEXT[ai.code] ?? '문제가 생겼어요. 다시 시도해 주세요.'}
            </Alert>
          )}

          {ai.status === 'done' && (
            <Box aria-live="polite" sx={{ mt: 2, p: 1.75, ...squircle(radius.inner), bgcolor: ds.primarySoft }}>
              <Pill tone="white" size="sm" sx={{ border: `1px solid ${ds.primaryLine}` }}>
                <SparkleIcon size={12} />
                AI 풀이
              </Pill>
              <Typography lang={ai.data.language ?? language} sx={{ mt: 1, color: ds.ink, whiteSpace: 'pre-wrap', wordBreak: 'keep-all' }}>
                {ai.data.explanation}
              </Typography>
              <Typography sx={{ mt: 1, fontSize: 12, color: ds.text2 }}>
                AI가 만든 풀이라 틀릴 수 있어요. 중요한 내용은 신청하는 기관에 확인해 주세요.
              </Typography>
            </Box>
          )}
        </>
      )}
    </Popover>
  )
}
