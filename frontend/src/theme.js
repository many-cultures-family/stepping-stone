import { createTheme } from '@mui/material/styles'

// 참고 시안(여행 랜딩 웹 디자인)에서 추출한 디자인 시스템.
// - 흰 바탕 + 하늘색 그라데이션 큰 카드(32px) + 회색 면 카드
// - 알약(999px) 버튼: 주요 행동은 파랑, 상단·보조 강조는 검정(ink)
// - Pretendard 큰 제목, 넓은 1200px 웹 그리드와 넉넉한 섹션 간격
// 글자 대비(WCAG AA 4.5:1 이상, DESIGN.md 접근성 기준): 흰 글자/primary(#4169D6) 4.98:1,
//           작은 파란 글자는 primaryDeep(#2F54B0, 흰 바탕 6.96:1), 보조 글자 muted(#657080, 흰 바탕 5.0:1 이상).
//           primary 는 DESIGN.md 주 색상과 같다.
export const ds = {
  primary: '#4169D6',
  primaryHover: '#3459BD',
  primaryDeep: '#2F54B0',
  primarySoft: '#ECF1FC',
  primaryLine: '#C3D1F2',
  ink: '#111418',
  inkHover: '#2A2F36',
  text: '#111418',
  text2: '#5B6472',
  muted: '#657080',
  surface: '#FFFFFF',
  card: '#F5F7F9',
  cardHover: '#EEF1F4',
  line: '#E8EBEF',
  lineStrong: '#D3D9E0',
  red: '#C4343A',
  redSoft: '#FDECEC',
  orange: '#9C5000',
  orangeSoft: '#FFF2E2',
  green: '#12A150',
  greenSoft: '#E7F7EE',
  white: '#FFFFFF',
  // 로고(징검다리 돌) 그라데이션
  brandFrom: '#4BA7B4',
  brandTo: '#3F82D0',
  // 하늘(구름) 배경: 시안 히어로와 하단 CTA 배경
  sky: [
    'radial-gradient(60% 80% at 20% 20%, rgba(255,255,255,.85) 0%, rgba(255,255,255,0) 60%)',
    'radial-gradient(50% 60% at 85% 75%, rgba(255,255,255,.7) 0%, rgba(255,255,255,0) 60%)',
    'linear-gradient(135deg, #D6E7F6 0%, #EAF3FB 50%, #C7DDF1 100%)',
  ].join(','),
  floatShadow: '0 12px 32px rgba(17,20,24,.08)',
}

// 스쿼클 반지름 토큰 (n = 4 superellipse 모서리의 반지름, src/utils/squircle.js)
// full: 짧은 변의 절반까지 → 버튼·칩은 양 끝이 반원(캡슐)이 아니라 x⁴ + y⁴ = r⁴ 곡선의 절반이 된다.
//       정사각형(아이콘 버튼·타일)이면 Wikipedia 의 대표 스쿼클(Lamé 곡선) 그 자체.
export const radius = { hero: 44, card: 32, image: 28, tile: 20, inner: 14, full: 999, pill: 999 }

// 스쿼클 = superellipse |x|^4 + |y|^4 = r^4 (Wikipedia "Squircle", prototypical n = 4).
// 둥근 사각형(직선 + 사분원 border-radius)은 스쿼클이 아니다.
// - Chrome/Edge 139+: CSS `corner-shape: squircle` (= superellipse(2), 지수 2² = 4) 로 정확히 그린다.
// - 그 밖의 브라우저: 같은 반지름을 --squircle-r 에 남기고, src/utils/squircleFallback.js 가
//   요소 크기에 맞춘 n = 4 path 로 clip-path 를 계산한다. 두 경로 모두 같은 수식·같은 반지름.
export function squircle(r) {
  const v = `${r}px`
  return {
    borderRadius: v,
    '--squircle-r': v,
    '@supports (corner-shape: squircle)': { cornerShape: 'squircle' },
  }
}

