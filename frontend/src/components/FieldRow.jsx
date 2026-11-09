import { Box, Button, ButtonBase, Stack, Typography } from '@mui/material'
import { ds, radius, squircle } from '../theme.js'
import { FIELD_ERROR_TEXT } from '../utils/validateFields.js'
import { AlertCircleIcon } from './icons.jsx'
import { Pill } from './ui.jsx'

// 입력 항목 카드: 누르면 원본 칸을 강조(onSelect)하고, 오른쪽 '수정'으로 수정 창을 연다.
// 확인만 할 때는 아무것도 누르지 않아도 된다 (제로 클릭).
export default function FieldRow({ field, format, errors = [], selected, onSelect, onEdit, index }) {
  const hasError = errors.length > 0
  const bg = hasError ? ds.redSoft : selected ? ds.white : ds.card
  const ring = selected ? `inset 0 0 0 2px ${hasError ? ds.red : ds.primary}` : 'none'

  return (
    <Box
      component="li"
      data-field-id={field.id}
      sx={{
        position: 'relative',
        listStyle: 'none',
        ...squircle(radius.card),
        bgcolor: bg,
        boxShadow: selected ? `${ring}, ${ds.floatShadow}` : ring,
        transition: 'background-color .2s ease, box-shadow .2s ease',
        '&:hover': { bgcolor: hasError ? ds.redSoft : selected ? ds.white : ds.cardHover },
      }}
    >
      <ButtonBase
        onClick={() => onSelect(field.id)}
        aria-pressed={selected}
        aria-label={`${field.label} 원본에서 보기`}
        sx={{
          width: '100%',
          textAlign: 'left',
          display: 'flex',
          alignItems: 'flex-start',
          justifyContent: 'flex-start',
          gap: 2,
          ...squircle(radius.card),
          px: { xs: 2.5, md: 3 },
          py: 2.75,
          pr: { xs: 11, md: 12 },
          '&.Mui-focusVisible': { outline: `3px solid ${ds.primaryLine}` },
        }}
      >
        <Box
          aria-hidden
          sx={{
            width: 32,
            height: 32,
            ...squircle(16),
            flexShrink: 0,
            display: { xs: 'none', sm: 'grid' },
            placeItems: 'center',
            fontSize: 13,
            fontWeight: 700,
            bgcolor: selected ? ds.primary : ds.white,
            color: selected ? ds.white : ds.text2,
          }}
        >
          {index + 1}
        </Box>
        <Box sx={{ minWidth: 0 }}>
          <Stack direction="row" spacing={1} sx={{ alignItems: 'center', flexWrap: 'wrap', rowGap: 0.75 }}>
            <Typography variant="h4" component="span">
              {field.label || '이름 없는 항목'}
            </Typography>
            {field.required === true && <Pill tone="blue" size="sm">필수</Pill>}
            {field.required === false && <Pill tone="white" size="sm">선택</Pill>}
            {field.flagged_wrong && <Pill tone="orange" size="sm">원본과 다름</Pill>}
          </Stack>

          <Typography variant="body2" component="div" sx={{ color: ds.text2, mt: 0.75 }}>
            {format ? (
              <>
                <Box component="span" sx={{ fontWeight: 600, color: ds.ink }}>
                  {format.label}
                </Box>
                <Box component="span" sx={{ color: ds.muted, mx: 0.75 }}>
                  ·
                </Box>
                <Box component="span" sx={{ fontFeatureSettings: '"tnum"' }}>
                  {format.example}
                </Box>
              </>
            ) : (
              <Box component="span" sx={{ color: ds.muted }}>
                입력 형식 없음
              </Box>
            )}
          </Typography>

          {field.description && (
            <Typography variant="body2" sx={{ color: ds.text2, mt: 0.5 }}>
              {field.description}
            </Typography>
          )}

          {field.format_code === 'choice' && field.options?.length > 0 && (
            <Stack direction="row" sx={{ flexWrap: 'wrap', gap: 0.75, mt: 1.5 }}>
              {field.options.map((o) => (
                <Pill key={o} tone="white" size="sm">
                  {o}
                </Pill>
              ))}
            </Stack>
          )}

          {hasError && (
            <Stack spacing={0.5} sx={{ mt: 1.5 }} role="alert">
              {errors.map((code) => (
                <Stack key={code} direction="row" spacing={0.75} sx={{ alignItems: 'center', color: ds.red }}>
                  <AlertCircleIcon size={16} />
                  <Typography variant="body2" sx={{ fontWeight: 600 }}>
                    {FIELD_ERROR_TEXT[code]}
                  </Typography>
                </Stack>
              ))}
            </Stack>
          )}
        </Box>
      </ButtonBase>

      <Button
        size="small"
        variant={hasError ? 'contained' : 'outlined'}
        color={hasError ? 'error' : 'inherit'}
        onClick={() => onEdit(field.id)}
        aria-label={`${field.label} 수정`}
        sx={{ position: 'absolute', top: 20, right: { xs: 16, md: 20 }, color: hasError ? 'white' : undefined }}
      >
        수정
      </Button>
    </Box>
  )
}
