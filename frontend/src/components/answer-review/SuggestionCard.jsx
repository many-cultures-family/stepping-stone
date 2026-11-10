import { Box, Button, Stack, Typography } from '@mui/material'
import { ds, radius, squircle } from '../../theme.js'
import { CheckCircleIcon } from '../icons.jsx'
import { Pill } from '../ui.jsx'

// 제안 종류 (DATA-MODEL.md review_suggestion.kind). 문구·색은 이 표 한 곳에서만 고른다.
const KIND = {
  맞춤법: { tone: 'soft', title: '맞춤법' },
  문법: { tone: 'soft', title: '문법' },
  '질문 의도': { tone: 'orange', title: '질문 의도' },
  보충: { tone: 'green', title: '보충 제안' },
}

// 반영 여부 버튼 문구. 고친 문장이 없는 제안('질문 의도' 등)은 '답변을 고칠게요'로 읽힌다.
function choiceLabels(hasText) {
  return hasText
    ? { 반영: '반영할게요', 무시: '그대로 둘게요' }
    : { 반영: '답변을 고칠게요', 무시: '그대로 둘게요' }
}

// 검토 제안 1개 (F-06, R6: 자동으로 반영하지 않고 사용자가 고른 것만 반영)
// suggestion: { id, kind, suggested_text, explanation, decision: '미결정' | '반영' | '무시' }
export default function SuggestionCard({ suggestion, onDecide }) {
  const kind = KIND[suggestion.kind] ?? { tone: 'grey', title: suggestion.kind }
  const hasText = Boolean(suggestion.suggested_text)
  const labels = choiceLabels(hasText)
  const pending = suggestion.decision === '미결정'

  return (
    <Box
      component="li"
      sx={{
        listStyle: 'none',
        p: { xs: 2, md: 2.5 },
        ...squircle(radius.tile),
        bgcolor: ds.white,
        // 미결정 제안은 파란 테두리로 강조한다 (아직 고를 것이 남았다는 표시)
        border: `1.5px solid ${pending ? ds.primaryLine : ds.line}`,
      }}
    >
      <Stack direction="row" spacing={1} sx={{ alignItems: 'center', mb: 1.5, flexWrap: 'wrap', rowGap: 1 }}>
        <Pill tone={kind.tone} size="sm">{kind.title}</Pill>
        <Pill tone="white" size="sm" sx={{ border: `1px solid ${ds.line}` }}>AI 제안</Pill>
        <Box sx={{ flexGrow: 1 }} />
        {!pending && (
          <Stack direction="row" spacing={0.5} sx={{ alignItems: 'center', color: suggestion.decision === '반영' ? ds.green : ds.muted }}>
            <CheckCircleIcon size={16} />
            <Typography sx={{ fontSize: 13, fontWeight: 600 }}>
              {suggestion.decision === '반영' ? labels.반영 : labels.무시}
            </Typography>
          </Stack>
        )}
      </Stack>

      <Typography sx={{ color: ds.text, wordBreak: 'keep-all' }}>{suggestion.explanation}</Typography>

      {hasText && (
        <Box sx={{ mt: 1.5, p: 1.5, ...squircle(radius.inner), bgcolor: ds.primarySoft }}>
          <Typography sx={{ fontSize: 12, fontWeight: 700, color: ds.primaryDeep, mb: 0.5 }}>고친 문장</Typography>
          <Typography sx={{ color: ds.ink, whiteSpace: 'pre-wrap', wordBreak: 'keep-all' }}>{suggestion.suggested_text}</Typography>
        </Box>
      )}

      <Stack
        direction="row"
        spacing={1}
        role="group"
        aria-label={`${kind.title} 제안 반영 여부`}
        sx={{ mt: 2, flexWrap: 'wrap', rowGap: 1 }}
      >
        {['반영', '무시'].map((value) => {
          const selected = suggestion.decision === value
          return (
            <Button
              key={value}
              size="small"
              aria-pressed={selected}
              variant={selected ? 'contained' : 'outlined'}
              color={value === '반영' ? 'primary' : 'inherit'}
              onClick={() => onDecide(suggestion.id, selected ? '미결정' : value)}
              sx={value === '무시' && selected ? { bgcolor: ds.ink, color: ds.white, '&:hover': { bgcolor: ds.inkHover } } : undefined}
            >
              {labels[value]}
            </Button>
          )
        })}
      </Stack>
    </Box>
  )
}
