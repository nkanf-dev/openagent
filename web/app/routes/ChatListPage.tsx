import { useCallback, useEffect, useState } from "react"
import { Link, useNavigate } from "react-router"
import { DownloadIcon, EditIcon, Loader2Icon, MaximizeIcon, MinimizeIcon, PlusIcon, Trash2Icon } from "lucide-react"
import { toast } from "sonner"
import i18next from "i18next"
import * as XLSX from "xlsx"
import "~/i18n"

import { isLocalAdminUser, isBasicLoginMode, type Account } from "~/backend/AccountBackend"
import {
  getGlobalChats,
  addChat,
  deleteChat,
  type Chat,
} from "~/backend/ChatBackend"
import { getProviders, getProviderLogoUrl, type Provider } from "~/backend/ProviderBackend"
import { getChatMessages } from "~/backend/MessageBackend"
import { useAccount } from "~/context/AccountContext"
import { useStoreFilter } from "~/hooks/useStoreFilter"
import { getAuthConfig } from "~/lib/AuthConfig"
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "~/components/ui/alert-dialog"
import { Badge } from "~/components/ui/badge"
import { Button } from "~/components/ui/button"
import { Checkbox } from "~/components/ui/checkbox"
import { Input } from "~/components/ui/input"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "~/components/ui/select"
import { Switch } from "~/components/ui/switch"
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "~/components/ui/table"
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "~/components/ui/tooltip"
import { useDeclareStoreFilter } from "~/context/StoreFilterContext"

export function meta() {
  return [{ title: "Chats - OpenAgent" }]
}

type SortOrder = "ascend" | "descend" | ""
type Pagination = { current: number; pageSize: number; total: number }
type MessageMap = Record<string, Array<{ author: string; text: string }>>

const PAGE_SIZE_OPTIONS = [10, 20, 50, 100, 1000]

function getFormattedDate(date?: string | null): string {
  if (!date) return ""
  return date.replace("T", " ").replace("+08:00", " ").trim()
}

function getDisplayPrice(price?: number | null, currency?: string): string {
  if (price === null || price === undefined) return ""
  const tmp = price.toFixed(7)
  let s = tmp.replace(/(\.\d*?[1-9])0+$/, "$1").replace(/\.$/, "")
  if (price === 0) s = "0"
  const prefix = currency === "CNY" ? "￥" : "$"
  return `${prefix}${s}`
}

function randomName(): string {
  return Math.random().toString(36).slice(2, 8)
}

function newChat(account: Account): Chat {
  const rand = randomName()
  return {
    owner: "admin",
    name: `chat_${rand}`,
    createdTime: new Date().toISOString(),
    updatedTime: new Date().toISOString(),
    organization: account.owner,
    displayName: `${i18next.t("chat:New Chat")} - ${rand}`,
    category: i18next.t("chat:Default Category"),
    user: account.name,
    clientIp: "",
    userAgent: "",
    messageCount: 0,
    tokenCount: 0,
    needTitle: true,
    store: "",
  }
}

function renderUserAgent(record: Chat): string {
  if (!record.userAgentDesc) return record.userAgent || ""
  return record.userAgentDesc
    .split("|")
    .filter((t) => !t.includes("Other") && !t.includes("Generic Smartphone"))
    .join(" | ")
}

function ChatMessagesPreview({ messages }: { messages: Array<{ author: string; text: string }> }) {
  if (!messages || messages.length === 0) return null
  return (
    <div className="flex flex-col gap-1 overflow-y-auto" style={{ height: "300px", fontSize: "12px" }}>
      {messages.map((msg, i) => (
        <div
          key={i}
          className={`rounded px-2 py-1 ${
            msg.author === "AI"
              ? "bg-muted text-muted-foreground"
              : "bg-primary/10 text-foreground self-end"
          }`}
          style={{ maxWidth: "90%", alignSelf: msg.author === "AI" ? "flex-start" : "flex-end", whiteSpace: "pre-wrap", wordBreak: "break-word" }}
        >
          <span className="font-semibold mr-1">{msg.author === "AI" ? "AI:" : `${msg.author}:`}</span>
          {msg.text?.slice(0, 500)}{(msg.text?.length ?? 0) > 500 ? "..." : ""}
        </div>
      ))}
    </div>
  )
}

