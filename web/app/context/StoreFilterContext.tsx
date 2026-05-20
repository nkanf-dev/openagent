import { createContext, useContext, useEffect, useState, useCallback, type ReactNode } from "react"

type StoreFilterContextValue = {
  storeFilterEnabled: boolean
  setStoreFilterEnabled: (enabled: boolean) => void
}

const StoreFilterContext = createContext<StoreFilterContextValue>({
  storeFilterEnabled: false,
  setStoreFilterEnabled: () => {},
})

export function StoreFilterProvider({ children }: { children: ReactNode }) {
  const [enabled, setEnabled] = useState(false)

  const setStoreFilterEnabled = useCallback((v: boolean) => {
    setEnabled(v)
  }, [])

  return (
    <StoreFilterContext.Provider value={{ storeFilterEnabled: enabled, setStoreFilterEnabled }}>
      {children}
    </StoreFilterContext.Provider>
  )
}

export function useStoreFilterEnabled() {
  return useContext(StoreFilterContext)
}

export function useDeclareStoreFilter(enabled: boolean) {
  const { setStoreFilterEnabled } = useContext(StoreFilterContext)
  useEffect(() => {
    setStoreFilterEnabled(enabled)
    return () => setStoreFilterEnabled(false)
  }, [enabled, setStoreFilterEnabled])
}
