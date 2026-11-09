import { Box, ButtonBase, FormControlLabel, Radio, RadioGroup, Stack, Tooltip, Typography } from '@mui/material'
import { ds } from '../../theme.js'
import { AlertCircleIcon } from '../icons.jsx'
import { Pill } from '../ui.jsx'

// 가상 폼 한 칸 (라벨 칸 | 입력 칸). 안쪽은 의도적으로 각진 서식 스타일(1px 회색 테두리 표).
// 상태 하이라이트: 불일치·미확인(주황) / 불일치·확인함(회색) / 형식 오류(빨강) / 일치(초록)
export default function VirtualFormRow({ answer, value, saveState, formatError, onChange, onCommit, onOpenPopover }) {
  const m = answer.mismatch
  const hasPrior = m.has_prior_info
  const pending = hasPrior && m.differs && !m.mismatch_acknowledged
  const acknowledged = hasPrior && m.differs && m.mismatch_acknowledged
  const same = hasPrior && !m.differs && Boolean(answer.value)

  const border = formatError ? `2px solid ${ds.red}` : pending ? `2px solid ${ds.orange}` : `1px solid ${ds.lineStrong}`
  const bg = formatError ? ds.redSoft : pending ? ds.orangeSoft : ds.white
  const id = `vf-${answer.field_id}`
  const hintId = `${id}-hint`
  const describedBy = pending || formatError ? hintId : undefined

  const inputSx = {
    width: '100%',
    boxSizing: 'border-box',
    font: 'inherit',
    fontSize: 15,
    color: ds.ink,
    bgcolor: bg,
    border,
    borderRadius: 0,
    px: 1.5,
    py: 1.25,
    '&:focus': { outline: `3px solid ${ds.primaryLine}`, outlineOffset: 0 },
  }

  return (
    <Box
      data-field-id={answer.field_id}
      sx={{ display: 'grid', gridTemplateColumns: { xs: '1fr', sm: '180px minmax(0, 1fr)' }, borderBottom: `1px solid ${ds.lineStrong}` }}
    >
      <Box component="label" htmlFor={id} sx={{ bgcolor: ds.card, px: 2, py: 1.5, borderRight: { sm: `1px solid ${ds.lineStrong}` } }}>
        <Typography component="span" sx={{ fontSize: 14, fontWeight: 700 }}>
          {answer.label}
        </Typography>
        {answer.required && (
          <Box component="span" aria-label="필수" sx={{ color: ds.red, ml: 0.5, fontWeight: 700 }}>
            *
          </Box>
        )}
        {answer.description && (
          <Typography component="span" sx={{ display: 'block', fontSize: 12, color: ds.muted, mt: 0.5, lineHeight: 1.5 }}>
            {answer.description}
          </Typography>
        )}
      </Box>

      <Box sx={{ p: 1.5, minWidth: 0 }}>
        <Stack direction="row" spacing={1} sx={{ alignItems: 'flex-start' }}>
          <Box sx={{ flexGrow: 1, minWidth: 0 }}>
            {answer.format_code === 'choice' ? (
              <RadioGroup
                id={id}
                row
                aria-describedby={describedBy}
                value={value ?? ''}
                onChange={(e) => {
                  onChange(e.target.value)
                  onCommit(e.target.value)
                }}
              >
                {answer.options.map((o) => (
                  <FormControlLabel key={o} value={o} control={<Radio size="small" />} label={o} />
                ))}
              </RadioGroup>
            ) : answer.format_code === 'long_text' ? (
              <Box
                component="textarea"
                id={id}
                rows={4}
                value={value ?? ''}
                placeholder={answer.format_example ?? ''}
                aria-describedby={describedBy}
                aria-invalid={formatError || undefined}
                onChange={(e) => onChange(e.target.value)}
                onBlur={(e) => onCommit(e.target.value)}
                sx={{ ...inputSx, resize: 'vertical' }}
              />
            ) : (
              <Box
                component="input"
                id={id}
                type="text"
                value={value ?? ''}
                placeholder={answer.format_example ?? ''}
                aria-describedby={describedBy}
                aria-invalid={formatError || undefined}
                onChange={(e) => onChange(e.target.value)}
                onBlur={(e) => onCommit(e.target.value)}
                sx={inputSx}
              />
            )}
          </Box>

          {pending && (
            <Tooltip title={`저장된 정보: ${m.prior_value}`} arrow>
              <ButtonBase
                aria-label={`${answer.label} 저장된 정보와 달라요. 자세히 보기`}
                onClick={(e) => onOpenPopover(answer.field_id, e.currentTarget)}
                sx={{ width: 40, height: 40, flexShrink: 0, color: ds.orange, bgcolor: ds.orangeSoft, border: `1px solid ${ds.orange}`, '&.Mui-focusVisible': { outline: `3px solid ${ds.primaryLine}` } }}
              >
                <AlertCircleIcon size={22} />
              </ButtonBase>
            </Tooltip>
          )}
        </Stack>

        <Stack direction="row" spacing={1} sx={{ mt: 1, alignItems: 'center', flexWrap: 'wrap', rowGap: 0.75, minHeight: 24 }}>
          {pending && (
            <Tooltip title={`저장된 정보: ${m.prior_value}`} arrow>
              <Box component="span" tabIndex={0} sx={{ display: 'inline-flex', borderRadius: 999, '&:focus-visible': { outline: `3px solid ${ds.primaryLine}` } }}>
                <Pill tone="orange" size="sm">저장된 정보와 달라요</Pill>
              </Box>
            </Tooltip>
          )}
          {acknowledged && <Pill tone="grey" size="sm">확인함 · 그대로 둠</Pill>}
          {same && <Pill tone="green" size="sm">저장된 정보와 같아요</Pill>}
          {saveState === 'saving' && (
            <Typography variant="caption" sx={{ color: ds.muted }} role="status">
              저장 중…
            </Typography>
          )}
          {saveState === 'saved' && (
            <Typography variant="caption" sx={{ color: ds.muted }} role="status">
              저장됨
            </Typography>
          )}
        </Stack>

        {formatError && (
          <Typography id={hintId} role="alert" variant="caption" sx={{ display: 'block', color: ds.red, fontWeight: 600, mt: 0.75 }}>
            형식이 달라요. 이렇게 적어 주세요: {answer.format_example}
          </Typography>
        )}
        {pending && !formatError && (
          <Typography id={hintId} variant="caption" sx={{ display: 'block', color: ds.orange, mt: 0.75 }}>
            저장된 정보와 달라요. 경고 아이콘을 눌러 확인해 보세요.
          </Typography>
        )}
      </Box>
    </Box>
  )
}
