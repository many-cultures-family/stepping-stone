import { createContext } from 'react'

// 단어·문장 설명(F-05) 컨텍스트. Provider 는 ExplainProvider.jsx, 읽기는 useExplain.js.
// 컴포넌트 파일과 나눈 이유는 auth/auth-context.js 와 같다 (react-refresh 규칙).
export const ExplainContext = createContext(null)
