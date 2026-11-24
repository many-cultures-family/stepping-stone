import { useState } from 'react'
import { Box, Button, CircularProgress, Stack, Typography } from '@mui/material'
import { getDocumentText } from '../../api/explain.js'
import { ds, radius, squircle } from '../../theme.js'
import ExplainableText from './ExplainableText.jsx'

const ERROR_TEXT = {
  DOCUMENT_NOT_READY: '아직 글자 인식이 끝나지 않은 문서예요.',
  NETWORK_ERROR: '서버 연결 실패. 잠시 후 다시 시도해 주세요.',
}

/**
 * 신청서 글자에서 뜻 찾기 (F-05, WORD-EXPLAIN-API.md 항목 3)
 * 서버가 가린 문서 글자(GET .../document/text)를 줄 목록으로 보여 주고, 낱말을 누르거나 끌어서 골라 설명을 받는다.
 * AI 풀이(항목 2)는 이 글자 안에 있는 말만 받을 수 있어서, 원본 이미지가 아니라 이 목록에서 고르게 한다.
 * 처음에는 접어 두고, 펼칠 때 한 번만 불러온다.
 */
export default function DocumentTextPanel({ draftId }) {
  const [open, setOpen] = useState(false)
  const [state, setState] = useState({ status: 'idle', lines: [], code: null })

  const load = () => {
    setState({ status: 'loading', lines: [], code: null })
    getDocumentText(draftId).then(
      (data) => setState({ status: 'done', lines: data.lines ?? [], code: null }),
      (e) => setState({ status: 'error', lines: [], code: e.code ?? null }),
    )
  }

  const toggle = () => {
    if (!open && state.status === 'idle') load()
    setOpen((v) => !v)
  }

  const pages = [...new Set(state.lines.map((l) => l.page ?? 1))]

  return (
    <Box sx={{ ...squircle(radius.card), bgcolor: ds.white, border: `1px solid ${ds.line}`, p: 3 }}>
      <Stack direction="row" spacing={1} sx={{ alignItems: 'center' }}>
        <Typography variant="h4" component="h2" sx={{ flexGrow: 1 }}>
          신청서 글자에서 뜻 찾기
        </Typography>
        <Button size="small" onClick={toggle} aria-expanded={open} aria-controls="document-text-lines">
          {open ? '접기' : '펼치기'}
        </Button>
      </Stack>
      <Typography variant="body2" sx={{ color: ds.text2, mt: 0.5, wordBreak: 'keep-all' }}>
        모르는 낱말을 누르거나, 여러 낱말을 끌어서 고르면 뜻을 알려 드려요. 개인정보는 가려져 있어요.
      </Typography>

      {open && (
        <Box id="document-text-lines" sx={{ mt: 2, maxHeight: 360, overflowY: 'auto', pr: 0.5 }}>
          {state.status === 'loading' && (
            <Stack direction="row" spacing={1} role="status" sx={{ alignItems: 'center', color: ds.text2 }}>
              <CircularProgress size={16} />
              <Typography sx={{ fontSize: 14 }}>문서 글자를 불러오고 있어요</Typography>
            </Stack>
          )}
          {state.status === 'error' && (
            <Box role="alert">
              <Typography variant="body2" sx={{ color: ds.red, fontWeight: 600 }}>
                {ERROR_TEXT[state.code] ?? '문서 글자를 불러오지 못했어요.'}
              </Typography>
              <Button size="small" sx={{ mt: 1 }} onClick={load}>
                다시 시도
              </Button>
            </Box>
          )}
          {state.status === 'done' &&
            pages.map((page) => (
              <Box key={page} sx={{ '& + &': { mt: 2 } }}>
                {pages.length > 1 && (
                  <Typography variant="caption" sx={{ color: ds.muted, fontWeight: 700 }}>
                    {page}쪽
                  </Typography>
                )}
                <Stack spacing={0.75} sx={{ mt: 0.5 }}>
                  {state.lines
                    .filter((l) => (l.page ?? 1) === page)
                    .map((l, i) => (
                      <ExplainableText key={i} text={l.text} component="p" variant="body2" sx={{ wordBreak: 'keep-all', lineHeight: 1.7 }} />
                    ))}
                </Stack>
              </Box>
            ))}
        </Box>
      )}
    </Box>
  )
}
