import { useCallback, useEffect, useState } from "react"
import { Link, useNavigate, useSearchParams } from "react-router"
import { DownloadIcon, EditIcon, Loader2Icon, PlusIcon, Trash2Icon } from "lucide-react"
import { toast } from "sonner"
import i18next from "i18next"
import * as XLSX from "xlsx"
import "~/i18n"

import { isLocalAdminUser } from "~/backend/AccountBackend"
import { getGlobalMessages, addMessage, deleteMessage, type Message } from "~/backend/MessageBackend"
import { getProviders, type Provider } from "~/backend/ProviderBackend"
import { getProviderLogoURL } from "~/lib/ProviderSetting"
import { useAccount } from "~/context/AccountContext"
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

export function meta() {
  return [{ title: "Messages - OpenAgent" }]
}

type SortOrder = "ascend" | "descend" | ""
type Pagination = { current: number; pageSize: number; total: number }

const PAGE_SIZE_OPTIONS = [10, 20, 50, 100, 1000, 10000, 100000]

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

function getShortText(s: string, maxLength = 200): string {
  if (!s) return ""
  return s.length > maxLength ? `${s.slice(0, maxLength)}...` : s
}

function uniqueCount<T>(items: T[], field: keyof T): number {
  return new Set(items.map((item) => item[field])).size
}

function sumField(items: Message[], field: keyof Message): number {
  return items.reduce((sum, item) => sum + ((item[field] as number) ?? 0), 0)
}

function getUserProfileUrl(username: string, orgName: string): string {
  const { issuer } = getAuthConfig()
  if (!issuer) return ""
  return `${issuer}/users/${orgName}/${username}`
}

function getAuthorProfileUrl(author: string, organization: string): string {
  const { issuer } = getAuthConfig()
  if (!issuer) return ""
  let userId = author
  if (!userId.includes("/")) userId = `${organization}/${userId}`
  return `${issuer}/users/${userId}`
}

function LongTextCell({ text }: { text?: string | null }) {
  if (!text) return null
  const plain = text.replace(/<[^>]*>/g, "")
  if (plain.length <= 200) {
    return <div className="max-w-72 whitespace-pre-wrap break-words" dangerouslySetInnerHTML={{ __html: text }} />
  }
  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <div className="max-w-72 cursor-pointer line-clamp-5 whitespace-pre-wrap break-words">
          {getShortText(plain, 200)}
        </div>
      </TooltipTrigger>
      <TooltipContent
        side="left"
        className="max-h-96 max-w-2xl overflow-auto whitespace-pre-wrap break-words"
      >
        <div dangerouslySetInnerHTML={{ __html: text }} />
      </TooltipContent>
    </Tooltip>
  )
}

