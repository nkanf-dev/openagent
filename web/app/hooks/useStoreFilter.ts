import { useCallback, useEffect, useState } from "react"

function readStore(): string | undefined {
  try {
    const v = localStorage.getItem("store")
    return v && v !== "All" ? v : undefined
  } catch {
    return undefined
  }
}

export function useStoreFilter(): string | undefined {
  const [store, setStore] = useState(readStore)

  const sync = useCallback(() => {
    setStore(readStore())
  }, [])

  useEffect(() => {
    window.addEventListener("globalStoreChanged", sync)

    function handleStorage(e: StorageEvent) {
      if (e.key === "store") sync()
    }
    window.addEventListener("storage", handleStorage)

    return () => {
      window.removeEventListener("globalStoreChanged", sync)
      window.removeEventListener("storage", handleStorage)
    }
  }, [sync])

  return store
}
