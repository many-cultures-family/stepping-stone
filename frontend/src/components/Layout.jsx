import { Box } from '@mui/material'
import SiteFooter from './SiteFooter.jsx'
import SiteHeader from './SiteHeader.jsx'

// 모든 화면 공통 웹 레이아웃: 상단 메뉴 + 본문 + 하단 정보
export default function Layout({ children }) {
  return (
    <Box sx={{ minHeight: '100vh', display: 'flex', flexDirection: 'column', bgcolor: 'background.default' }}>
      <SiteHeader />
      <Box component="main" sx={{ flexGrow: 1 }}>
        {children}
      </Box>
      <SiteFooter />
    </Box>
  )
}
