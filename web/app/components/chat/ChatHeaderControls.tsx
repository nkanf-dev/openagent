// Copyright 2026 The OpenAgent Authors. All Rights Reserved.
//
// Licensed under the Apache License, Version 2.0 (the "License");
// you may not use this file except in compliance with the License.
// You may obtain a copy of the License at
//
//      http://www.apache.org/licenses/LICENSE-2.0
//
// Unless required by applicable law or agreed to in writing, software
// distributed under the License is distributed on an "AS IS" BASIS,
// WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
// See the License for the specific language governing permissions and
// limitations under the License.

import { useCallback, useEffect, useMemo, useState } from "react"
import { useTranslation } from "react-i18next"
import { ImagesIcon, MinusIcon, PlusIcon, TypeIcon } from "lucide-react"
import { getProviders, type Provider, getProviderLogoUrl, getProviderDisplayName } from "~/backend/ProviderBackend"
import { updateChat, type Chat } from "~/backend/ChatBackend"
import type { Store } from "~/backend/StoreBackend"
import { isImageGenerationModelProvider } from "~/lib/ProviderUtils"
import { isLocalAdminUser } from "~/backend/AccountBackend"
import { useAccount } from "~/context/AccountContext"
import { Button } from "~/components/ui/button"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "~/components/ui/select"
import { Segmented } from "~/components/ui/segmented"
import { Switch } from "~/components/ui/switch"
import { toast } from "sonner"

type Props = {
  chat?: Chat
  stores: Store[]
  currentStore?: Store
  defaultStore?: Store
  selectedModelProvider?: string
  autoRead: boolean
  onAutoReadChange: (enabled: boolean) => void
  onChatUpdated: (chat: Chat) => void
  onStoreSelected?: (store: Store) => void
  onDraftModelProviderChange?: (providerName: string) => void
  paneCount?: number
  onPaneCountChange?: (count: number) => void
  showPaneControls?: boolean
  disabled?: boolean
}

