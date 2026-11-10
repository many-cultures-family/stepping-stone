import { useCallback, useEffect, useState } from 'react'
import { getPriorInfo, savePriorInfo } from '../api/priorInfo.js'

// 사전 정보 화면(F-03)에 저장된 값을 불러오고 저장하는 훅. 저장하면 값을 다시 불러와 화면을 새로 그린다(App 의 key).
export function usePriorInfo() {
  const [state, setState] = useState({ loaded: false, savedInfo: {}, status: 'idle', errorCode: null })

  const load = useCallback(async () => {
    try {
      const savedInfo = await getPriorInfo()
      setState({ loaded: true, savedInfo, status: 'idle', errorCode: null })
    } catch (e) {
      setState({ loaded: true, savedInfo: {}, status: 'error', errorCode: e?.code ?? 'UNKNOWN' })
    }
  }, [])

  useEffect(() => {
    // 처음 한 번만 불러온다
    load()
  }, [load])

  const save = useCallback(async (values) => {
    setState((s) => ({ ...s, status: 'saving', errorCode: null }))
    try {
      const savedInfo = await savePriorInfo(values)
      setState({ loaded: true, savedInfo, status: 'idle', errorCode: null })
    } catch (e) {
      setState((s) => ({ ...s, status: 'error', errorCode: e?.code ?? 'UNKNOWN' }))
    }
  }, [])

  return { ...state, save, retry: load }
}
