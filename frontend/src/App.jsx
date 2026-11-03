import Layout from './components/Layout.jsx'
import UploadPage from './pages/UploadPage.jsx'

// US-01 #1(서류 올리기)만 만드는 동안은 업로드 화면만 보여준다.
// 입력 항목 확인(ResultPage, US-02 이후 범위)은 아직 연결하지 않는다.
export default function App() {
  return (
    <Layout>
      <UploadPage />
    </Layout>
  )
}
