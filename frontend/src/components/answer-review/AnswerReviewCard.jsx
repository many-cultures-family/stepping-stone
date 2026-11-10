import { Box, Button, Stack, Typography } from '@mui/material'
import { ds, radius, squircle } from '../../theme.js'
import { CheckCircleIcon } from '../icons.jsx'
import { Pill } from '../ui.jsx'
import SuggestionCard from './SuggestionCard.jsx'

// 질문 의도 피드백은 맞춤법·문법 제안과 따로 묶어서 보여 준다 (L3 출력: 수정 제안 / 의도 판단)
const INTENT_KINDS = ['질문 의도']

// 서술형 답변 1개 + 그 답변에 대한 검토 제안 목록 (F-06)
// answer: { id(field_answer id), label, guide, value }
// suggestions: 이 답변에 대한 review_suggestion 배열
// reviewed: 검토 결과를 받았는지. 받기 전에는 제안 영역을 그리지 않는다
export default function AnswerReviewCard({ answer, suggestions, reviewed, onDecide }) {
  const fixes = suggestions.filter((s) => !INTENT_KINDS.includes(s.kind))
  const intents = suggestions.filter((s) => INTENT_KINDS.includes(s.kind))
  const pendingCount = suggestions.filter((s) => s.decision === '미결정').length
  const empty = !answer.value?.trim()

  const decideAll = (decision) => suggestions.forEach((s) => onDecide(s.id, decision))

  return (
    <Box
      component="section"
      aria-labelledby={`answer-${answer.id}`}
      sx={{ p: { xs: 2.5, md: 4 }, ...squircle(radius.card), bgcolor: ds.card }}
    >
      <Stack direction="row" spacing={1} sx={{ alignItems: 'center', flexWrap: 'wrap', rowGap: 1 }}>
        <Typography id={`answer-${answer.id}`} variant="h3" component="h2" sx={{ fontSize: { xs: 20, md: 24 }, flexGrow: 1, wordBreak: 'keep-all' }}>
          {answer.label}
        </Typography>
        {reviewed && (pendingCount > 0
          ? <Pill tone="soft" size="sm">고를 제안 {pendingCount}개</Pill>
          : (
            // 글자는 ink, 초록은 체크 아이콘에만 (초록 글자는 흰 바탕 대비 부족)
            <Pill tone="green" size="sm" sx={{ color: ds.ink }}>
              <Box component="span" aria-hidden sx={{ display: 'inline-flex', color: ds.green }}><CheckCircleIcon size={14} /></Box>
              {suggestions.length ? '모두 골랐어요' : '제안 없음'}
            </Pill>
          ))}
      </Stack>
      {answer.guide && <Typography sx={{ color: ds.text2, mt: 1, wordBreak: 'keep-all' }}>{answer.guide}</Typography>}

      {/* 내가 쓴 답변 (자동으로 바뀌지 않는다, R6) */}
      <Box sx={{ mt: 2.5, p: 2, ...squircle(radius.tile), bgcolor: ds.white, border: `1px solid ${empty ? ds.red : ds.line}` }}>
        <Typography sx={{ fontSize: 12, fontWeight: 700, color: ds.muted, mb: 0.75 }}>내가 쓴 답변</Typography>
        {empty
          ? <Typography sx={{ color: ds.red }}>아직 답변을 쓰지 않았어요. 답변을 먼저 써야 검토를 받을 수 있어요.</Typography>
          : <Typography sx={{ whiteSpace: 'pre-wrap', wordBreak: 'keep-all' }}>{answer.value}</Typography>}
      </Box>

      {reviewed && suggestions.length === 0 && (
        <Typography sx={{ mt: 2.5, color: ds.text2 }}>AI가 고칠 곳을 찾지 못했어요. 이대로 써도 괜찮아요.</Typography>
      )}

      {reviewed && suggestions.length > 1 && (
        <Stack direction="row" spacing={1} sx={{ mt: 2.5, justifyContent: 'flex-end' }}>
          <Button size="small" color="inherit" onClick={() => decideAll('반영')}>모두 반영</Button>
          <Button size="small" color="inherit" onClick={() => decideAll('무시')}>모두 그대로 두기</Button>
        </Stack>
      )}

      {reviewed && fixes.length > 0 && (
        <SuggestionGroup title="맞춤법·문법 제안" items={fixes} onDecide={onDecide} />
      )}
      {reviewed && intents.length > 0 && (
        <SuggestionGroup title="질문 의도에 맞나요?" items={intents} onDecide={onDecide} />
      )}
    </Box>
  )
}

function SuggestionGroup({ title, items, onDecide }) {
  return (
    <Box sx={{ mt: 3 }}>
      <Typography variant="subtitle1" component="h3" sx={{ fontWeight: 700, mb: 1.5 }}>{title}</Typography>
      <Stack component="ul" spacing={1.5} sx={{ m: 0, p: 0 }}>
        {items.map((s) => (
          <SuggestionCard key={s.id} suggestion={s} onDecide={onDecide} />
        ))}
      </Stack>
    </Box>
  )
}
