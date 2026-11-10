import { Box, Stack, TextField, Typography } from '@mui/material'
import { LANGUAGE_NAMES, PRIOR_INFO_FIELDS, errorTextOf, meaningOf } from '../../i18n/priorInfo.js'
import { ds, radius, squircle } from '../../theme.js'
import { formatAsTyped } from '../../utils/validatePriorInfo.js'
import { AlertCircleIcon, GlobeIcon } from '../icons.jsx'
import { Pill } from '../ui.jsx'

// 사전 정보 칸 하나: 한국어 항목 이름 + 사용 언어로 된 뜻 + 형식 예시 + 입력 칸
// - origin: 'saved'(저장된 값을 불러옴) · 'edited'(불러온 값을 고침) · null(새로 씀)
// - errorCode 가 있으면 칸 아래에 한국어·사용 언어 오류 문구를 같이 보여 준다(R3)
export default function PriorInfoField({ infoKey, value, language, origin, errorCode, required = true, disabled, onChange, onBlur }) {
  const def = PRIOR_INFO_FIELDS[infoKey]
  const showNative = language && language !== 'ko'
  const inputId = `prior-info-${infoKey}`
  const helpId = `${inputId}-help`
  const error = errorCode ? errorTextOf(errorCode, infoKey, language) : null

  return (
    <Box
      component="li"
      sx={{
        listStyle: 'none',
        p: { xs: 2.5, md: 3 },
        ...squircle(radius.card),
        bgcolor: error ? ds.redSoft : ds.card,
        transition: 'background-color .2s ease',
      }}
    >
      <Stack direction="row" spacing={1} sx={{ alignItems: 'center', flexWrap: 'wrap', rowGap: 1 }}>
        <Typography component="label" htmlFor={inputId} sx={{ fontSize: 18, fontWeight: 700 }}>
          {def.label}
        </Typography>
        <Pill tone={required ? 'red' : 'grey'} size="sm">{required ? '필수' : '선택'}</Pill>
        {origin === 'saved' && <Pill tone="soft" size="sm">저장된 정보를 불러왔어요</Pill>}
        {origin === 'edited' && <Pill tone="orange" size="sm">고쳤어요 · 저장하면 바뀌어요</Pill>}
      </Stack>

      {/* 항목 뜻: 사용 언어 먼저, 쉬운 한국어를 함께 (US-04 "칸마다 항목의 뜻을 사용 언어로") */}
      <Box id={helpId} sx={{ mt: 1.5, p: 2, ...squircle(radius.inner), bgcolor: ds.white }}>
        <Stack direction="row" spacing={1} sx={{ alignItems: 'flex-start' }}>
          <Box sx={{ color: ds.primaryDeep, mt: '2px', flexShrink: 0 }}>
            <GlobeIcon size={16} />
          </Box>
          <Box sx={{ minWidth: 0 }}>
            <Typography sx={{ fontSize: 12, fontWeight: 700, color: ds.primaryDeep }}>
              {LANGUAGE_NAMES[language] ?? LANGUAGE_NAMES.ko}
            </Typography>
            <Typography lang={language ?? 'ko'} sx={{ fontSize: 15, mt: 0.25 }}>
              {meaningOf(infoKey, language)}
            </Typography>
            {showNative && (
              <Typography lang="ko" sx={{ fontSize: 13, color: ds.text2, mt: 0.5 }}>
                {meaningOf(infoKey, 'ko')}
              </Typography>
            )}
          </Box>
        </Stack>
      </Box>

      <TextField
        id={inputId}
        fullWidth
        value={value}
        disabled={disabled}
        placeholder={`예: ${def.example}`}
        onChange={(e) => onChange(infoKey, formatAsTyped(infoKey, e.target.value))}
        onBlur={() => onBlur?.(infoKey)}
        error={Boolean(error)}
        slotProps={{
          htmlInput: {
            inputMode: def.inputMode,
            autoComplete: def.autoComplete,
            'aria-describedby': error ? `${helpId} ${inputId}-error` : helpId,
            'aria-invalid': Boolean(error),
          },
        }}
        sx={{ mt: 1.5, '& .MuiOutlinedInput-root': { bgcolor: ds.white } }}
      />

      {def.format && <Typography sx={{ fontSize: 13, color: ds.muted, mt: 0.75 }}>형식: {def.format}</Typography>}

      {error && (
        <Stack id={`${inputId}-error`} role="alert" direction="row" spacing={0.75} sx={{ mt: 1, color: ds.red, alignItems: 'flex-start' }}>
          <Box sx={{ mt: '3px', flexShrink: 0 }}>
            <AlertCircleIcon size={14} />
          </Box>
          <Box>
            <Typography sx={{ fontSize: 14, fontWeight: 600 }}>{error.ko}</Typography>
            {error.native && (
              <Typography lang={language} sx={{ fontSize: 13 }}>{error.native}</Typography>
            )}
          </Box>
        </Stack>
      )}
    </Box>
  )
}
