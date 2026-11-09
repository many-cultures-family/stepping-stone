import { useState } from 'react'
import {
  Box,
  Button,
  ButtonBase,
  Dialog,
  Drawer,
  IconButton,
  Stack,
  Switch,
  TextField,
  Typography,
  useMediaQuery,
} from '@mui/material'
import { useTheme } from '@mui/material/styles'
import { ds, radius, squircle } from '../theme.js'
import { FIELD_ERROR_TEXT, validateField } from '../utils/validateFields.js'
import { CloseIcon } from './icons.jsx'

// 항목 하나 수정: 폰은 바텀시트, 노트북 이상은 가운데 창.
// 부모가 key={field.id} 로 렌더해서 열 때마다 값이 새로 채워진다.
export default function FieldEditSheet({ open, field, formats, onClose, onSave }) {
  const theme = useTheme()
  const desktop = useMediaQuery(theme.breakpoints.up('md'))
  const [draft, setDraft] = useState(() => ({ ...field, options: field?.options ?? [] }))
  const [optionInput, setOptionInput] = useState('')

  if (!field) return null

  const errors = validateField(draft, formats.map((f) => f.code))
  const set = (patch) => setDraft((d) => ({ ...d, ...patch }))

  function addOption() {
    const v = optionInput.trim()
    if (!v || draft.options.includes(v)) return
    set({ options: [...draft.options, v] })
    setOptionInput('')
  }

  const content = (
    <Box sx={{ display: 'flex', flexDirection: 'column', maxHeight: desktop ? '85vh' : '90vh' }}>
      {!desktop && <Box sx={{ width: 40, height: 4, ...squircle(radius.full), bgcolor: ds.lineStrong, mx: 'auto', mt: 1.5 }} />}
      <Stack direction="row" sx={{ alignItems: 'center', px: 3, pt: desktop ? 3 : 2, pb: 1 }}>
        <Typography variant="h2" id="field-edit-title" sx={{ flexGrow: 1 }}>
          항목 고치기
        </Typography>
        <IconButton onClick={onClose} aria-label="닫기" sx={{ color: ds.muted, mr: -1 }}>
          <CloseIcon />
        </IconButton>
      </Stack>

      <Box sx={{ overflowY: 'auto', px: 3, pb: 2 }}>
        <Stack spacing={4} sx={{ pt: 2 }}>
          <Section title="항목 이름">
            <TextField
              hiddenLabel
              value={draft.label}
              onChange={(e) => set({ label: e.target.value })}
              error={errors.includes('LABEL_EMPTY')}
              helperText={errors.includes('LABEL_EMPTY') ? FIELD_ERROR_TEXT.LABEL_EMPTY : null}
              slotProps={{ htmlInput: { 'aria-label': '항목 이름', maxLength: 50 } }}
              sx={{ '& .MuiFilledInput-input': { py: 2 } }}
            />
          </Section>

          <Section
            title="필수로 써야 하나요?"
            error={errors.includes('REQUIRED_EMPTY') && FIELD_ERROR_TEXT.REQUIRED_EMPTY}
          >
            <Box
              role="radiogroup"
              aria-label="필수 여부"
              sx={{ display: 'grid', gridTemplateColumns: '1fr 1fr', p: 0.5, gap: 0.5, bgcolor: ds.card, ...squircle(14) }}
            >
              {[
                { value: true, label: '필수' },
                { value: false, label: '선택' },
              ].map((o) => {
                const active = draft.required === o.value
                return (
                  <ButtonBase
                    key={o.label}
                    role="radio"
                    aria-checked={active}
                    onClick={() => set({ required: o.value })}
                    sx={{
                      height: 44,
                      ...squircle(10),
                      fontSize: 16,
                      fontWeight: 600,
                      color: active ? ds.ink : ds.muted,
                      bgcolor: active ? 'white' : 'transparent',
                      boxShadow: active ? '0 1px 4px rgba(0,0,0,0.08)' : 'none',
                      transition: 'all .15s ease',
                    }}
                  >
                    {o.label}
                  </ButtonBase>
                )
              })}
            </Box>
          </Section>

          <Section
            title="어떤 형식으로 쓰나요?"
            error={
              (errors.includes('FORMAT_EMPTY') && FIELD_ERROR_TEXT.FORMAT_EMPTY) ||
              (errors.includes('FORMAT_NOT_ALLOWED') && FIELD_ERROR_TEXT.FORMAT_NOT_ALLOWED)
            }
          >
            <Box role="radiogroup" aria-label="입력 형식" sx={{ display: 'grid', gridTemplateColumns: { xs: '1fr 1fr', sm: '1fr 1fr 1fr' }, gap: 1 }}>
              {formats.map((fmt) => {
                const active = draft.format_code === fmt.code
                return (
                  <ButtonBase
                    key={fmt.code}
                    role="radio"
                    aria-checked={active}
                    onClick={() => set({ format_code: fmt.code })}
                    sx={{
                      display: 'block',
                      textAlign: 'left',
                      p: 1.75,
                      ...squircle(14),
                      bgcolor: active ? ds.primarySoft : ds.card,
                      boxShadow: active ? `inset 0 0 0 2px ${ds.primary}` : `inset 0 0 0 1px ${ds.card}`,
                      transition: 'all .15s ease',
                    }}
                  >
                    <Typography sx={{ fontSize: 16, fontWeight: 600, color: active ? ds.primaryDeep : ds.ink }}>
                      {fmt.label}
                    </Typography>
                    <Typography variant="caption" sx={{ color: ds.muted, display: 'block', mt: 0.25 }} noWrap>
                      {fmt.example}
                    </Typography>
                  </ButtonBase>
                )
              })}
            </Box>
          </Section>

          {draft.format_code === 'choice' && (
            <Section title="고를 수 있는 답" error={errors.includes('OPTIONS_EMPTY') && FIELD_ERROR_TEXT.OPTIONS_EMPTY}>
              <Stack direction="row" sx={{ flexWrap: 'wrap', gap: 1, mb: draft.options.length ? 1.5 : 0 }}>
                {draft.options.map((o) => (
                  <ButtonBase
                    key={o}
                    onClick={() => set({ options: draft.options.filter((x) => x !== o) })}
                    aria-label={`${o} 지우기`}
                    sx={{ height: 36, px: 1.5, gap: 0.75, ...squircle(radius.full), bgcolor: ds.card, fontSize: 15, fontWeight: 500 }}
                  >
                    {o}
                    <CloseIcon size={14} color={ds.muted} />
                  </ButtonBase>
                ))}
              </Stack>
              <Stack direction="row" spacing={1}>
                <TextField
                  hiddenLabel
                  placeholder="답 추가하기"
                  value={optionInput}
                  onChange={(e) => setOptionInput(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter' && !e.nativeEvent.isComposing) {
                      e.preventDefault()
                      addOption()
                    }
                  }}
                  slotProps={{ htmlInput: { 'aria-label': '선택지 추가' } }}
                  size="small"
                />
                <Button variant="outlined" onClick={addOption} disabled={!optionInput.trim()} sx={{ flexShrink: 0 }}>
                  추가
                </Button>
              </Stack>
            </Section>
          )}

          <Stack
            component="label"
            direction="row"
            sx={{ alignItems: 'center', bgcolor: ds.card, ...squircle(16), p: 2.25, cursor: 'pointer' }}
          >
            <Box sx={{ flexGrow: 1, pr: 2 }}>
              <Typography sx={{ fontSize: 16, fontWeight: 600 }}>원본과 달라요</Typography>
              <Typography variant="body2" color="text.secondary">
                표시하면 AI에게 이 칸을 다시 살펴보라고 요청할 수 있어요.
              </Typography>
            </Box>
            <TossSwitch checked={Boolean(draft.flagged_wrong)} onChange={(e) => set({ flagged_wrong: e.target.checked })} />
          </Stack>
        </Stack>
      </Box>

      <Box sx={{ px: 3, pt: 1.5, pb: desktop ? 3 : 'max(16px, env(safe-area-inset-bottom))' }}>
        <Button
          fullWidth
          size="large"
          variant="contained"
          onClick={() => onSave({ ...draft, label: draft.label.trim(), options: draft.format_code === 'choice' ? draft.options : null })}
        >
          저장하기
        </Button>
      </Box>
    </Box>
  )

  return desktop ? (
    <Dialog open={open} onClose={onClose} fullWidth maxWidth="sm" aria-labelledby="field-edit-title">
      {content}
    </Dialog>
  ) : (
    <Drawer anchor="bottom" open={open} onClose={onClose} slotProps={{ paper: { 'aria-labelledby': 'field-edit-title' } }}>
      {content}
    </Drawer>
  )
}

