import { Box } from '@mui/material'
import { ds } from '../../theme.js'
import { diffChars } from '../../utils/diffText.js'

// 글자 단위 차이 한 줄. mode='prior' 는 저장된 정보(빠진 글자에 취소선), mode='current' 는 지금 쓴 값(다른 글자 강조).
// 스크린리더는 쪼개진 글자 대신 전체 값을 한 번에 읽는다.
export default function DiffLine({ prior, current, mode }) {
  const parts = diffChars(prior, current)
  const full = mode === 'prior' ? prior : current
  return (
    <Box
      role="text"
      aria-label={`${mode === 'prior' ? '저장된 정보' : '지금 쓴 값'}: ${full || '비어 있음'}`}
      sx={{ fontSize: 15, lineHeight: 1.8, wordBreak: 'break-all', fontFeatureSettings: '"tnum"' }}
    >
      <Box component="span" aria-hidden>
        {full ? (
          parts.map((p, i) => {
            if (p.type === 'same') return <span key={i}>{p.text}</span>
            if (mode === 'prior' && p.type === 'del') {
              return (
                <Box key={i} component="span" sx={{ textDecoration: 'line-through', color: ds.muted }}>
                  {p.text}
                </Box>
              )
            }
            if (mode === 'current' && p.type === 'add') {
              return (
                <Box key={i} component="span" sx={{ bgcolor: ds.orangeSoft, color: ds.orange, fontWeight: 700 }}>
                  {p.text}
                </Box>
              )
            }
            return null
          })
        ) : (
          <Box component="span" sx={{ color: ds.muted }}>
            비어 있어요
          </Box>
        )}
      </Box>
    </Box>
  )
}