export default function MessageListPage() {
  const navigate = useNavigate()
  const [searchParams] = useSearchParams()
  const { account } = useAccount()

  const [messages, setMessages] = useState<Message[]>([])
  const [pagination, setPagination] = useState<Pagination>({ current: 1, pageSize: 10, total: 0 })
  const [loading, setLoading] = useState(false)
  const [sortField, setSortField] = useState("")
  const [sortOrder, setSortOrder] = useState<SortOrder>("")
  const [searchField, setSearchField] = useState("name")
  const [searchValue, setSearchValue] = useState("")
  const [selected, setSelected] = useState<string[]>([])
  const [deleteTarget, setDeleteTarget] = useState<Message | null>(null)
  const [bulkDeleteOpen, setBulkDeleteOpen] = useState(false)
  const [providerMap, setProviderMap] = useState<Record<string, Provider>>({})
  const [downloadLoading, setDownloadLoading] = useState(false)

  const isAdmin = isLocalAdminUser(account)
  const isRealAdmin = account?.name === "admin"

  const storeParam = searchParams.get("store") || ""
  const storeForApi = storeParam && account ? `${account.owner}/${storeParam}` : ""

  const fetchMessages = useCallback(
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
      getGlobalMessages(current, pageSize, field, value, sf, so, storeForApi)
        .then((res) => {
          setLoading(false)
          if (res.status === "ok") {
            setMessages(res.data ?? [])
            setPagination((p) => ({ ...p, current, pageSize, total: res.data2 ?? 0 }))
            setSortField(sf)
            setSortOrder(so)
            setSearchField(field)
            setSearchValue(value)
            setSelected([])
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
    [pagination.current, pagination.pageSize, sortField, sortOrder, searchField, searchValue, storeForApi]
  )

  useEffect(() => {
    if (account === undefined) return
    const chatFilter = searchParams.get("chat")
    if (chatFilter) {
      setSearchField("chat")
      setSearchValue(chatFilter)
      fetchMessages({ current: 1, field: "chat", value: chatFilter })
    } else {
      fetchMessages({ current: 1 })
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [account?.name])

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
    const rand = Math.random().toString(36).slice(2, 8)
    const msg: Partial<Message> = {
      owner: "admin",
      name: `message_${rand}`,
      createdTime: new Date().toISOString(),
      organization: account.owner,
      user: account.name,
      chat: "",
      replyTo: "",
      author: account.name,
      text: "Hello",
      tokenCount: 0,
      textTokenCount: 0,
      price: 0,
      store: storeForApi,
    }
    addMessage(msg)
      .then((res) => {
        if (res.status === "ok") {
          toast.success(i18next.t("general:Successfully added"))
          navigate(`/messages/${msg.name}`, { state: { isNewMessage: true } })
        } else {
          toast.error(`${i18next.t("general:Failed to add")}: ${res.msg}`)
        }
      })
      .catch((err: Error) => toast.error(err.message))
  }

  function handleDelete(msg: Message) {
    deleteMessage(msg)
      .then((res) => {
        if (res.status === "ok") {
          toast.success(i18next.t("general:Successfully deleted"))
          setMessages((prev) => prev.filter((m) => m.name !== msg.name))
          setPagination((p) => ({ ...p, total: Math.max(0, p.total - 1) }))
        } else {
          toast.error(`${i18next.t("general:Failed to delete")}: ${res.msg}`)
        }
      })
      .catch((err: Error) => toast.error(err.message))
    setDeleteTarget(null)
  }

  async function handleBulkDelete() {
    const targets = messages.filter((m) => selected.includes(m.name))
    for (const msg of targets) {
      const res = await deleteMessage(msg)
      if (res.status !== "ok") {
        toast.error(`${i18next.t("general:Failed to delete")}: ${msg.name}: ${res.msg}`)
        setBulkDeleteOpen(false)
        return
      }
    }
    toast.success(i18next.t("general:Successfully deleted"))
    setMessages((prev) => prev.filter((m) => !targets.some((t) => t.name === m.name)))
    setPagination((p) => ({ ...p, total: Math.max(0, p.total - targets.length) }))
    setSelected([])
    setBulkDeleteOpen(false)
  }

  function applySearch() {
    fetchMessages({ current: 1, field: searchField, value: searchValue })
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
      const all: Message[] = []
      let page = 1
      while (all.length < total) {
        const res = await getGlobalMessages(page, pageSize, searchField, searchValue, sortField, sortOrder, storeForApi)
        if (res.status !== "ok") {
          toast.error(res.msg)
          return
        }
        const batch: Message[] = res.data ?? []
        all.push(...batch)
        if (batch.length === 0 || batch.length < pageSize) break
        page++
      }
      const sorted = [...all].sort((a, b) => {
        const diff = (a.createdTime || "").localeCompare(b.createdTime || "")
        return diff !== 0 ? diff : (a.name || "").localeCompare(b.name || "")
      })
      const rows = sorted.map((item) => ({
        [i18next.t("message:Author")]: item.author,
        [i18next.t("general:Chat")]: item.chat,
        [i18next.t("general:Message")]: item.name,
        [i18next.t("general:Created time")]: getFormattedDate(item.createdTime),
        [i18next.t("general:User")]: item.user,
        [i18next.t("general:Text")]: item.text,
        [i18next.t("message:Error text")]: item.errorText,
      }))
      const ws = XLSX.utils.json_to_sheet(rows)
      ws["!cols"] = [
        { wch: 12 }, { wch: 15 }, { wch: 15 }, { wch: 30 },
        { wch: 15 }, { wch: 50 }, { wch: 50 },
      ]
      const wb = XLSX.utils.book_new()
      XLSX.utils.book_append_sheet(wb, ws, i18next.t("general:Messages"))
      const now = getFormattedDate(new Date().toISOString())
      XLSX.writeFile(wb, `${i18next.t("general:Messages")}-${now}.xlsx`)
    } finally {
      setDownloadLoading(false)
    }
  }

  const totalPages = Math.max(1, Math.ceil(pagination.total / pagination.pageSize))
  const userCount = uniqueCount(messages, "user")
  const chatCount = uniqueCount(messages, "chat")
  const tokenSum = sumField(messages, "tokenCount")
  const priceSum = sumField(messages, "price")
  const currency = messages[0]?.currency

  const colSpan = 18 + (isRealAdmin ? 3 : 0)

  return (
    <div className="flex flex-col gap-4 p-6">
      {/* Header */}
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">{i18next.t("general:Messages")}</h1>
          <p className="mt-0.5 flex flex-wrap items-center gap-2 text-sm text-muted-foreground">
            <span>
              {i18next.t("general:Users")}: <strong>{userCount}</strong>
            </span>
            <span>·</span>
            <span>
              {i18next.t("general:Chats")}: <strong>{chatCount}</strong>
            </span>
            <span>·</span>
            <span>
              {i18next.t("general:Messages")}: <strong>{pagination.total}</strong>
            </span>
            {isRealAdmin && (
              <>
                <span>·</span>
                <span>
                  {i18next.t("general:Tokens")}: <strong>{tokenSum}</strong>
                </span>
                <span>·</span>
                <span>
                  {i18next.t("chat:Price")}: <strong>{getDisplayPrice(priceSum, currency)}</strong>
                </span>
              </>
            )}
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <Select value={searchField} onValueChange={(v) => setSearchField(v ?? "name")}>
            <SelectTrigger className="h-8 w-36">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="name">{i18next.t("general:Name")}</SelectItem>
              <SelectItem value="store">{i18next.t("general:Store")}</SelectItem>
              <SelectItem value="user">{i18next.t("general:User")}</SelectItem>
              <SelectItem value="chat">{i18next.t("general:Chat")}</SelectItem>
              <SelectItem value="replyTo">{i18next.t("message:Reply to")}</SelectItem>
              <SelectItem value="author">{i18next.t("message:Author")}</SelectItem>
              <SelectItem value="modelProvider">{i18next.t("general:Model")}</SelectItem>
              <SelectItem value="reasonText">{i18next.t("general:Reasoning text")}</SelectItem>
              <SelectItem value="text">{i18next.t("general:Text")}</SelectItem>
              <SelectItem value="errorText">{i18next.t("message:Error text")}</SelectItem>
              <SelectItem value="comment">{i18next.t("message:Comment")}</SelectItem>
            </SelectContent>
          </Select>
          <Input
            className="h-8 w-52"
            value={searchValue}
            onChange={(e) => setSearchValue(e.target.value)}
            onKeyDown={(e) => { if (e.key === "Enter") applySearch() }}
          />
          <Button variant="outline" size="sm" onClick={applySearch}>
            {i18next.t("general:Search")}
          </Button>
          {selected.length > 0 && (
            <Button variant="destructive" size="sm" onClick={() => setBulkDeleteOpen(true)}>
              <Trash2Icon className="h-4 w-4" />
              {i18next.t("general:Delete")} ({selected.length})
            </Button>
          )}
          <Button variant="outline" size="sm" disabled={downloadLoading} onClick={handleDownload}>
            {downloadLoading
              ? <Loader2Icon className="h-4 w-4 animate-spin" />
              : <DownloadIcon className="h-4 w-4" />}
            {i18next.t("general:Download")}
          </Button>
          {isAdmin && (
            <Button size="sm" onClick={handleAdd}>
              <PlusIcon className="h-4 w-4" />
              {i18next.t("general:Add")}
            </Button>
          )}
        </div>
      </div>

      {/* Table */}
      <div className="overflow-x-auto rounded-xl border border-border bg-card">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead className="w-10">
                <Checkbox
                  checked={messages.length > 0 && selected.length === messages.length}
                  onCheckedChange={(checked) =>
                    setSelected(checked ? messages.map((m) => m.name) : [])
                  }
                />
              </TableHead>
              <TableHead>{i18next.t("general:Store")}</TableHead>
              {isRealAdmin && <TableHead>{i18next.t("general:Name")}</TableHead>}
              <TableHead className="w-36">{i18next.t("general:Created time")}</TableHead>
              <TableHead>{i18next.t("general:User")}</TableHead>
              <TableHead>{i18next.t("general:Chat")}</TableHead>
              <TableHead>{i18next.t("message:Reply to")}</TableHead>
              <TableHead>{i18next.t("message:Author")}</TableHead>
              <TableHead className="w-16 text-center">{i18next.t("general:Model")}</TableHead>
              {isRealAdmin && <TableHead>{i18next.t("chat:Token count")}</TableHead>}
              <TableHead>{i18next.t("chat:Text token count")}</TableHead>
              {isRealAdmin && <TableHead>{i18next.t("chat:Price")}</TableHead>}
              <TableHead className="w-72">{i18next.t("general:Reasoning text")}</TableHead>
              <TableHead className="w-72">{i18next.t("general:Text")}</TableHead>
              <TableHead>{i18next.t("message:Knowledge")}</TableHead>
              <TableHead className="w-96">{i18next.t("message:Suggestions")}</TableHead>
              <TableHead className="w-48">{i18next.t("message:Error text")}</TableHead>
              <TableHead className="w-48">{i18next.t("message:Comment")}</TableHead>
              <TableHead className="w-24">{i18next.t("general:Is deleted")}</TableHead>
              <TableHead className="w-24">{i18next.t("general:Is alerted")}</TableHead>
              <TableHead className="w-24 text-right">{i18next.t("general:Action")}</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {loading ? (
              <TableRow>
                <TableCell colSpan={colSpan} className="py-16 text-center">
                  <div className="flex items-center justify-center gap-2 text-muted-foreground">
                    <Loader2Icon className="h-4 w-4 animate-spin" />
                    {i18next.t("general:Loading")}
                  </div>
                </TableCell>
              </TableRow>
            ) : messages.length === 0 ? (
              <TableRow>
                <TableCell colSpan={colSpan} className="py-16 text-center text-muted-foreground">
                  {i18next.t("general:No data")}
                </TableCell>
              </TableRow>
            ) : (
              messages.map((msg) => {
                const organization = msg.organization || "admin"
                const provider = msg.modelProvider ? providerMap[msg.modelProvider] : undefined
                return (
                  <TableRow
                    key={msg.name}
                    className={msg.isDeleted ? "bg-muted/40 opacity-60" : ""}
                  >
                    {/* Checkbox */}
                    <TableCell>
                      <Checkbox
                        checked={selected.includes(msg.name)}
                        onCheckedChange={(checked) =>
                          setSelected((prev) =>
                            checked
                              ? [...prev, msg.name]
                              : prev.filter((n) => n !== msg.name)
                          )
                        }
                      />
                    </TableCell>

                    {/* Store */}
                    <TableCell className="text-sm">
                      {msg.store ? (
                        <Link
                          to={`/stores/${msg.owner}/${msg.store}`}
                          className="text-primary hover:underline"
                        >
                          {msg.store}
                        </Link>
                      ) : null}
                    </TableCell>

                    {/* Name (admin only) */}
                    {isRealAdmin && (
                      <TableCell className="text-sm">
                        <Link to={`/messages/${msg.name}`} className="text-primary hover:underline">
                          {msg.name}
                        </Link>
                      </TableCell>
                    )}

                    {/* Created time */}
                    <TableCell className="whitespace-nowrap text-sm text-muted-foreground">
                      {getFormattedDate(msg.createdTime)}
                    </TableCell>

                    {/* User */}
                    <TableCell className="text-sm">
                      {msg.user?.startsWith("u-") ? (
                        msg.user
                      ) : msg.user ? (
                        <a
                          href={getUserProfileUrl(msg.user, organization)}
                          target="_blank"
                          rel="noreferrer"
                          className="text-primary hover:underline"
                        >
                          {msg.user}
                        </a>
                      ) : null}
                    </TableCell>

                    {/* Chat */}
                    <TableCell className="text-sm">
                      {msg.chat ? (
                        <Link to={`/chats/${msg.chat}`} className="text-primary hover:underline">
                          {msg.chat}
                        </Link>
                      ) : null}
                    </TableCell>

                    {/* Reply to */}
                    <TableCell className="text-sm">
                      {msg.replyTo ? (
                        <Link
                          to={`/messages/${msg.replyTo}`}
                          className="text-primary hover:underline"
                        >
                          {msg.replyTo}
                        </Link>
                      ) : null}
                    </TableCell>

                    {/* Author */}
                    <TableCell className="text-sm">
                      {msg.author === "AI" || msg.author?.startsWith("u-") ? (
                        msg.author
                      ) : msg.author ? (
                        <a
                          href={getAuthorProfileUrl(msg.author, organization)}
                          target="_blank"
                          rel="noreferrer"
                          className="text-primary hover:underline"
                        >
                          {msg.author}
                        </a>
                      ) : null}
                    </TableCell>

                    {/* Model */}
                    <TableCell className="text-center">
                      {msg.modelProvider ? (
                        <a
                          href={`/providers/${msg.modelProvider}`}
                          target="_blank"
                          rel="noreferrer"
                          className="inline-flex"
                        >
                          <img
                            src={getProviderLogoURL(
                              provider ?? { category: "Model", type: msg.modelProvider }
                            )}
                            alt={provider?.type ?? msg.modelProvider}
                            title={provider?.type ?? msg.modelProvider}
                            className="mx-auto h-9 w-9 object-contain"
                            onError={(e) => {
                              ;(e.currentTarget as HTMLImageElement).style.display = "none"
                            }}
                          />
                        </a>
                      ) : null}
                    </TableCell>

                    {/* Token count (admin only) */}
                    {isRealAdmin && (
                      <TableCell className="text-sm">{msg.tokenCount ?? 0}</TableCell>
                    )}

                    {/* Text token count */}
                    <TableCell className="text-sm">{msg.textTokenCount ?? 0}</TableCell>

                    {/* Price (admin only) */}
                    {isRealAdmin && (
                      <TableCell className="text-sm">
                        {getDisplayPrice(msg.price, msg.currency)}
                      </TableCell>
                    )}

                    {/* Reason text */}
                    <TableCell className="text-sm">
                      {msg.reasonText ? (
                        <Tooltip>
                          <TooltipTrigger asChild>
                            <div
                              className="max-w-72 cursor-pointer line-clamp-5 whitespace-pre-wrap break-words [&_p]:m-0"
                              dangerouslySetInnerHTML={{ __html: getShortText(msg.reasonText, 500) }}
                            />
                          </TooltipTrigger>
                          <TooltipContent side="left" className="max-h-96 max-w-2xl overflow-auto whitespace-pre-wrap break-words">
                            <div dangerouslySetInnerHTML={{ __html: msg.reasonText }} />
                          </TooltipContent>
                        </Tooltip>
                      ) : null}
                    </TableCell>

                    {/* Text */}
                    <TableCell className="text-sm">
                      <LongTextCell text={msg.text} />
                    </TableCell>

                    {/* Knowledge (vectorScores) */}
                    <TableCell>
                      <div className="flex flex-wrap gap-1">
                        {msg.vectorScores?.map((vs) => (
                          <a
                            key={vs.vector}
                            href={`/vectors/${vs.vector}`}
                            target="_blank"
                            rel="noreferrer"
                          >
                            <Badge variant="secondary" className="mt-1 font-mono">
                              {vs.score}
                            </Badge>
                          </a>
                        ))}
                      </div>
                    </TableCell>

                    {/* Suggestions */}
                    <TableCell>
                      <div className="flex flex-wrap gap-1">
                        {msg.suggestions?.map((s) => (
                          <Badge
                            key={s.text}
                            variant={s.isHit ? "default" : "outline"}
                          >
                            {s.text}
                          </Badge>
                        ))}
                      </div>
                    </TableCell>

                    {/* Error text */}
                    <TableCell className="text-sm">
                      <div
                        className="max-w-48"
                        dangerouslySetInnerHTML={{ __html: msg.errorText || "" }}
                      />
                    </TableCell>

                    {/* Comment */}
                    <TableCell className="text-sm">
                      <div
                        className="max-w-48"
                        dangerouslySetInnerHTML={{ __html: msg.comment || "" }}
                      />
                    </TableCell>

                    {/* Is deleted */}
                    <TableCell>
                      <Switch checked={!!msg.isDeleted} disabled />
                    </TableCell>

                    {/* Is alerted */}
                    <TableCell>
                      <Switch checked={!!msg.isAlerted} disabled />
                    </TableCell>

                    {/* Action */}
                    <TableCell className="text-right">
                      <div className="flex items-center justify-end gap-1">
                        <Button
                          variant="ghost"
                          size="icon"
                          className="h-7 w-7"
                          title={i18next.t("general:Edit")}
                          onClick={() => navigate(`/messages/${msg.name}`)}
                        >
                          <EditIcon className="h-3.5 w-3.5" />
                        </Button>
                        {isAdmin && (
                          <Button
                            variant="ghost"
                            size="icon"
                            className="h-7 w-7 text-destructive hover:text-destructive"
                            title={i18next.t("general:Delete")}
                            onClick={() => setDeleteTarget(msg)}
                          >
                            <Trash2Icon className="h-3.5 w-3.5" />
                          </Button>
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
        <div className="flex flex-wrap items-center justify-between gap-2 text-sm text-muted-foreground">
          <span>
            {i18next.t("general:{total} in total").replace("{total}", String(pagination.total))}
          </span>
          <div className="flex items-center gap-2">
            <Select
              value={String(pagination.pageSize)}
              onValueChange={(v) => fetchMessages({ current: 1, pageSize: Number(v) })}
            >
              <SelectTrigger className="h-8 w-28">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {PAGE_SIZE_OPTIONS.map((n) => (
                  <SelectItem key={n} value={String(n)}>
                    {n}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <Button
              variant="outline"
              size="sm"
              disabled={pagination.current <= 1}
              onClick={() => fetchMessages({ current: pagination.current - 1 })}
            >
              {i18next.t("general:Previous")}
            </Button>
            <span className="px-2">
              {pagination.current} / {totalPages}
            </span>
            <Button
              variant="outline"
              size="sm"
              disabled={pagination.current >= totalPages}
              onClick={() => fetchMessages({ current: pagination.current + 1 })}
            >
              {i18next.t("general:Next")}
            </Button>
          </div>
        </div>
      )}

      {/* Single delete dialog */}
      <AlertDialog open={!!deleteTarget}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>{i18next.t("general:Sure to delete")}</AlertDialogTitle>
            <AlertDialogDescription>{deleteTarget?.name}</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel onClick={() => setDeleteTarget(null)}>
              {i18next.t("general:Cancel")}
            </AlertDialogCancel>
            <AlertDialogAction
              variant="destructive"
              onClick={() => deleteTarget && handleDelete(deleteTarget)}
            >
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
            <AlertDialogCancel onClick={() => setBulkDeleteOpen(false)}>
              {i18next.t("general:Cancel")}
            </AlertDialogCancel>
            <AlertDialogAction variant="destructive" onClick={handleBulkDelete}>
              {i18next.t("general:OK")}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  )
}