function Section({ title, error, children }) {
  return (
    <Box>
      <Typography sx={{ fontSize: 15, fontWeight: 600, color: ds.text2, mb: 1.25 }}>{title}</Typography>
      {children}
      {error && (
        <Typography variant="body2" role="alert" sx={{ color: ds.red, fontWeight: 600, mt: 1 }}>
          {error}
        </Typography>
      )}
    </Box>
  )
}

function TossSwitch(props) {
  return (
    <Switch
      {...props}
      disableRipple
      slotProps={{ input: { 'aria-label': '원본과 달라요' } }}
      sx={{
        width: 52,
        height: 32,
        p: 0,
        flexShrink: 0,
        '& .MuiSwitch-switchBase': {
          p: '3px',
          '&.Mui-checked': { transform: 'translateX(20px)', color: '#fff' },
          '&.Mui-checked + .MuiSwitch-track': { bgcolor: ds.primary, opacity: 1 },
          '&.Mui-focusVisible .MuiSwitch-thumb': { outline: `3px solid ${ds.primaryLine}` },
        },
        '& .MuiSwitch-thumb': { width: 26, height: 26, ...squircle(radius.full), boxShadow: '0 2px 4px rgba(0,0,0,0.15)', color: '#fff' },
        '& .MuiSwitch-track': { ...squircle(radius.full), bgcolor: ds.lineStrong, opacity: 1 },
      }}
    />
  )
}