export default function ChatListPage() {
  useDeclareStoreFilter(true)
  const navigate = useNavigate()
  const { account } = useAccount()
  const storeFilter = useStoreFilter()
  const [chats, setChats] = useState<Chat[]>([])
  const [pagination, setPagination] = useState<Pagination>({ current: 1, pageSize: 20, total: 0 })
  const [loading, setLoading] = useState(false)
  const [sortField, setSortField] = useState("")
  const [sortOrder, setSortOrder] = useState<SortOrder>("")
  const [searchField, setSearchField] = useState("name")
  const [searchValue, setSearchValue] = useState("")
  const [selected, setSelected] = useState<string[]>([])
  const [deleteTarget, setDeleteTarget] = useState<Chat | null>(null)
  const [bulkDeleteOpen, setBulkDeleteOpen] = useState(false)
  const [messagesMap, setMessagesMap] = useState<MessageMap>({})
  const [providerMap, setProviderMap] = useState<Record<string, Provider>>({})
  const [filterSingleChat, setFilterSingleChat] = useState(() => {
    try { return localStorage.getItem("filterSingleChat") === "true" } catch { return false }
  })
  const [maximizeMessages, setMaximizeMessages] = useState(() => {
    try { return localStorage.getItem("maximizeMessages") === "true" } catch { return false }
  })
  const [downloadLoading, setDownloadLoading] = useState(false)

  const isAdmin = isLocalAdminUser(account)
  const isRealAdmin = account?.name === "admin"
  const isBasic = isBasicLoginMode(account)

  const fetchChats = useCallback(
    (params: {
      current?: number
      pageSize?: number
      sortField?: string
      sortOrder?: SortOrder
      field?: string
      value?: string
    } = {}) => {
      const current = params.current ?? pagination.current
      const pageSize = params.pageSize ?? pagination.pageSize
      const sf = params.sortField ?? sortField
      const so = params.sortOrder ?? sortOrder
      const field = params.field ?? searchField
      const value = params.value ?? searchValue
      setLoading(true)
      getGlobalChats(current, pageSize, field, value, sf, so, storeFilter ?? "")
        .then((res) => {
          setLoading(false)
          if (res.status === "ok") {
            let data: Chat[] = res.data ?? []
            if (account?.name !== "admin") {
              data = data.filter((c) => c.user !== "admin")
            }
            setChats(data)
            setPagination((p) => ({ ...p, current, pageSize, total: res.data2 ?? 0 }))
            setSortField(sf)
            setSortOrder(so)
            setSearchField(field)
            setSearchValue(value)
            setSelected([])
            // fetch messages for chats with more than 1 message
            data.forEach((chat) => {
              if ((chat.messageCount ?? 0) > 1) {
                fetchMessages(chat.name)
              }
            })
          } else {
            toast.error(`${i18next.t("general:Failed to get")}: ${res.msg}`)
          }
        })
        .catch((err: Error) => {
          setLoading(false)
          toast.error(err.message)
        })
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [account?.name, pagination.current, pagination.pageSize, sortField, sortOrder, searchField, searchValue, storeFilter]
  )

  function fetchMessages(chatName: string) {
    getChatMessages("admin", chatName).then((res) => {
      if (res.status === "ok" && res.data) {
        setMessagesMap((prev) => ({ ...prev, [chatName]: res.data }))
      }
    })
  }

  useEffect(() => {
    if (account !== undefined) {
      fetchChats({ current: 1 })
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [account?.name, storeFilter])

  useEffect(() => {
    getProviders("admin", "", "", "10000", "", "", "", "").then((res) => {
      if (res.status === "ok") {
        const map: Record<string, Provider> = {}
        ;(res.data ?? []).forEach((p: Provider) => { map[p.name] = p })
        setProviderMap(map)
      }
    })
  }, [])

  function handleAdd() {
    if (!account) return
    const chat = { ...newChat(account), store: storeFilter ?? "" }
    addChat(chat)
      .then((res) => {
        if (res.status === "ok") {
          toast.success(i18next.t("general:Successfully added"))
          navigate(`/chats/${chat.name}`, { state: { isNewChat: true } })
        } else {
          toast.error(`${i18next.t("general:Failed to add")}: ${res.msg}`)
        }
      })
      .catch((err: Error) => toast.error(err.message))
  }

  function handleDelete(chat: Chat) {
    deleteChat(chat)
      .then((res) => {
        if (res.status === "ok") {
          toast.success(i18next.t("general:Successfully deleted"))
          setChats((prev) => prev.filter((c) => c.name !== chat.name))
          setPagination((p) => ({ ...p, total: Math.max(0, p.total - 1) }))
        } else {
          toast.error(`${i18next.t("general:Failed to delete")}: ${res.msg}`)
        }
      })
      .catch((err: Error) => toast.error(err.message))
    setDeleteTarget(null)
  }

  async function handleBulkDelete() {
    const targets = chats.filter((c) => selected.includes(c.name))
    for (const chat of targets) {
      const res = await deleteChat(chat)
      if (res.status !== "ok") {
        toast.error(`${i18next.t("general:Failed to delete")}: ${chat.name}: ${res.msg}`)
        setBulkDeleteOpen(false)
        fetchChats({ current: 1 })
        return
      }
    }
    toast.success(i18next.t("general:Successfully deleted"))
    setChats((prev) => prev.filter((c) => !targets.some((t) => t.name === c.name)))
    setPagination((p) => ({ ...p, total: Math.max(0, p.total - targets.length) }))
    setSelected([])
    setBulkDeleteOpen(false)
  }

  function applySearch() {
    fetchChats({ current: 1, field: searchField, value: searchValue })
  }

  function toggleMaximizeMessages() {
    const next = !maximizeMessages
    setMaximizeMessages(next)
    try { localStorage.setItem("maximizeMessages", String(next)) } catch { /* ignore */ }
  }

  async function handleDownload() {
    const total = pagination.total
    if (!total) {
      toast.info(i18next.t("general:No data"))
      return
    }
    setDownloadLoading(true)
    try {
      const chunkSize = 10000
      const pageSize = Math.min(chunkSize, total)
      const all: Chat[] = []
      let page = 1
      while (all.length < total) {
        const res = await getGlobalChats(page, pageSize, searchField, searchValue, sortField, sortOrder, storeFilter ?? "")
        if (res.status !== "ok") {
          toast.error(res.msg)
          return
        }
        const batch: Chat[] = res.data ?? []
        all.push(...batch)
        if (batch.length === 0 || batch.length < pageSize) break
        page++
      }
      const sorted = [...all].sort((a, b) => {
        const ta = a.createdTime || a.updatedTime || ""
        const tb = b.createdTime || b.updatedTime || ""
        const diff = ta.localeCompare(tb)
        return diff !== 0 ? diff : (a.name || "").localeCompare(b.name || "")
      })
      const rows = sorted.map((item) => ({
        [i18next.t("general:Name")]: item.name,
        [i18next.t("general:Store")]: item.store,
        [i18next.t("general:Created time")]: getFormattedDate(item.createdTime),
        [i18next.t("general:Updated time")]: getFormattedDate(item.updatedTime),
        [i18next.t("general:Display name")]: item.displayName,
        [i18next.t("general:User")]: item.user,
        [i18next.t("general:Model")]: item.modelProvider,
        [i18next.t("general:Client IP")]: [item.clientIp, item.clientIpDesc].filter(Boolean).join(" ").trim(),
        [i18next.t("general:Count")]: item.messageCount,
        [i18next.t("chat:Token count")]: item.tokenCount,
        [i18next.t("chat:Price")]: getDisplayPrice(item.price, item.currency),
        [i18next.t("general:Is deleted")]: item.isDeleted ? i18next.t("general:ON") : i18next.t("general:OFF"),
      }))
      const ws = XLSX.utils.json_to_sheet(rows)
      ws["!cols"] = [18, 14, 22, 22, 28, 12, 14, 28, 8, 10, 12, 10].map((w) => ({ wch: w }))
      const wb = XLSX.utils.book_new()
      XLSX.utils.book_append_sheet(wb, ws, i18next.t("general:Chats"))
      const now = getFormattedDate(new Date().toISOString())
      XLSX.writeFile(wb, `${i18next.t("general:Chats")}-${now}.xlsx`)
    } finally {
      setDownloadLoading(false)
    }
  }

  function getUserProfileUrl(username: string): string {
    const config = getAuthConfig()
    if (!config.issuer || !config.organizationName) return ""
    return `${config.issuer}/users/${config.organizationName}/${username}`
  }

  const visibleChats = filterSingleChat
    ? chats.filter((c) => (c.messageCount ?? 0) > 1)
    : chats

  const totalPages = Math.max(1, Math.ceil(pagination.total / pagination.pageSize))
  const messagesWidth = maximizeMessages ? "70vw" : "800px"

  const uniqueUsers = new Set(visibleChats.map((c) => c.user)).size
  const totalChats = visibleChats.length
  const totalMessages = visibleChats.reduce((s, c) => s + (c.messageCount ?? 0), 0)
  const totalTokens = visibleChats.reduce((s, c) => s + (c.tokenCount ?? 0), 0)
  const totalPrice = visibleChats.reduce((s, c) => s + (c.price ?? 0), 0)

  return (
    <div className="flex flex-col gap-4 p-6">
      {/* Header */}
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">{i18next.t("general:Chats")}</h1>
          <p className="mt-0.5 text-sm text-muted-foreground">
            {i18next.t("general:{total} in total").replace("{total}", String(pagination.total))}
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          {/* Search */}
          <Select value={searchField} onValueChange={(v) => setSearchField(v ?? "name")}>
            <SelectTrigger className="h-8 w-36">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="store">{i18next.t("general:Store")}</SelectItem>
              <SelectItem value="name">{i18next.t("general:Name")}</SelectItem>
              <SelectItem value="user">{i18next.t("general:User")}</SelectItem>
              <SelectItem value="modelProvider">{i18next.t("general:Model")}</SelectItem>
              <SelectItem value="clientIp">{i18next.t("general:Client IP")}</SelectItem>
            </SelectContent>
          </Select>
          <Input
            className="h-8 w-44"
            value={searchValue}
            onChange={(e) => setSearchValue(e.target.value)}
            onKeyDown={(e) => { if (e.key === "Enter") applySearch() }}
          />
          <Button variant="outline" size="sm" onClick={applySearch}>
            {i18next.t("general:Search")}
          </Button>

          {/* Bulk delete */}
          {selected.length > 0 && (
            <Button variant="destructive" size="sm" onClick={() => setBulkDeleteOpen(true)}>
              <Trash2Icon className="h-4 w-4" />
              {i18next.t("general:Delete")} ({selected.length})
            </Button>
          )}

          {/* Download */}
          <Button variant="outline" size="sm" disabled={downloadLoading} onClick={handleDownload}>
            {downloadLoading
              ? <Loader2Icon className="h-4 w-4 animate-spin" />
              : <DownloadIcon className="h-4 w-4" />
            }
            {i18next.t("general:Download")}
          </Button>

          {/* Add */}
          {isAdmin && (
            <Button size="sm" onClick={handleAdd}>
              <PlusIcon className="h-4 w-4" />
              {i18next.t("general:Add")}
            </Button>
          )}
        </div>
      </div>

      {/* Controls */}
      <div className="flex flex-wrap items-center gap-6 text-sm">
        <label className="flex items-center gap-2 cursor-pointer">
          <span className="text-muted-foreground">{i18next.t("chat:Maximize messages")}:</span>
          <Switch
            checked={maximizeMessages}
            onCheckedChange={toggleMaximizeMessages}
            size="sm"
          />
        </label>
        <label className="flex items-center gap-2 cursor-pointer">
          <span className="text-muted-foreground">{i18next.t("chat:Filter single chat")}:</span>
          <Switch
            checked={filterSingleChat}
            onCheckedChange={(v) => {
              setFilterSingleChat(v)
              try { localStorage.setItem("filterSingleChat", String(v)) } catch { /* ignore */ }
            }}
            size="sm"
          />
        </label>
        <span className="text-muted-foreground">
          {i18next.t("general:Users")}: <Badge variant="secondary">{uniqueUsers}</Badge>
        </span>
        <span className="text-muted-foreground">
          {i18next.t("general:Chats")}: <Badge variant="secondary">{totalChats}</Badge>
        </span>
        <span className="text-muted-foreground">
          {i18next.t("general:Messages")}: <Badge variant="secondary">{totalMessages}</Badge>
        </span>
        {isRealAdmin && (
          <>
            <span className="text-muted-foreground">
              {i18next.t("general:Tokens")}: <Badge variant="secondary">{totalTokens}</Badge>
            </span>
            <span className="text-muted-foreground">
              {i18next.t("chat:Price")}: <Badge variant={totalPrice === 0 ? "secondary" : "outline"} className={totalPrice > 0 ? "border-orange-400 text-orange-600 font-bold" : ""}>{getDisplayPrice(totalPrice)}</Badge>
            </span>
          </>
        )}
      </div>

      {/* Table */}
      <div className="overflow-x-auto rounded-xl border border-border bg-card">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead className="w-10">
                <Checkbox
                  checked={visibleChats.length > 0 && selected.length === visibleChats.length}
                  onCheckedChange={(checked) => setSelected(checked ? visibleChats.map((c) => c.name) : [])}
                />
              </TableHead>
              <TableHead className="w-32">{i18next.t("general:Store")}</TableHead>
              {isRealAdmin && <TableHead className="w-32">{i18next.t("general:Name")}</TableHead>}
              <TableHead className="w-36">{i18next.t("general:Updated time")}</TableHead>
              {!isBasic && <TableHead className="w-28">{i18next.t("general:User")}</TableHead>}
              <TableHead className="w-20 text-center">{i18next.t("general:Model")}</TableHead>
              {!isBasic && isRealAdmin && <TableHead className="w-40">{i18next.t("general:Client IP")}</TableHead>}
              <TableHead className="w-32">{i18next.t("general:Stats")}</TableHead>
              <TableHead style={{ minWidth: messagesWidth }}>{i18next.t("general:Messages")}</TableHead>
              <TableHead className="w-24 text-right">{i18next.t("general:Action")}</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {loading ? (
              <TableRow>
                <TableCell colSpan={12} className="py-16 text-center">
                  <div className="flex items-center justify-center gap-2 text-muted-foreground">
                    <Loader2Icon className="h-4 w-4 animate-spin" />
                    {i18next.t("general:Loading")}
                  </div>
                </TableCell>
              </TableRow>
            ) : visibleChats.length === 0 ? (
              <TableRow>
                <TableCell colSpan={12} className="py-16 text-center text-muted-foreground">
                  {i18next.t("general:No data")}
                </TableCell>
              </TableRow>
            ) : (
              visibleChats.map((chat) => {
                const provider = chat.modelProvider ? providerMap[chat.modelProvider] : undefined
                const messages = messagesMap[chat.name]

                const ipDesc = chat.clientIpDesc
                  ? chat.clientIpDesc.split(",").map((s) => s.trim()).filter(Boolean).join(", ")
                  : ""
                const uaText = renderUserAgent(chat)

                return (
                  <TableRow
                    key={chat.name}
                    className={chat.isDeleted ? "bg-red-50 dark:bg-red-950/20" : ""}
                  >
                    <TableCell>
                      <Checkbox
                        checked={selected.includes(chat.name)}
                        onCheckedChange={(checked) =>
                          setSelected((prev) =>
                            checked ? [...prev, chat.name] : prev.filter((n) => n !== chat.name)
                          )
                        }
                      />
                    </TableCell>

                    {/* Store */}
                    <TableCell className="text-sm">
                      {chat.store ? (
                        <Link to={`/stores/${chat.owner}/${chat.store}`} className="text-primary hover:underline">
                          {chat.store}
                        </Link>
                      ) : null}
                    </TableCell>

                    {/* Name (admin only) */}
                    {isRealAdmin && (
                      <TableCell className="text-sm">
                        <Link to={`/chats/${chat.name}`} className="text-primary hover:underline">
                          {chat.name}
                        </Link>
                      </TableCell>
                    )}

                    {/* Updated time */}
                    <TableCell className="text-sm text-muted-foreground">
                      {getFormattedDate(chat.updatedTime)}
                    </TableCell>

                    {/* User */}
                    {!isBasic && (
                      <TableCell className="text-sm">
                        {chat.user?.startsWith("u-") ? (
                          chat.user
                        ) : (
                          <a
                            href={getUserProfileUrl(chat.user)}
                            target="_blank"
                            rel="noreferrer"
                            className="text-primary hover:underline"
                          >
                            {chat.user}
                          </a>
                        )}
                      </TableCell>
                    )}

                    {/* Model */}
                    <TableCell className="text-center">
                      {chat.modelProvider ? (
                        provider ? (
                          <Tooltip>
                            <TooltipTrigger>
                              <a href={`/providers/${chat.modelProvider}`} target="_blank" rel="noreferrer" className="inline-flex">
                                <img
                                  src={getProviderLogoUrl(provider)}
                                  alt={provider.type}
                                  className="h-9 w-9 object-contain mx-auto"
                                  onError={(e) => { (e.currentTarget as HTMLImageElement).src = "https://cdn.openagentai.org/img/social_default.png" }}
                                />
                              </a>
                            </TooltipTrigger>
                            <TooltipContent>{provider.type}</TooltipContent>
                          </Tooltip>
                        ) : (
                          <span className="text-xs">{chat.modelProvider}</span>
                        )
                      ) : null}
                    </TableCell>

                    {/* Client IP (admin only) */}
                    {!isBasic && isRealAdmin && (
                      <TableCell className="text-sm">
                        {chat.clientIp ? (
                          <a
                            href={`https://db-ip.com/${chat.clientIp}`}
                            target="_blank"
                            rel="noreferrer"
                            className="text-primary hover:underline"
                          >
                            <div>
                              {chat.clientIp}
                              {ipDesc && <div className="text-xs text-muted-foreground">{ipDesc}</div>}
                              {uaText && <div className="text-xs text-muted-foreground">{uaText}</div>}
                            </div>
                          </a>
                        ) : null}
                      </TableCell>
                    )}

                    {/* Stats */}
                    <TableCell className="text-sm" style={{ lineHeight: "1.6" }}>
                      <Link to={`/messages?chat=${chat.name}`} className="text-primary hover:underline">
                        {chat.messageCount ?? 0}
                      </Link>
                      {isRealAdmin && (
                        <>
                          <div className="text-muted-foreground">{chat.tokenCount ?? 0}</div>
                          <div className="text-muted-foreground">{getDisplayPrice(chat.price, chat.currency)}</div>
                        </>
                      )}
                    </TableCell>

                    {/* Messages preview */}
                    <TableCell>
                      {messages && messages.length > 0 ? (
                        <div
                          className="rounded-md bg-muted/50 border border-border p-1"
                          style={{ width: messagesWidth }}
                        >
                          <ChatMessagesPreview messages={messages} />
                        </div>
                      ) : null}
                    </TableCell>

                    {/* Action */}
                    <TableCell className="text-right">
                      <div className="flex items-center justify-end gap-1">
                        <Tooltip>
                          <TooltipTrigger>
                            <Button
                              variant="ghost"
                              size="icon"
                              className="h-7 w-7"
                              onClick={() => navigate(`/chats/${chat.name}`)}
                            >
                              <EditIcon className="h-3.5 w-3.5" />
                            </Button>
                          </TooltipTrigger>
                          <TooltipContent>{i18next.t("general:Edit")}</TooltipContent>
                        </Tooltip>
                        {isAdmin && (
                          <Tooltip>
                            <TooltipTrigger>
                              <Button
                                variant="ghost"
                                size="icon"
                                className="h-7 w-7 text-destructive hover:text-destructive"
                                onClick={() => setDeleteTarget(chat)}
                              >
                                <Trash2Icon className="h-3.5 w-3.5" />
                              </Button>
                            </TooltipTrigger>
                            <TooltipContent>{i18next.t("general:Delete")}</TooltipContent>
                          </Tooltip>
                        )}
                      </div>
                    </TableCell>
                  </TableRow>
                )
              })
            )}
          </TableBody>
        </Table>
      </div>

      {/* Pagination */}
      {pagination.total > 0 && (
        <div className="flex items-center justify-between text-sm text-muted-foreground">
          <div className="flex items-center gap-2">
            <span>{i18next.t("general:{total} in total").replace("{total}", String(pagination.total))}</span>
            <Select
              value={String(pagination.pageSize)}
              onValueChange={(v) => fetchChats({ current: 1, pageSize: Number(v) })}
            >
              <SelectTrigger className="h-7 w-24">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {PAGE_SIZE_OPTIONS.map((n) => (
                  <SelectItem key={n} value={String(n)}>{n} / {i18next.t("general:Page")}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="flex items-center gap-1">
            <Button variant="outline" size="sm" disabled={pagination.current <= 1} onClick={() => fetchChats({ current: pagination.current - 1 })}>
              {i18next.t("general:Previous")}
            </Button>
            <span className="px-2">{pagination.current} / {totalPages}</span>
            <Button variant="outline" size="sm" disabled={pagination.current >= totalPages} onClick={() => fetchChats({ current: pagination.current + 1 })}>
              {i18next.t("general:Next")}
            </Button>
          </div>
        </div>
      )}

      {/* Delete single dialog */}
      <AlertDialog open={!!deleteTarget}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>{i18next.t("general:Sure to delete")}</AlertDialogTitle>
            <AlertDialogDescription>{deleteTarget?.name}</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel onClick={() => setDeleteTarget(null)}>{i18next.t("general:Cancel")}</AlertDialogCancel>
            <AlertDialogAction variant="destructive" onClick={() => deleteTarget && handleDelete(deleteTarget)}>
              {i18next.t("general:OK")}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Bulk delete dialog */}
      <AlertDialog open={bulkDeleteOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>{i18next.t("general:Sure to delete")}</AlertDialogTitle>
            <AlertDialogDescription>
              {selected.length} {i18next.t("general:items")}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel onClick={() => setBulkDeleteOpen(false)}>{i18next.t("general:Cancel")}</AlertDialogCancel>
            <AlertDialogAction variant="destructive" onClick={handleBulkDelete}>
              {i18next.t("general:OK")}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  )
}
