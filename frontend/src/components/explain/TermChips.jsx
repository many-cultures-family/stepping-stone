import { ButtonBase, Stack, Typography } from '@mui/material'
import { useExplain } from '../../explain/useExplain.js'
import { ds, radius, squircle } from '../../theme.js'
import { findTerms } from '../../utils/findTerms.js'

// 버튼 안이라 글자에 밑줄 버튼을 넣을 수 없는 곳(입력 항목 카드 등)에서 쓰는 '어려운 말' 칩 줄 (F-05)
// text 에 나오는 용어 사전의 말을 칩으로 보여 주고, wholeLabel 이 있으면 글 전체 풀이 칩을 붙인다.
// 설명 Provider 밖이거나 보여 줄 칩이 없으면 아무것도 그리지 않는다.
export default function TermChips({ text, wholeLabel = '전체 풀이', showWhole = true, sx }) {
  const explain = useExplain()
  if (!explain || !text) return null
  const found = findTerms(text, explain.terms)
  if (!found.length && !showWhole) return null

  return (
    <Stack direction="row" sx={{ alignItems: 'center', flexWrap: 'wrap', gap: 0.75, ...sx }}>
      <Typography component="span" sx={{ fontSize: 12, fontWeight: 700, color: ds.muted, mr: 0.25 }}>
        말 뜻
      </Typography>
      {found.map((t) => (
        <Chip key={t.id} label={`${t.term} 뜻 보기`} onClick={(e) => explain.openExplain(t.term, { el: e.currentTarget }, t)}>
          {t.term}
        </Chip>
      ))}
      {showWhole && (
        <Chip label={`'${text}' 쉬운 풀이 보기`} onClick={(e) => explain.openExplain(text, { el: e.currentTarget })} outlined>
          {wholeLabel}
        </Chip>
      )}
    </Stack>
  )
}

function Chip({ children, label, onClick, outlined = false }) {
  return (
    <ButtonBase
      aria-label={label}
      aria-haspopup="dialog"
      onClick={onClick}
      sx={{
        px: 1.25,
        height: 26,
        ...squircle(radius.full),
        fontSize: 13,
        fontWeight: 600,
        color: ds.primaryDeep,
        bgcolor: outlined ? ds.white : ds.primarySoft,
        border: `1px solid ${outlined ? ds.primaryLine : 'transparent'}`,
        '&:hover': { bgcolor: outlined ? ds.primarySoft : ds.primaryLine },
        '&.Mui-focusVisible': { outline: `2px solid ${ds.primary}`, outlineOffset: 1 },
      }}
    >
      {children}
    </ButtonBase>
  )
}
