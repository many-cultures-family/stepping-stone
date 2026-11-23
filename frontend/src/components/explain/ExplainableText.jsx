import { useEffect, useMemo, useRef, useState } from 'react'
import { Box, Button, ButtonBase, Popper, Typography } from '@mui/material'
import { useExplain } from '../../explain/useExplain.js'
import { ds } from '../../theme.js'
import { splitByTerms } from '../../utils/findTerms.js'

// 문서 속 글자(칸 제목·안내 문구)를 그리면서, 어려운 말의 설명을 볼 수 있게 한다 (F-05)
// - 용어 사전에 있는 말은 점선 밑줄 버튼이 된다. 누르면 설명 창을 연다 (키보드로도 된다).
// - 마우스·손가락으로 글자를 끌어서 고르면 '고른 말 설명 보기' 버튼이 뜬다.
// - sentenceButton 이면 끝에 '문장 풀이' 버튼을 붙여 글 전체를 설명받게 한다.
// - 사용자가 쓴 답변·사전 정보에는 쓰지 않는다. 그 값은 L2에 보내면 안 된다 (03 3-4 L2).
// - 설명 Provider 밖이거나 로그인 전이면 글자만 그린다.
export default function ExplainableText({ text, component = 'span', variant, sx, sentenceButton = false }) {
  const explain = useExplain()
  const parts = useMemo(() => splitByTerms(text ?? '', explain?.terms), [text, explain?.terms])
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
          p.term ? (
            <ButtonBase
              key={i}
              component="span"
              role="button"
              aria-haspopup="dialog"
              aria-label={`${p.text} 뜻 보기`}
              onClick={(e) => explain.openExplain(p.text, { el: e.currentTarget }, p.term)}
              sx={{
                display: 'inline',
                font: 'inherit',
                color: 'inherit',
                verticalAlign: 'baseline',
                // ButtonBase 기본값(user-select: none)이면 문장을 끌어서 고를 때 이 말이 빠진다
                userSelect: 'text',
                textDecoration: `underline dotted ${ds.primary}`,
                textDecorationThickness: 2,
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
