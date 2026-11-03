import Layout from './components/Layout.jsx'
import UploadPage from './pages/UploadPage.jsx'

// US-01 #1 범위는 문서를 올려 작성 건이 생기는 것까지라 업로드 화면만 보여 준다.
// 검증 결과 화면(ResultPage)은 US-02 이후에 다시 연결한다.
export default function App() {
  return (
    <Layout onHome={() => {}}>
      <UploadPage />
    </Layout>
  )
}
