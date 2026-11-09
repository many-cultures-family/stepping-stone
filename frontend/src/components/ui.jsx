// 디자인 시스템 공용 조각: 컨테이너, 알약 칩, 원형 아이콘 버튼, 링크
import { Box, ButtonBase } from '@mui/material'
import { navigate } from '../router.js'
import { ds, layout, radius, squircle } from '../theme.js'
import { squirclePath } from '../utils/squircle.js'

export function Container({ children, sx }) {
  return <Box sx={{ maxWidth: layout.container, mx: 'auto', px: layout.gutter, ...sx }}>{children}</Box>
}

/** 알약 칩. tone: blue(채움) · soft · grey · red · orange · green · white */
export function Pill({ tone = 'grey', size = 'md', children, sx }) {
  const tones = {
    blue: { bg: ds.primary, fg: ds.white },
    soft: { bg: ds.primarySoft, fg: ds.primaryDeep },
    grey: { bg: ds.card, fg: ds.text2 },
    red: { bg: ds.redSoft, fg: ds.red },
    orange: { bg: ds.orangeSoft, fg: ds.orange },
    green: { bg: ds.greenSoft, fg: ds.green },
    white: { bg: ds.white, fg: ds.ink },
  }
  const t = tones[tone]
  return (
    <Box
      component="span"
      sx={{
        display: 'inline-flex',
        alignItems: 'center',
        gap: 0.5,
        px: size === 'sm' ? 1.25 : 1.5,
        height: size === 'sm' ? 24 : 30,
        ...squircle(radius.full),
        bgcolor: t.bg,
        color: t.fg,
        fontSize: size === 'sm' ? 12 : 13,
        fontWeight: 600,
        whiteSpace: 'nowrap',
        ...sx,
      }}
    >
      {children}
    </Box>
  )
}

/** 시안의 원형 버튼 (재생·이전/다음). variant: ink(검정 채움) · light(회색) · white */
export function RoundButton({ variant = 'light', size = 48, label, onClick, children, sx, disabled }) {
  const v = {
    ink: { bg: ds.ink, fg: ds.white, hover: ds.inkHover },
    light: { bg: ds.card, fg: ds.ink, hover: ds.cardHover },
    white: { bg: ds.white, fg: ds.primary, hover: ds.primarySoft },
  }[variant]
  return (
    <ButtonBase
      aria-label={label}
      onClick={onClick}
      disabled={disabled}
      sx={{
        width: size,
        height: size,
        // 정사각형 버튼 → x⁴ + y⁴ = r⁴ 스쿼클 그 자체
        ...squircle(size / 2),
        bgcolor: v.bg,
        color: v.fg,
        flexShrink: 0,
        transition: 'background-color .15s ease, transform .1s ease',
        '&:hover': { bgcolor: v.hover },
        '&:active': { transform: 'scale(0.95)' },
        '&.Mui-disabled': { opacity: 0.4 },
        '&.Mui-focusVisible': { outline: `3px solid ${ds.primaryLine}`, outlineOffset: 2 },
        ...sx,
      }}
    >
      {children}
    </ButtonBase>
  )
}

/** 페이지 안 이동 링크 (새로고침 없이) */
export function Link({ to, children, sx, ...rest }) {
  return (
    <Box
      component="a"
      href={to}
      onClick={(e) => {
        if (e.metaKey || e.ctrlKey || e.shiftKey || to.startsWith('#')) return
        e.preventDefault()
        navigate(to)
      }}
      sx={{ color: 'inherit', textDecoration: 'none', ...sx }}
      {...rest}
    >
      {children}
    </Box>
  )
}

// 아이콘 타일: 정사각형이라 Wikipedia 의 대표 스쿼클 x⁴ + y⁴ = r⁴ (Lamé 곡선) 전체를 그대로 그린다.
// SVG 로 그려서 corner-shape 지원 여부와 관계없이 모든 브라우저에서 같은 모양이다.
const SQUIRCLE_PATH = squirclePath(100, 100, 50)

/** 스쿼클 아이콘 타일. color 는 아이콘 색, bg 는 타일 색 */
export function SquircleTile({ size = 48, bg = ds.white, color = ds.primary, border, children, sx }) {
  return (
    <Box sx={{ position: 'relative', width: size, height: size, flexShrink: 0, color, display: 'grid', placeItems: 'center', ...sx }}>
      <svg viewBox="0 0 100 100" width={size} height={size} aria-hidden style={{ position: 'absolute', inset: 0 }}>
        <path d={SQUIRCLE_PATH} fill={bg} stroke={border ?? 'none'} strokeWidth={border ? 3 : 0} vectorEffect="non-scaling-stroke" />
      </svg>
      <Box sx={{ position: 'relative', display: 'grid', placeItems: 'center' }}>{children}</Box>
    </Box>
  )
}
