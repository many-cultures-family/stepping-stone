import { useEffect, useMemo, useRef, useState } from 'react'
import { Box, Button, ButtonBase, Popper, Typography } from '@mui/material'
import { useExplain } from '../../explain/useExplain.js'
import { ds } from '../../theme.js'
import { splitWords } from '../../utils/splitWords.js'

// 문서 속 글자(칸 제목·안내 문구·문서 본문 줄)를 그리면서, 어려운 말의 설명을 볼 수 있게 한다 (F-05)
// - 낱말마다 누를 수 있다. 누르면 설명 창이 그 낱말을 용어 사전에 묻는다 (WORD-EXPLAIN-API.md 항목 1, 키보드로도 된다).
//   사전 전체 목록 API가 없어 '사전에 있는 말'을 미리 표시하지 않는다.
// - [이름] 같은 가린 개인정보 토큰은 누를 수 없고 '가려진 정보'로 보여 준다.
// - 마우스·손가락으로 글자를 끌어서 고르면 '고른 말 설명 보기' 버튼이 뜬다.
// - sentenceButton 이면 끝에 '문장 풀이' 버튼을 붙여 글 전체를 설명받게 한다.
// - 사용자가 쓴 답변·사전 정보에는 쓰지 않는다. 그 값은 L2에 보내면 안 된다 (03 3-4 L2).
// - 설명 Provider 밖이거나 로그인 전이면 글자만 그린다.
export default function ExplainableText({ text, component = 'span', variant, sx, sentenceButton = false }) {
  const explain = useExplain()
  const parts = useMemo(() => splitWords(text ?? ''), [text])
  const box = useRef(null)
  const [picked, setPicked] = useState(null)

  // 고른 글자가 사라지면(다른 곳을 누르는 등) 떠 있던 버튼도 치운다
  useEffect(() => {
    if (!picked) return undefined
    const onChange = () => {
      const sel = window.getSelection()
      if (!sel || sel.isCollapsed) setPicked(null)
    }
    document.addEventListener('selectionchange', onChange)
    return () => document.removeEventListener('selectionchange', onChange)
  }, [picked])

  if (!explain) {
    return (
      <Typography component={component} variant={variant} sx={sx}>
        {text}
      </Typography>
    )
  }

  const readSelection = () => {
    const sel = window.getSelection()
    if (!sel || sel.isCollapsed || !box.current) return
    if (!box.current.contains(sel.anchorNode) || !box.current.contains(sel.focusNode)) return
    const chosen = sel.toString().replace(/\s+/g, ' ').trim()
    if (!chosen) return
    const r = sel.getRangeAt(0).getBoundingClientRect()
    setPicked({ text: chosen, rect: { top: r.top, bottom: r.bottom, left: r.left, width: r.width, height: r.height } })
  }

  const openPicked = () => {
    explain.openExplain(picked.text, { rect: picked.rect })
    window.getSelection()?.removeAllRanges()
    setPicked(null)
  }

  return (
    <>
      <Typography
        ref={box}
        component={component}
        variant={variant}
        onMouseUp={readSelection}
        onTouchEnd={() => setTimeout(readSelection, 0)}
        sx={sx}
      >
        {parts.map((p, i) =>
          p.kind === 'masked' ? (
            <Box
              key={i}
              component="span"
              title="가려진 정보"
              sx={{ px: 0.5, borderRadius: 0.5, bgcolor: ds.line, color: ds.text2, fontSize: '0.9em' }}
            >
              {p.text}
            </Box>
          ) : p.kind === 'word' ? (
            <ButtonBase
              key={i}
              component="span"
              role="button"
              aria-haspopup="dialog"
              aria-label={`${p.word} 뜻 보기`}
              onClick={(e) => explain.openExplain(p.word, { el: e.currentTarget })}
              sx={{
                display: 'inline',
                font: 'inherit',
                color: 'inherit',
                verticalAlign: 'baseline',
                // ButtonBase 기본값(user-select: none)이면 문장을 끌어서 고를 때 이 말이 빠진다
                userSelect: 'text',
                textDecoration: `underline dotted ${ds.primaryLine}`,
                textDecorationThickness: 1,
                textUnderlineOffset: '0.22em',
                borderRadius: 0.5,
                '&:hover': { bgcolor: ds.primarySoft },
                '&.Mui-focusVisible': { outline: `2px solid ${ds.primary}`, outlineOffset: 1 },
              }}
            >
              {p.text}
            </ButtonBase>
          ) : (
            <span key={i}>{p.text}</span>
          ),
        )}
        {sentenceButton && (
          <ButtonBase
            component="span"
            role="button"
            aria-haspopup="dialog"
            aria-label="이 문장 쉬운 풀이 보기"
            onClick={(e) => explain.openExplain(text, { el: e.currentTarget })}
            sx={{
              display: 'inline-flex',
              alignItems: 'center',
              ml: 0.75,
              px: 1,
              height: 22,
              verticalAlign: 'text-bottom',
              borderRadius: 999,
              border: `1px solid ${ds.primaryLine}`,
              color: ds.primaryDeep,
              fontSize: 12,
              fontWeight: 700,
              whiteSpace: 'nowrap',
              '&:hover': { bgcolor: ds.primarySoft },
              '&.Mui-focusVisible': { outline: `2px solid ${ds.primary}`, outlineOffset: 1 },
            }}
          >
            문장 풀이
          </ButtonBase>
        )}
      </Typography>

      <Popper
        open={Boolean(picked)}
        anchorEl={
          picked
            ? { getBoundingClientRect: () => ({ ...picked.rect, right: picked.rect.left + picked.rect.width, x: picked.rect.left, y: picked.rect.top }) }
            : null
        }
        placement="top"
        sx={{ zIndex: 1300 }}
      >
        <Box sx={{ mb: 1 }}>
          {/* 누르는 순간 고른 글자가 풀리지 않게 mousedown 기본 동작을 막는다 */}
          <Button variant="contained" size="small" onMouseDown={(e) => e.preventDefault()} onClick={openPicked} sx={{ boxShadow: ds.floatShadow }}>
            고른 말 설명 보기
          </Button>
        </Box>
      </Popper>
    </>
  )
}