export default function ChatHeaderControls({
  chat,
  stores,
  currentStore,
  defaultStore,
  selectedModelProvider,
  autoRead,
  onAutoReadChange,
  onChatUpdated,
  onStoreSelected,
  onDraftModelProviderChange,
  paneCount = 1,
  onPaneCountChange,
  showPaneControls = false,
  disabled,
}: Props) {
  const { t } = useTranslation()
  const { account } = useAccount()
  const [modelProviders, setModelProviders] = useState<Provider[]>([])
  const [updating, setUpdating] = useState(false)
  const [generationMode, setGenerationMode] = useState<"text" | "image">("text")

  const canManagePanes = isLocalAdminUser(account)

  // Filter stores to only show childStores of the default store
  const rootStore = defaultStore || stores.find((s) => s.isDefault)
  const availableStores = useMemo(() => {
    if (!rootStore) return stores
    if (rootStore.childStores && rootStore.childStores.length > 0) {
      const childNames = new Set(rootStore.childStores)
      return stores.filter((s) => childNames.has(s.name))
    }
    return stores
  }, [stores, rootStore])

  // Fetch model providers when chat or store changes
  useEffect(() => {
    // Use currentStore's childModelProviders if available, otherwise fall back to rootStore
    const modelProviderNames =
      currentStore?.childModelProviders?.length
        ? currentStore.childModelProviders
        : rootStore?.childModelProviders

    if (!modelProviderNames?.length) {
      setModelProviders([])
      return
    }
    const owner = chat?.owner || currentStore?.owner || rootStore?.owner || "admin"
    getProviders(owner).then((res) => {
      if (res.status !== "ok") return
      const all: Provider[] = res.data || []
      const models = all.filter(
        (p) => p.category === "Model" && modelProviderNames.includes(p.name)
      )
      // Ensure the chat's current model provider is in the list
      if (
        currentStore?.modelProvider &&
        !models.some((p) => p.name === currentStore.modelProvider)
      ) {
        const missing = all.find(
          (p) => p.name === currentStore.modelProvider && p.category === "Model"
        )
        if (missing) models.unshift(missing)
      }
      setModelProviders(models)
    })
  }, [chat?.name, rootStore, currentStore])

  // Filter providers by generation mode
  const filteredProviders = useMemo(() => {
    if (!modelProviders.length) return []
    if (generationMode === "image") {
      return modelProviders.filter((p) => isImageGenerationModelProvider(p))
    }
    return modelProviders.filter((p) => !isImageGenerationModelProvider(p))
  }, [modelProviders, generationMode])

  const currentProviderName = chat?.modelProvider || selectedModelProvider || currentStore?.modelProvider || ""

  const handleStoreChange = useCallback(async (storeName: string | null) => {
    if (updating || !storeName) return
    const newStore = stores.find((s) => s.name === storeName)
    if (!newStore) return
    if (!chat) {
      onStoreSelected?.(newStore)
      return
    }

    setUpdating(true)
    try {
      const updated = { ...chat, store: newStore.name, modelProvider: newStore.modelProvider }
      const res = await updateChat(chat.owner, chat.name, updated)
      if (res.status === "ok") {
        onChatUpdated(updated)
      } else {
        toast.error(`${t("general:Failed to save")}: ${res.msg}`)
      }
    } catch (err: any) {
      toast.error(`${t("general:Failed to save")}: ${err.message}`)
    } finally {
      setUpdating(false)
    }
  }, [updating, stores, chat, onStoreSelected, onChatUpdated, t])

  const handleProviderChange = useCallback(async (providerName: string | null) => {
    if (updating || !providerName) return
    if (!chat) {
      onDraftModelProviderChange?.(providerName)
      return
    }
    setUpdating(true)
    try {
      const updated = { ...chat, modelProvider: providerName }
      const res = await updateChat(chat.owner, chat.name, updated)
      if (res.status === "ok") {
        onChatUpdated(updated)
      } else {
        toast.error(`${t("general:Failed to save")}: ${res.msg}`)
      }
    } catch (err: any) {
      toast.error(`${t("general:Failed to save")}: ${err.message}`)
    } finally {
      setUpdating(false)
    }
  }, [updating, chat, onDraftModelProviderChange, onChatUpdated, t])

  // When mode changes, if current provider is not in the filtered list, switch to the first one
  useEffect(() => {
    if (updating || !filteredProviders.length) return
    const current = chat?.modelProvider || selectedModelProvider || currentStore?.modelProvider || ""
    const valid = filteredProviders.some((p) => p.name === current)
    if (!valid && chat) {
      handleProviderChange(filteredProviders[0].name)
    }
  }, [generationMode, filteredProviders, chat, selectedModelProvider, currentStore, updating, handleProviderChange])

  const hasImageProviders = modelProviders.some((p) => isImageGenerationModelProvider(p))

  const storeValue = chat?.store || currentStore?.name || availableStores[0]?.name || ""

  return (
    <div className="flex flex-wrap items-center gap-2">
      {/* Store select */}
      {availableStores.length > 0 && (
        <div className="flex items-center gap-2">
          <span className="hidden text-xs font-medium tracking-wide text-muted-foreground md:inline">
            {t("general:Store")}
          </span>
          <Select
            value={storeValue}
            onValueChange={handleStoreChange}
            disabled={disabled || updating}
          >
            <SelectTrigger className="h-8 w-40">
              <SelectValue placeholder={t("general:Store")} />
            </SelectTrigger>
            <SelectContent>
              {availableStores.map((s) => (
                <SelectItem key={s.name} value={s.name}>
                  <span className="flex items-center gap-1.5">
                    {s.avatar && (
                      <img
                        src={s.avatar}
                        alt=""
                        className="h-4 w-4 rounded object-cover"
                        onError={(e) => { (e.currentTarget as HTMLImageElement).style.display = "none" }}
                      />
                    )}
                    <span className="truncate">{s.displayName || s.name}</span>
                  </span>
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      )}

      {/* Mode select: text / image */}
      {modelProviders.length > 0 && hasImageProviders && (
        <div className="flex items-center gap-2">
          <span className="hidden text-xs font-medium tracking-wide text-muted-foreground md:inline">
            {t("chat:Mode")}
          </span>
          <Segmented
            value={generationMode}
            onChange={setGenerationMode}
            disabled={disabled || updating}
            options={[
              {
                value: "text",
                label: (
                  <>
                    <TypeIcon className="h-3.5 w-3.5" />
                    <span>{t("general:Text")}</span>
                  </>
                ),
              },
              {
                value: "image",
                label: (
                  <>
                    <ImagesIcon className="h-3.5 w-3.5" />
                    <span>{t("general:Image")}</span>
                  </>
                ),
              },
            ]}
          />
        </div>
      )}

      {/* Model select */}
      {filteredProviders.length > 0 && (
        <div className="flex items-center gap-2">
          <span className="hidden text-xs font-medium tracking-wide text-muted-foreground md:inline">
            {t("general:Model")}
          </span>
          <Select
            value={currentProviderName}
            onValueChange={handleProviderChange}
            disabled={disabled || updating}
          >
            <SelectTrigger className="h-8 w-48">
              <SelectValue placeholder={t("general:Model")} />
            </SelectTrigger>
            <SelectContent>
              {filteredProviders.map((p) => (
                <SelectItem key={p.name} value={p.name}>
                  <span className="flex items-center gap-1.5">
                    <img
                      src={getProviderLogoUrl(p)}
                      alt=""
                      className="h-4 w-4 object-contain"
                      onError={(e) => { (e.currentTarget as HTMLImageElement).style.display = "none" }}
                    />
                    <span className="truncate">{getProviderDisplayName(p)}</span>
                  </span>
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      )}

      {/* Auto-read toggle */}
      {currentStore?.showAutoRead && (
        <div className="flex items-center gap-2 pl-1">
          <span className="text-xs font-medium tracking-wide text-muted-foreground">
            {t("store:Auto read")}
          </span>
          <Switch
            checked={autoRead}
            onCheckedChange={onAutoReadChange}
            size="sm"
            disabled={disabled}
          />
        </div>
      )}

      {/* Pane controls */}
      {showPaneControls && canManagePanes && (
        <div className="flex items-center gap-1 pl-1">
          <span className="text-xs font-medium tracking-wide text-muted-foreground">
            {t("chat:Panes")}: {paneCount}
          </span>
          <Button
            variant="outline"
            size="icon"
            className="h-6 w-6"
            onClick={() => onPaneCountChange?.(Math.min(4, paneCount + 1))}
            disabled={paneCount >= 4}
          >
            <PlusIcon className="h-3 w-3" />
          </Button>
          <Button
            variant="outline"
            size="icon"
            className="h-6 w-6"
            onClick={() => onPaneCountChange?.(Math.max(1, paneCount - 1))}
            disabled={paneCount <= 1}
          >
            <MinusIcon className="h-3 w-3" />
          </Button>
        </div>
      )}
    </div>
  )
}
