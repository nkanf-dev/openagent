import { useCallback, useEffect, useState } from "react"

function readStore(): string {
  try {
    const v = localStorage.getItem("store")
    return v && v !== "All" ? v : ""
  } catch {
    return ""
  }
}

/**
 * Returns the currently selected store filter from localStorage.
 * Re-renders when the global store selection changes (via "storeChanged" event).
 */
export function useStoreFilter(): string {
  const [store, setStore] = useState(readStore)

  const sync = useCallback(() => {
    setStore(readStore())
  }, [])

  useEffect(() => {
    window.addEventListener("storeChanged", sync)
    return () => window.removeEventListener("storeChanged", sync)
  }, [sync])

  return store
}
