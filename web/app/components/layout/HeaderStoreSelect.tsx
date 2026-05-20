import { useCallback, useEffect, useMemo, useState } from "react"
import { useTranslation } from "react-i18next"
import { getGlobalStores, type Store } from "~/backend/StoreBackend"
import { useStoreFilterEnabled } from "~/context/StoreFilterContext"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "~/components/ui/select"

type Props = {
  className?: string
}

function getStoredStore(): string {
  try {
    return localStorage.getItem("store") || "All"
  } catch {
    return "All"
  }
}

function setStoredStore(value: string) {
  try {
    localStorage.setItem("store", value)
  } catch {
    // ignore
  }
}

export function HeaderStoreSelect({ className }: Props) {
  const { t } = useTranslation()
  const { storeFilterEnabled } = useStoreFilterEnabled()
  const [stores, setStores] = useState<Store[]>([])
  const [value, setValue] = useState(getStoredStore)

  const fetchStores = useCallback(() => {
    getGlobalStores().then((res) => {
      if (res.status === "ok") {
        setStores(res.data || [])
      }
    })
  }, [])

  useEffect(() => {
    fetchStores()

    function onStoresChanged() {
      fetchStores()
    }

    window.addEventListener("storesChanged", onStoresChanged)

    function handleStorage(e: StorageEvent) {
      if (e.key === "store") setValue(getStoredStore())
    }
    window.addEventListener("storage", handleStorage)

    return () => {
      window.removeEventListener("storesChanged", onStoresChanged)
      window.removeEventListener("storage", handleStorage)
    }
  }, [fetchStores])

  const options = useMemo(
    () => [
      { name: "All", displayName: t("store:All"), avatar: "" },
      ...stores,
    ],
    [stores, t]
  )

  function handleChange(nextValue: string | null) {
    if (!nextValue) return
    setValue(nextValue)
    setStoredStore(nextValue)
    window.dispatchEvent(new Event("globalStoreChanged"))
  }

  return (
    <Select value={value} onValueChange={handleChange} disabled={!storeFilterEnabled}>
      <SelectTrigger className={className ?? "h-8 w-40"}>
        <SelectValue placeholder={t("store:All")} />
      </SelectTrigger>
      <SelectContent align="end">
        {options.map((store) => (
          <SelectItem key={store.name} value={store.name}>
            <span className="flex items-center gap-1.5">
              {store.avatar ? (
                <img
                  src={store.avatar}
                  alt=""
                  className="h-4 w-4 rounded object-cover"
                  onError={(e) => { (e.currentTarget as HTMLImageElement).style.display = "none" }}
                />
              ) : null}
              <span className="truncate">{store.displayName || store.name}</span>
            </span>
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  )
}
