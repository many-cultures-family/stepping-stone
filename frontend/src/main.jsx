import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { CssBaseline, ThemeProvider } from '@mui/material'
import 'pretendard/dist/web/variable/pretendardvariable-dynamic-subset.css'
import './index.css'
import theme from './theme.js'
import App from './App.jsx'
import { installSquircleFallback } from './utils/squircleFallback.js'

// corner-shape 미지원 브라우저에서 스쿼클을 clip-path 로 그린다. ?squircle=js 로 지원 브라우저에서도 확인 가능
installSquircleFallback({ force: new URLSearchParams(window.location.search).get('squircle') === 'js' })

createRoot(document.getElementById('root')).render(
  <StrictMode>
    <ThemeProvider theme={theme}>
      <CssBaseline />
      <App />
    </ThemeProvider>
  </StrictMode>,
)
