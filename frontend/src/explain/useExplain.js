import { useContext } from 'react'
import { ExplainContext } from './explain-context.js'

/**
 * 단어·문장 설명(F-05) 컨텍스트.
 * → { language, openExplain(text, anchor) } 또는 null(Provider 밖·로그인 전)
 * null 이면 설명 기능 없이 글자만 그린다.
 */
export function useExplain() {
  return useContext(ExplainContext)
}