/** 모서리마다 다른 반지름 (한쪽만 둥근 시트 등). 값 0 인 모서리는 각진 채로 둔다 */
export function squircleCorners({ tl = 0, tr = 0, br = 0, bl = 0 }) {
  return {
    borderRadius: `${tl}px ${tr}px ${br}px ${bl}px`,
    '--squircle-r': `${Math.max(tl, tr, br, bl)}px`,
    '@supports (corner-shape: squircle)': { cornerShape: 'squircle' },
  }
}

/** 반응형 반지름 ({ xs: 24, md: 32 }) */
export function squircleResponsive(map) {
  const v = {}
  for (const [bp, r] of Object.entries(map)) v[bp] = `${r}px`
  return { borderRadius: v, '--squircle-r': v, '@supports (corner-shape: squircle)': { cornerShape: 'squircle' } }
}

export const layout = { container: 1200, gutter: { xs: 2.5, md: 4 }, section: { xs: 9, md: 15 } }

// Pretendard Variable 을 한글·영문 모두에 쓴다 (npm pretendard 를 main.jsx 에서 가져와 번들에 포함. 외부 CDN 요청 없음)
export const fontDisplay = [
  '"Pretendard Variable"',
  'Pretendard',
  '-apple-system',
  'BlinkMacSystemFont',
  'system-ui',
  '"Apple SD Gothic Neo"',
  '"Noto Sans KR"',
  'sans-serif',
].join(',')

