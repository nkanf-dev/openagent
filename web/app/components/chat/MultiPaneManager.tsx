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

import { useCallback, useEffect, useRef, useState } from "react"
import { useTranslation } from "react-i18next"
import { SendIcon } from "lucide-react"
import { toast } from "sonner"
import i18next from "i18next"

import { getProviders, type Provider } from "~/backend/ProviderBackend"
import { addChat, updateChat, type Chat } from "~/backend/ChatBackend"
import { getChatMessages, addMessage, type Message } from "~/backend/MessageBackend"
import type { Store } from "~/backend/StoreBackend"
import { useAccount } from "~/context/AccountContext"
import { isLocalAdminUser } from "~/backend/AccountBackend"
import { getRandomName } from "~/lib/chatUtils"
import { renderText } from "~/lib/ChatMessageRender"
import ChatHeaderControls from "./ChatHeaderControls"
import { Button } from "~/components/ui/button"
import { Textarea } from "~/components/ui/textarea"

type PaneData = {
  store: Store | undefined
  chat: Chat | undefined
  messages: Message[]
}

type Props = {
  stores: Store[]
  defaultStore: Store | undefined
  initialChat: Chat | undefined
  paneCount: number
  onPaneCountChange: (count: number) => void
  onChatUpdate: (chat: Chat) => void
}

