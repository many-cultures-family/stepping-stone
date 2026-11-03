import { createTheme } from '@mui/material/styles'

// Example.png(나이스플러스 참고 화면)에서 뽑은 색상으로 다시 맞춤 (DESIGN.md "토큰" 참고).
// 글자 대비(WCAG AA 4.5:1)는 흰 글자+주 색상(4.98:1), 흰 글자+보조 색상(6.07:1)에서 확인함.
const theme = createTheme({
  palette: {
    primary: { main: '#4169D6' },
    secondary: { main: '#6058A8' },
    background: { default: '#E8F0F0' },
  },
  typography: {
    fontFamily: [
      'Pretendard',
      '-apple-system',
      'BlinkMacSystemFont',
      '"Apple SD Gothic Neo"',
      '"Noto Sans KR"',
      'sans-serif',
    ].join(','),
  },
})

export default theme