const theme = createTheme({
  palette: {
    primary: { main: ds.primary, dark: ds.primaryHover, light: ds.primarySoft, contrastText: ds.white },
    secondary: { main: ds.ink, contrastText: ds.white },
    error: { main: ds.red, light: ds.redSoft },
    success: { main: ds.green, light: ds.greenSoft },
    warning: { main: ds.orange, light: ds.orangeSoft },
    text: { primary: ds.text, secondary: ds.text2, disabled: ds.muted },
    background: { default: ds.surface, paper: ds.surface },
    divider: ds.line,
  },
  shape: { borderRadius: 12 },
  typography: {
    fontFamily: fontDisplay,
    h1: { fontSize: 'clamp(36px, 5vw, 60px)', fontWeight: 700, lineHeight: 1.15, letterSpacing: '-0.025em' },
    h2: { fontSize: 'clamp(26px, 3vw, 34px)', fontWeight: 700, lineHeight: 1.3, letterSpacing: '-0.02em' },
    h3: { fontSize: 20, fontWeight: 700, lineHeight: 1.4, letterSpacing: '-0.01em' },
    h4: { fontSize: 17, fontWeight: 700, lineHeight: 1.45 },
    subtitle1: { fontSize: 16, fontWeight: 600, lineHeight: 1.5 },
    body1: { fontSize: 16, lineHeight: 1.65 },
    body2: { fontSize: 14, lineHeight: 1.6 },
    caption: { fontSize: 13, lineHeight: 1.5 },
    overline: { fontSize: 12, fontWeight: 600, letterSpacing: '0.08em', lineHeight: 1.5 },
    button: { fontSize: 15, fontWeight: 600, textTransform: 'none', letterSpacing: 0 },
  },
  components: {
    MuiButtonBase: { defaultProps: { disableRipple: true } },
    MuiButton: {
      defaultProps: { disableElevation: true },
      styleOverrides: {
        // 버튼: 양 끝이 x⁴ + y⁴ = r⁴ 곡선의 절반인 스쿼클 (캡슐의 반원보다 끝이 넓고 평평하다)
        root: {
          ...squircle(radius.full),
          minHeight: 46,
          paddingInline: 24,
          transition: 'background-color .15s ease, transform .1s ease, box-shadow .15s ease',
          '&:active': { transform: 'scale(0.98)' },
          '&.Mui-focusVisible': { outline: `3px solid ${ds.primaryLine}`, outlineOffset: 2 },
        },
        sizeLarge: { minHeight: 54, fontSize: 16, paddingInline: 28 },
        sizeSmall: { minHeight: 34, fontSize: 14, paddingInline: 14 },
        containedPrimary: {
          '&:hover': { backgroundColor: ds.primaryHover },
          '&.Mui-disabled': { backgroundColor: ds.line, color: ds.muted },
        },
        containedSecondary: {
          '&:hover': { backgroundColor: ds.inkHover },
          '&.Mui-disabled': { backgroundColor: ds.line, color: ds.muted },
        },
        // 흰 바탕 보조 버튼 (테두리 얇게)
        outlined: {
          borderColor: ds.line,
          color: ds.ink,
          backgroundColor: ds.white,
          '&:hover': { borderColor: ds.line, backgroundColor: ds.card },
          '&.Mui-disabled': { color: ds.muted, borderColor: ds.line },
        },
        text: { '&:hover': { backgroundColor: ds.card } },
      },
    },
    MuiIconButton: {
      styleOverrides: { root: { '&.Mui-focusVisible': { outline: `3px solid ${ds.primaryLine}` } } },
    },
    MuiPaper: {
      defaultProps: { elevation: 0 },
      // rounded: MUI 기본 원형 모서리(shape.borderRadius) 대신 스쿼클
      styleOverrides: { root: { backgroundImage: 'none' }, rounded: squircle(radius.card) },
    },
    // 메뉴·팝오버(헤더 언어 선택 등): 떠 있는 작은 카드 + 안쪽 항목도 스쿼클
    MuiPopover: {
      styleOverrides: { paper: { ...squircle(radius.inner + 4), boxShadow: '0 0 0 1px rgba(17,20,24,.06), 0 12px 32px rgba(17,20,24,.12)' } },
    },
    MuiMenu: { styleOverrides: { list: { padding: 6 } } },
    MuiMenuItem: { styleOverrides: { root: { ...squircle(radius.inner - 4), minHeight: 40, fontSize: 15 } } },
    MuiAlert: { styleOverrides: { root: { ...squircle(radius.inner + 4), alignItems: 'center' } } },
    MuiSnackbarContent: { styleOverrides: { root: squircle(radius.full) } },
    MuiTooltip: { styleOverrides: { tooltip: { ...squircle(10), backgroundColor: ds.ink, fontSize: 13 } } },
    MuiChip: { styleOverrides: { root: squircle(radius.full) } },
    MuiFilledInput: {
      defaultProps: { disableUnderline: true },
      styleOverrides: {
        root: {
          ...squircle(radius.tile),
          backgroundColor: ds.card,
          fontSize: 16,
          '&:hover': { backgroundColor: ds.cardHover },
          '&.Mui-focused': { backgroundColor: ds.white, boxShadow: `inset 0 0 0 2px ${ds.primary}` },
          '&.Mui-error': { boxShadow: `inset 0 0 0 2px ${ds.red}` },
        },
      },
    },
    MuiTextField: { defaultProps: { variant: 'filled', fullWidth: true } },
    MuiDrawer: {
      styleOverrides: {
        // 시트는 한쪽 두 모서리만 둥글다 → 모서리별 스쿼클
        paperAnchorBottom: { ...squircleCorners({ tl: radius.card, tr: radius.card }), maxHeight: '90vh' },
        paperAnchorTop: { ...squircleCorners({ br: radius.card, bl: radius.card }) },
      },
    },
    MuiDialog: { styleOverrides: { paper: squircle(radius.hero) } },
    MuiBackdrop: { styleOverrides: { root: { backgroundColor: 'rgba(17,20,24,0.4)' } } },
    MuiSkeleton: {
      defaultProps: { animation: 'wave' },
      styleOverrides: { root: { backgroundColor: ds.card }, rounded: squircle(radius.card) },
    },
  },
})

export default theme