export default function MultiPaneManager({
  stores,
  defaultStore,
  initialChat,
  paneCount,
  onPaneCountChange,
  onChatUpdate,
}: Props) {
  const { t } = useTranslation()
  const { account } = useAccount()
  const [panes, setPanes] = useState<PaneData[]>([])
  const [globalInputValue, setGlobalInputValue] = useState("")
  const [modelProviders, setModelProviders] = useState<Provider[]>([])
  const [loadingStates, setLoadingStates] = useState<Set<number>>(new Set())

  const initialChatRef = useRef<Chat | undefined>(undefined)
  const addedChatsRef = useRef<Set<string>>(new Set())

  const canManagePanes = isLocalAdminUser(account)

  // Load model providers
  useEffect(() => {
    if (!defaultStore?.childModelProviders?.length) {
      setModelProviders([])
      return
    }

    getProviders("admin").then((res) => {
      if (res.status === "ok") {
        const providers = (res.data || []).filter(
          (p: Provider) => p.category === "Model" && defaultStore.childModelProviders!.includes(p.name)
        )
        setModelProviders(providers)
      }
    })
  }, [defaultStore])

  const createNewChat = useCallback(
    (baseChat?: Chat, selectStore?: Store) => {
      const randomName = getRandomName()
      return {
        owner: "admin",
        name: `chat_${randomName}`,
        store: selectStore?.name || "",
        createdTime: new Date().toISOString(),
        organization: account?.owner || "admin",
        displayName: `${i18next.t("chat:New Chat")} - ${randomName}`,
        user: account?.name || "",
        category: baseChat?.category || i18next.t("chat:Default Category"),
        messageCount: 0,
        needTitle: true,
        modelProvider: baseChat?.modelProvider || selectStore?.modelProvider || null,
      } as Chat
    },
    [account]
  )

  const addChatToBackend = useCallback((chat: Chat) => {
    if (!chat?.name || addedChatsRef.current.has(chat.name)) return
    addedChatsRef.current.add(chat.name)
    addChat(chat).catch((err: Error) => {
      toast.error(`${i18next.t("general:Failed to add")}: ${err.message}`)
    })
  }, [])

  const setLoadingForPane = useCallback((paneIndex: number, loading: boolean) => {
    setLoadingStates((prev) => {
      const next = new Set(prev)
      if (loading) {
        next.add(paneIndex)
      } else {
        next.delete(paneIndex)
      }
      return next
    })
  }, [])

  const getMessages = useCallback(
    (paneIndex: number, chat: Chat) => {
      if (!chat) return

      getChatMessages("admin", chat.name).then((res) => {
        if (res.status !== "ok") return
        const msgs: Message[] = res.data || []
        msgs.forEach((m) => {
          m.html = renderText(m.text)
        })

        setPanes((prev) =>
          prev.map((pane, i) => (i === paneIndex ? { ...pane, messages: msgs } : pane))
        )
      })
    },
    []
  )

  const initializePanes = useCallback(() => {
    if (!initialChat) return

    const isNewChat = !initialChatRef.current || initialChatRef.current.name !== initialChat.name
    const originalStore = initialChat.store ? stores?.find((s) => s.name === initialChat.store) : undefined

    const newPanes: PaneData[] = []
    const chatsToAdd: Chat[] = []

    for (let i = 0; i < paneCount; i++) {
      let paneData: PaneData = {
        store: originalStore,
        chat: undefined,
        messages: [],
      }

      // Keep existing pane data if not a new chat
      if (!isNewChat && panes[i]) {
        paneData = { ...panes[i] }
      }

      if (i === 0) {
        // First pane uses initialChat directly
        paneData.chat = initialChat
        if (isNewChat) addedChatsRef.current.add(initialChat.name)
      } else if (!isNewChat && panes[i]?.chat) {
        // Keep existing chat
        paneData.chat = panes[i].chat
      } else {
        // Create new chat for additional panes
        const chat = createNewChat(initialChat, originalStore)
        paneData.chat = chat
        chatsToAdd.push(chat)
      }

      newPanes[i] = paneData
    }

    setPanes(newPanes)

    // Add new chats to backend and load messages
    chatsToAdd.forEach(addChatToBackend)

    newPanes.forEach((pane, index) => {
      if (pane.messages.length === 0 && pane.chat) {
        getMessages(index, pane.chat)
      }
    })

    if (isNewChat) {
      initialChatRef.current = initialChat
      const currentChatNames = new Set(
        newPanes.filter((p) => p.chat?.name).map((p) => p.chat!.name)
      )
      addedChatsRef.current = currentChatNames
    }
  }, [paneCount, initialChat, stores, panes, createNewChat, addChatToBackend, getMessages])

  // Initialize panes when dependencies change
  useEffect(() => {
    if (initialChat) initializePanes()
  }, [paneCount, initialChat?.name, stores])

  const updatePaneStore = useCallback(
    (paneIndex: number, store: Store) => {
      setPanes((prev) =>
        prev.map((pane, i) => (i === paneIndex ? { ...pane, store } : pane))
      )

      const currentChat = panes[paneIndex]?.chat
      if (currentChat && store && currentChat.store !== store.name) {
        const updatedChat = { ...currentChat, store: store.name }
        setPanes((prev) =>
          prev.map((pane, i) => (i === paneIndex ? { ...pane, chat: updatedChat } : pane))
        )

        if (paneIndex === 0) onChatUpdate(updatedChat)

        updateChat(updatedChat.owner, updatedChat.name, updatedChat).catch((err: Error) => {
          toast.error(`${i18next.t("general:Failed to save")}: ${err.message}`)
        })
      }
    },
    [panes, onChatUpdate]
  )

  const updatePaneProvider = useCallback(
    (paneIndex: number, providerName: string) => {
      const currentChat = panes[paneIndex]?.chat
      if (currentChat && currentChat.modelProvider !== providerName) {
        const updatedChat = { ...currentChat, modelProvider: providerName }
        setPanes((prev) =>
          prev.map((pane, i) => (i === paneIndex ? { ...pane, chat: updatedChat } : pane))
        )

        if (paneIndex === 0) onChatUpdate(updatedChat)

        updateChat(updatedChat.owner, updatedChat.name, updatedChat).catch((err: Error) => {
          toast.error(`${i18next.t("general:Failed to save")}: ${err.message}`)
        })
      }
    },
    [panes, onChatUpdate]
  )

  const sendMessage = useCallback(
    (paneIndex: number, text: string) => {
      const chat = panes[paneIndex]?.chat
      if (!chat || !account) return

      const newMessage: Partial<Message> = {
        owner: "admin",
        name: `message_${getRandomName()}`,
        createdTime: new Date().toISOString(),
        organization: account.owner,
        user: account.name,
        store: chat.store,
        chat: chat.name,
        replyTo: "",
        author: account.name,
        text,
        isHidden: false,
        isDeleted: false,
        isAlerted: false,
        isRegenerated: false,
        modelProvider:
          chat?.modelProvider || panes[paneIndex]?.store?.modelProvider || modelProviders[0]?.name || "",
      }

      addMessage(newMessage).then((res) => {
        if (res.status === "ok") {
          getMessages(paneIndex, chat)
        } else {
          toast.error(`${i18next.t("general:Failed to add")}: ${res.msg}`)
        }
      })
    },
    [panes, account, modelProviders, getMessages]
  )

  const handleGlobalInput = useCallback(() => {
    const text = globalInputValue.trim()
    if (!text) return

    panes.forEach((pane, i) => {
      if (pane.chat) sendMessage(i, text)
    })

    setGlobalInputValue("")
  }, [globalInputValue, panes, sendMessage])

  if (!initialChat) {
    return null
  }

  return (
    <div className="flex h-full min-h-0 flex-1 flex-col">
      {/* Panes grid */}
      <div
        className="grid min-h-0 flex-1 gap-0.5 overflow-hidden"
        style={{ gridTemplateColumns: `repeat(${paneCount}, 1fr)` }}
      >
        {Array.from({ length: paneCount }, (_, index) => {
          const pane = panes[index] || { store: undefined, chat: undefined, messages: [] }
          const isLoading = loadingStates.has(index)

          return (
            <div
              key={index}
              className={`flex min-h-0 flex-col ${
                paneCount > 1 ? "border border-border" : ""
              }`}
            >
              {/* Pane header (only in multi-pane mode) */}
              {paneCount > 1 && (
                <ChatHeaderControls
                  chat={pane.chat}
                  stores={stores}
                  currentStore={pane.store}
                  defaultStore={defaultStore}
                  selectedModelProvider={pane.chat?.modelProvider}
                  autoRead={false}
                  onAutoReadChange={() => {}}
                  onChatUpdated={(updated) => {
                    setPanes((prev) =>
                      prev.map((p, i) =>
                        i === index ? { ...p, chat: updated, store: stores.find((s) => s.name === updated.store) } : p
                      )
                    )
                    if (index === 0) onChatUpdate(updated)
                  }}
                  onStoreSelected={(store) => updatePaneStore(index, store)}
                  onDraftModelProviderChange={(provider) => updatePaneProvider(index, provider)}
                  disabled={isLoading}
                />
              )}

              {/* Messages area */}
              <div className="relative min-h-0 flex-1 overflow-hidden">
                {/* Background logo watermark */}
                {pane.messages.length > 0 && (
                  <div
                    className="pointer-events-none absolute inset-0 bg-center bg-no-repeat opacity-[0.04]"
                    style={{
                      backgroundImage: `url(https://cdn.openagentai.org/img/openagent-logo_1900x450.png)`,
                      backgroundSize: "200px auto",
                    }}
                  />
                )}

                <div className="flex h-full min-h-0 flex-col">
                  {pane.messages.length === 0 ? (
                    <div className="flex min-h-0 flex-1 items-center justify-center">
                      <p className="text-sm text-muted-foreground">
                        {t("chat:Send a message to start")}
                      </p>
                    </div>
                  ) : (
                    <div className="min-h-0 flex-1 overflow-y-auto p-4">
                      {pane.messages.map((msg, msgIndex) => (
                        <div
                          key={msg.name || msgIndex}
                          className={`mb-4 ${msg.author === "AI" ? "pr-8" : "pl-8"}`}
                        >
                          <div
                            className={`rounded-lg p-3 ${
                              msg.author === "AI"
                                ? "bg-muted"
                                : "bg-primary text-primary-foreground"
                            }`}
                          >
                            <div
                              className="prose prose-sm dark:prose-invert max-w-none"
                              dangerouslySetInnerHTML={{ __html: msg.html || "" }}
                            />
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              </div>
            </div>
          )
        })}
      </div>

      {/* Global input (only in multi-pane mode) */}
      {paneCount > 1 && (
        <div className="border-t border-border p-3">
          <div className="flex items-end gap-2">
            <Textarea
              value={globalInputValue}
              onChange={(e) => setGlobalInputValue(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter" && !e.shiftKey) {
                  e.preventDefault()
                  handleGlobalInput()
                }
              }}
              placeholder={t("chat:Send message to all panes...")}
              className="min-h-[40px] max-h-[120px] resize-none"
              rows={1}
            />
            <Button
              size="icon"
              onClick={handleGlobalInput}
              disabled={!globalInputValue.trim() || loadingStates.size > 0}
            >
              <SendIcon className="h-4 w-4" />
            </Button>
          </div>
        </div>
      )}
    </div>
  )
}
