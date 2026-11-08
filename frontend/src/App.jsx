import { useState } from 'react'
import { Button, Dialog, DialogContent } from '@mui/material'
import Layout from './components/Layout.jsx'
import UploadPage from './pages/UploadPage.jsx'
import LoginPage from './pages/LoginPage.jsx'

// US-01 #1(서류 올리기)만 만드는 동안은 업로드 화면만 보여준다.
// 입력 항목 확인(ResultPage, US-02 이후 범위)은 아직 연결하지 않는다.
// 로그인 화면은 우상단 버튼을 눌렀을 때만 모달로 띄운다. 업로드 접근을 막는 권한 기능은
// 아직 범위가 아니라서(API.md "인증·권한: 오늘은 없음") 로그인 여부와 무관하게 업로드는 그대로 쓸 수 있다.
export default function App() {
  const [loginOpen, setLoginOpen] = useState(false)

  return (
    <Layout onLoginClick={() => setLoginOpen(true)}>
      <UploadPage />
      <Dialog open={loginOpen} onClose={() => setLoginOpen(false)} maxWidth="xs" fullWidth>
        <DialogContent>
          <LoginPage />
          <Button onClick={() => setLoginOpen(false)} sx={{ mt: 2 }}>
            닫기
          </Button>
        </DialogContent>
      </Dialog>
    </Layout>
  )
}
