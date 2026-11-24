import { Box } from '@mui/material'
import { ds } from '../../theme.js'
import { diffChars } from '../../utils/diffText.js'

// 글자 단위 차이 한 줄. mode='prior' 는 저장된 정보(지금 값에 없는 글자에 취소선), mode='current' 는 지금 쓴 값(다른 글자 강조).
// 하이픈·공백·마침표만 다른 부분은 불일치 판정(utils/priorMismatch.js)에서도 무시하므로 강조하지 않는다.
// 화면 읽기 프로그램은 쪼개진 글자 대신 숨긴 전체 값 한 줄을 읽는다.
const SEPARATOR_ONLY = /^[\s.\-‐-―/]+$/
const srOnly = { position: 'absolute', width: '1px', height: '1px', m: '-1px', p: 0, overflow: 'hidden', clip: 'rect(0 0 0 0)', whiteSpace: 'nowrap', border: 0 }

export default function DiffLine({ prior, current, mode }) {
  const parts = diffChars(prior, current)
  const full = mode === 'prior' ? prior : current
  return (
    <Box sx={{ position: 'relative', fontSize: 15, lineHeight: 1.8, wordBreak: 'break-all', fontFeatureSettings: '"tnum"' }}>
      <Box component="span" sx={srOnly}>
        {`${mode === 'prior' ? '저장된 정보' : '지금 쓴 값'}: ${full || '비어 있음'}`}
      </Box>
      <Box component="span" aria-hidden>
        {full ? (
          parts.map((p, i) => {
            const plain = p.type === 'same' || SEPARATOR_ONLY.test(p.text)
            if (mode === 'prior' && p.type === 'add') return null
            if (mode === 'current' && p.type === 'del') return null
            if (plain) return <span key={i}>{p.text}</span>
            if (mode === 'prior') {
              return (
                <Box key={i} component="span" sx={{ textDecoration: 'line-through', color: ds.muted }}>
                  {p.text}
                </Box>
              )
            }
            return (
              <Box key={i} component="span" sx={{ bgcolor: ds.orangeSoft, color: ds.orange, fontWeight: 700 }}>
                {p.text}
              </Box>
            )
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
