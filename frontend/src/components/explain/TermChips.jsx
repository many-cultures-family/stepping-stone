import { ButtonBase, Stack, Typography } from '@mui/material'
import { useExplain } from '../../explain/useExplain.js'
import { ds, radius, squircle } from '../../theme.js'
import { uniqueWords } from '../../utils/splitWords.js'

// 버튼 안이라 글자에 낱말 버튼을 넣을 수 없는 곳(입력 항목 카드 등)에서 쓰는 '말 뜻' 칩 줄 (F-05)
// text 의 낱말을 칩으로 보여 주고(누르면 용어 사전에 묻는다), showWhole 이면 글 전체 풀이 칩을 붙인다.
// 낱말이 하나뿐이고 글 전체와 같으면 칩 하나만 둔다. 설명 Provider 밖이거나 보여 줄 칩이 없으면 아무것도 그리지 않는다.
export default function TermChips({ text, wholeLabel = '전체 풀이', showWhole = true, sx }) {
  const explain = useExplain()
  if (!explain || !text) return null
  const words = uniqueWords(text)
  const whole = showWhole && !(words.length === 1 && words[0] === text.trim())
  if (!words.length && !whole) return null

  return (
    <Stack direction="row" sx={{ alignItems: 'center', flexWrap: 'wrap', gap: 0.75, ...sx }}>
      <Typography component="span" sx={{ fontSize: 12, fontWeight: 700, color: ds.muted, mr: 0.25 }}>
        말 뜻
      </Typography>
      {words.map((w) => (
        <Chip key={w} label={`${w} 뜻 보기`} onClick={(e) => explain.openExplain(w, { el: e.currentTarget })}>
          {w}
        </Chip>
      ))}
      {whole && (
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
