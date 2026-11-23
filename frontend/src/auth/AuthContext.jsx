import { useCallback, useEffect, useState } from 'react'
import { AuthContext } from './auth-context.js'
import { getMe } from '../api/auth.js'
import { setStoreUser } from '../utils/browserStore.js'

// 로그인 상태를 화면 전체(머리 영역·업로드 화면)가 함께 쓰기 위한 컨텍스트.
export function AuthProvider({ children }) {
  const [state, setRawState] = useState({ status: 'loading', user: null })
  // 브라우저 보관소(사전 정보)가 지금 사용자를 알게 한다. 화면이 그려지기 전에 넣어야 자식 화면의 첫 불러오기가 맞는 사용자를 본다
  const setState = useCallback((next) => {
    setStoreUser(next.user?.email ?? null)
    setRawState(next)
  }, [])

  const refresh = useCallback(async () => {
    try {
      const { user } = await getMe()
      setState({ status: 'authenticated', user })
    } catch {
      setState({ status: 'anonymous', user: null })
    }
  }, [setState])

  // 처음 열 때 로그인 여부 확인 (LOGIN-API.md 항목 3 "화면이 쓰는 곳").
  // refresh()를 그대로 부르지 않고 풀어 쓴 이유: react-hooks/set-state-in-effect가
  // effect 안에서 상태를 그대로 바꾸는 걸 막아서, 언마운트 가드가 있는 모양으로 직접 썼다.
  useEffect(() => {
    let ignore = false
    getMe().then(
      ({ user }) => {
        if (!ignore) setState({ status: 'authenticated', user })
      },
      () => {
        if (!ignore) setState({ status: 'anonymous', user: null })
      },
    )
    return () => {
      ignore = true
    }
  }, [setState])

  // 로그아웃했거나, 다른 API가 401 LOGIN_REQUIRED를 받았을 때 머리 영역까지 바로 동기화한다.
  const setLoggedOut = useCallback(() => setState({ status: 'anonymous', user: null }), [setState])
  const setUser = useCallback((user) => setState({ status: 'authenticated', user }), [setState])

  return (
    <AuthContext.Provider value={{ ...state, refresh, setLoggedOut, setUser }}>
      {children}
    </AuthContext.Provider>
  )
}
