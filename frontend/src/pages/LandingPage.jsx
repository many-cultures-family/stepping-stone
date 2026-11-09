import { Box } from '@mui/material'
import Hero from '../components/landing/Hero.jsx'
import LanguageStrip from '../components/landing/LanguageStrip.jsx'
import MessageSection from '../components/landing/MessageSection.jsx'
import StepsSection from '../components/landing/StepsSection.jsx'

// 기본 경로(/)에서 보이는 서비스 소개 페이지
export default function LandingPage() {
  return (
    <Box sx={{ pt: { xs: 1, md: 1.5 } }}>
      <Hero />
      <LanguageStrip />
      <StepsSection />
      <MessageSection />
    </Box>
  )
}
